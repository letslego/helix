import { randomUUID } from "node:crypto";
import { createBuiltinTools } from "./builtin-tools.js";
import { createConnectionRegistry } from "./connections.js";
import { modelChain, resolveModel } from "./gateway.js";
import { createMemoryStore, defaultMemoryPath } from "./memory.js";
import { completeWithFallback } from "./provider.js";
import { createSandbox } from "./sandbox.js";
import { DurableStore } from "./store.js";
import type {
  ApprovalRequest,
  LoadedAgent,
  RunResult,
  RuntimeEvent,
  SessionRecord,
  SubagentDefinition,
  TokenUsage,
  ToolDefinition,
} from "./types.js";

export interface RunOptions {
  message: string;
  sessionId?: string;
  autoApprove?: boolean;
  channel?: string;
  onEvent?: (event: RuntimeEvent) => void;
}

export class HelixRuntime {
  readonly store: DurableStore;
  private memory;
  private sandbox;
  private connections;
  private tools: ToolDefinition[];

  constructor(private agent: LoadedAgent) {
    this.store = new DurableStore(agent.rootDir);
    this.memory = createMemoryStore(defaultMemoryPath(agent.rootDir));
    this.sandbox = createSandbox(agent.rootDir, agent.sandbox);
    this.connections = createConnectionRegistry(agent.connections);
    this.tools = [
      ...agent.tools,
      ...createBuiltinTools({
        hasSandbox: agent.sandbox.backend !== "none",
        connectionNames: agent.connections.map((c) => c.name),
        subagentNames: agent.subagents.map((s) => s.name),
      }),
    ];
  }

  getAgent(): LoadedAgent {
    return this.agent;
  }

  async run(options: RunOptions): Promise<RunResult> {
    return this.runWithAgent(this.agent, this.tools, options);
  }

  async runSchedule(name: string, autoApprove = true): Promise<RunResult> {
    const schedule = this.agent.schedules.find((s) => s.name === name);
    if (!schedule) throw new Error(`Unknown schedule: ${name}`);
    const result = await this.run({
      message: schedule.prompt,
      autoApprove,
      channel: "cron",
    });
    this.store.appendEvent({
      type: "schedule.fire",
      at: new Date().toISOString(),
      sessionId: result.sessionId,
      data: { name, cron: schedule.cron },
    });
    return result;
  }

  private async runWithAgent(
    agent: LoadedAgent | SubagentView,
    tools: ToolDefinition[],
    options: RunOptions,
  ): Promise<RunResult> {
    const session =
      (options.sessionId && this.store.getSession(options.sessionId)) ||
      this.store.createSession();
    if (options.channel) session.channel = options.channel;

    const events: RuntimeEvent[] = [];
    const emit = (type: RuntimeEvent["type"], data?: Record<string, unknown>) => {
      const event: RuntimeEvent = {
        type,
        at: new Date().toISOString(),
        sessionId: session.id,
        data,
      };
      events.push(event);
      this.store.appendEvent(event);
      options.onEvent?.(event);
      return event;
    };

    emit("session.start", { message: options.message, channel: options.channel });
    session.messages.push({ role: "user", content: options.message });

    const routed = resolveModel(options.message, agent.config);
    emit("gateway.route", routed);
    const models = modelChain(routed.model, agent.config);

    const toolCalls: RunResult["toolCalls"] = [];
    const system = buildSystemPrompt(agent, this.memory.list());
    let parked = false;
    let modelUsed = routed.model;

    const runSubagent = async (name: string, task: string) => {
      const sub = this.agent.subagents.find((s) => s.name === name);
      if (!sub) throw new Error(`Unknown subagent: ${name}`);
      emit("subagent.start", { name, task });
      const childTools = [
        ...sub.tools,
        ...createBuiltinTools({
          hasSandbox: this.agent.sandbox.backend !== "none",
          connectionNames: [],
          subagentNames: [],
        }),
      ];
      const child = await this.runWithAgent(
        {
          instructions: sub.instructions,
          config: sub.config,
          skills: [],
        },
        childTools,
        { message: task, autoApprove: true },
      );
      emit("subagent.end", { name, sessionId: child.sessionId });
      return child.reply;
    };

    for (let stepIdx = 0; stepIdx < (agent.config.maxSteps ?? 8); stepIdx++) {
      if (
        agent.config.costBudgetUsd != null &&
        session.usage.estimatedCostUsd >= agent.config.costBudgetUsd
      ) {
        emit("error", { reason: "cost_budget_exceeded" });
        break;
      }

      emit("model.request", { step: stepIdx, models });
      const response = await completeWithFallback(
        models,
        {
          messages: [{ role: "system", content: system }, ...session.messages],
          tools,
          temperature: agent.config.temperature ?? 0.2,
        },
        agent.config.provider ?? { mock: true },
      );
      modelUsed = response.modelUsed;
      addUsage(session.usage, response.usage);
      emit("model.response", {
        modelUsed: response.modelUsed,
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
      });

      if (!response.toolCalls.length) {
        session.messages.push({ role: "assistant", content: response.content });
        session.status = "completed";
        this.store.saveSession(session);
        this.memory.write({
          kind: "episode",
          content: options.message,
          tags: ["user-request"],
        });
        emit("memory.write", { kind: "episode" });
        emit("session.end", { status: session.status });
        return {
          sessionId: session.id,
          reply: response.content,
          usage: session.usage,
          toolCalls,
          events,
          modelUsed,
        };
      }

      session.messages.push({
        role: "assistant",
        content:
          response.content ||
          `(calling ${response.toolCalls.map((t) => t.name).join(", ")})`,
      });

      let toolCount = 0;
      for (const call of response.toolCalls) {
        if (toolCount >= (this.agent.policies?.maxToolCallsPerTurn ?? 12)) break;
        toolCount += 1;

        if (this.agent.policies?.denyTools.includes(call.name)) {
          session.messages.push({
            role: "tool",
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify({ error: `Tool ${call.name} is denied by policy` }),
          });
          continue;
        }

        const tool = tools.find((t) => t.name === call.name);
        if (!tool) {
          session.messages.push({
            role: "tool",
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify({ error: `Unknown tool ${call.name}` }),
          });
          continue;
        }

        const needsApproval =
          tool.requiresApproval ||
          this.agent.policies?.requireApprovalFor.includes(tool.name);

        if (needsApproval && !options.autoApprove) {
          const approval: ApprovalRequest = {
            id: randomUUID(),
            toolName: tool.name,
            input: call.arguments,
            createdAt: new Date().toISOString(),
            status: "pending",
          };
          session.pendingApprovals.push(approval);
          session.status = "parked";
          this.store.saveSession(session);
          emit("approval.requested", { approval });
          emit("checkpoint", { reason: "awaiting_approval" });
          parked = true;
          emit("session.end", { status: session.status });
          return {
            sessionId: session.id,
            reply:
              `Paused for approval before running \`${tool.name}\`. ` +
              `Review the pending approval in the Helix console, then resume.`,
            usage: session.usage,
            toolCalls,
            events,
            parked: true,
            modelUsed,
          };
        }

        emit("tool.call", { name: tool.name, input: call.arguments });
        const parsed = tool.inputSchema.safeParse(call.arguments);
        if (!parsed.success) {
          const err = { error: parsed.error.message };
          session.messages.push({
            role: "tool",
            name: tool.name,
            toolCallId: call.id,
            content: JSON.stringify(err),
          });
          emit("tool.result", { name: tool.name, output: err });
          continue;
        }

        const output = await tool.execute(parsed.data, {
          sessionId: session.id,
          memory: this.memory,
          sandbox: this.sandbox,
          connections: this.connections,
          emit: (e) => {
            events.push(e);
            this.store.appendEvent(e);
            options.onEvent?.(e);
          },
          runSubagent,
        });

        toolCalls.push({ name: tool.name, input: parsed.data, output });
        session.messages.push({
          role: "tool",
          name: tool.name,
          toolCallId: call.id,
          content: JSON.stringify(output),
        });
        emit("tool.result", { name: tool.name, output });
        emit("checkpoint", { step: stepIdx, tool: tool.name });
      }

      if (parked) break;
    }

    const lastAssistant = [...session.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    session.status = parked ? "parked" : "completed";
    this.store.saveSession(session);
    emit("session.end", { status: session.status });

    return {
      sessionId: session.id,
      reply: lastAssistant?.content ?? "No response produced.",
      usage: session.usage,
      toolCalls,
      events,
      parked,
      modelUsed,
    };
  }

  resolveApproval(sessionId: string, approvalId: string, approve: boolean): SessionRecord {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error(`Unknown session ${sessionId}`);
    const approval = session.pendingApprovals.find((a) => a.id === approvalId);
    if (!approval) throw new Error(`Unknown approval ${approvalId}`);
    approval.status = approve ? "approved" : "denied";
    session.status = "active";
    this.store.saveSession(session);
    this.store.appendEvent({
      type: "approval.resolved",
      at: new Date().toISOString(),
      sessionId,
      data: { approvalId, approve },
    });
    return session;
  }
}

type SubagentView = {
  instructions: string;
  config: LoadedAgent["config"];
  skills: LoadedAgent["skills"];
};

function buildSystemPrompt(
  agent: LoadedAgent | SubagentView,
  memories: { kind: string; content: string; tags: string[] }[],
): string {
  const skillIndex = ("skills" in agent ? agent.skills : [])
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");
  const memoryBlock = memories
    .slice(-8)
    .map((m) => `- (${m.kind}) ${m.content}`)
    .join("\n");

  return [
    agent.instructions,
    "",
    "You are running inside Helix, a filesystem-first durable agent runtime.",
    "Use tools, sandbox, connections, and subagents when they improve accuracy.",
    skillIndex ? `Available skills:\n${skillIndex}` : "",
    memoryBlock ? `Recent memory:\n${memoryBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function addUsage(target: TokenUsage, delta: TokenUsage): void {
  target.promptTokens += delta.promptTokens;
  target.completionTokens += delta.completionTokens;
  target.totalTokens += delta.totalTokens;
  target.estimatedCostUsd += delta.estimatedCostUsd;
}

// silence unused import in type-only usage environments
export type { SubagentDefinition };
