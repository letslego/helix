import { randomUUID } from "node:crypto";
import { approvalKey, needsApproval } from "./approval.js";
import { createBuiltinTools } from "./builtin-tools.js";
import { createConnectionRegistry } from "./connections.js";
import { modelChain, resolveModel } from "./gateway.js";
import { createMemoryStore, defaultMemoryPath } from "./memory.js";
import { completeWithFallback } from "./provider.js";
import { createSandbox } from "./sandbox.js";
import { DurableStore } from "./store.js";
import { runToolExecute } from "./tools.js";
import { WorkflowWorld } from "./workflow.js";
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
  /** Resume a parked/crashed workflow turn (step results replay). */
  workflowId?: string;
  autoApprove?: boolean;
  channel?: string;
  onEvent?: (event: RuntimeEvent) => void;
}

export class HelixRuntime {
  readonly store: DurableStore;
  readonly workflows: WorkflowWorld;
  private memory;
  private sandbox;
  private connections;
  private tools: ToolDefinition[];

  constructor(private agent: LoadedAgent) {
    this.store = new DurableStore(agent.rootDir);
    this.workflows = new WorkflowWorld(agent.rootDir);
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
    session.approvedToolKeys ??= [];

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

    // One workflow run per turn. Pass workflowId to resume a parked/crashed turn
    // so completed steps replay instead of re-executing.
    const existing =
      (options.workflowId && this.workflows.get(options.workflowId)) ||
      (session.status === "parked" &&
        session.workflowId &&
        this.workflows.get(session.workflowId)) ||
      null;
    const workflow = existing ?? this.workflows.create(session.id, { channel: options.channel });
    if (workflow.status === "parked") this.workflows.resume(workflow);
    session.workflowId = workflow.id;
    const wf = this.workflows.bind(workflow, emit);
    const resuming = Boolean(existing && existing.steps.length > 0);

    emit("session.start", {
      message: options.message,
      channel: options.channel,
      workflowId: workflow.id,
      resuming,
    });
    if (!resuming) {
      session.messages.push({ role: "user", content: options.message });
    }

    const routed = resolveModel(options.message, agent.config);
    emit("gateway.route", routed);
    const models = modelChain(routed.model, agent.config);

    const toolCalls: RunResult["toolCalls"] = [];
    const system = buildSystemPrompt(agent, this.memory.list());
    let parked = false;
    let modelUsed = routed.model;
    const abort = new AbortController();

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

    const skills = "skills" in agent ? agent.skills : [];

    for (let stepIdx = 0; stepIdx < (agent.config.maxSteps ?? 8); stepIdx++) {
      if (
        agent.config.costBudgetUsd != null &&
        session.usage.estimatedCostUsd >= agent.config.costBudgetUsd
      ) {
        emit("error", { reason: "cost_budget_exceeded" });
        break;
      }

      const response = await wf.step(`model:${stepIdx}`, async () => {
        emit("model.request", { step: stepIdx, models, workflowId: workflow.id });
        const result = await completeWithFallback(
          models,
          {
            messages: [{ role: "system", content: system }, ...session.messages],
            tools,
            temperature: agent.config.temperature ?? 0.2,
          },
          agent.config.provider ?? { mock: true },
        );
        emit("model.response", {
          modelUsed: result.modelUsed,
          content: result.content,
          toolCalls: result.toolCalls,
          usage: result.usage,
        });
        return result;
      });

      modelUsed = response.modelUsed;
      if (!wf.wasReplayed(`model:${stepIdx}`)) {
        addUsage(session.usage, response.usage);
      }

      const modelStep = `model:${stepIdx}`;
      const modelReplayed = wf.wasReplayed(modelStep);

      if (!response.toolCalls.length) {
        if (!modelReplayed) {
          session.messages.push({ role: "assistant", content: response.content });
          this.memory.write({
            kind: "episode",
            content: options.message,
            tags: ["user-request"],
          });
          emit("memory.write", { kind: "episode" });
        }
        session.status = "completed";
        this.workflows.complete(workflow);
        this.store.saveSession(session);
        emit("session.end", { status: session.status, workflowId: workflow.id });
        return {
          sessionId: session.id,
          workflowId: workflow.id,
          reply: response.content,
          usage: session.usage,
          toolCalls,
          events,
          modelUsed,
        };
      }

      if (!modelReplayed) {
        session.messages.push({
          role: "assistant",
          content:
            response.content ||
            `(calling ${response.toolCalls.map((t) => t.name).join(", ")})`,
        });
      }

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

        const prior = new Set(session.approvedToolKeys ?? []);
        const policyNeeds = needsApproval(
          tool.approval,
          tool.requiresApproval,
          call.arguments,
          prior,
          tool.name,
        );
        const listed = this.agent.policies?.requireApprovalFor.includes(tool.name);
        const mustApprove = policyNeeds || Boolean(listed);

        if (mustApprove && !options.autoApprove) {
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
          emit("approval.requested", { approval, workflowId: workflow.id });
          wf.park("awaiting_approval", { approvalId: approval.id, tool: tool.name });
          parked = true;
          emit("session.end", { status: session.status, workflowId: workflow.id });
          return {
            sessionId: session.id,
            workflowId: workflow.id,
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

        if (options.autoApprove && mustApprove) {
          session.approvedToolKeys = [
            ...(session.approvedToolKeys ?? []),
            approvalKey(tool.name, call.arguments),
          ];
        }

        const stepName = `tool:${stepIdx}:${call.id}:${tool.name}`;
        const output = await wf.step(stepName, async () => {
          emit("tool.call", {
            name: tool.name,
            input: call.arguments,
            callId: call.id,
            workflowId: workflow.id,
          });

          const parsed = tool.inputSchema.safeParse(call.arguments);
          if (!parsed.success) {
            const err = { error: parsed.error.message };
            emit("tool.result", { name: tool.name, output: err, callId: call.id });
            return { raw: err, forModel: err };
          }

          const executed = await runToolExecute(
            tool,
            parsed.data,
            {
              sessionId: session.id,
              callId: call.id,
              toolName: tool.name,
              abortSignal: abort.signal,
              memory: this.memory,
              sandbox: this.sandbox,
              connections: this.connections,
              getSandbox: () => this.sandbox,
              getSkill: (name) => skills.find((s) => s.name === name),
              emit: (e) => {
                events.push(e);
                this.store.appendEvent(e);
                options.onEvent?.(e);
              },
              runSubagent,
            },
          );

          emit("tool.result", {
            name: tool.name,
            output: executed.raw,
            modelOutput: executed.forModel,
            callId: call.id,
          });
          return executed;
        });

        toolCalls.push({
          name: tool.name,
          input: call.arguments,
          output: output.raw,
        });
        if (!wf.wasReplayed(stepName)) {
          session.messages.push({
            role: "tool",
            name: tool.name,
            toolCallId: call.id,
            content: JSON.stringify(output.forModel),
          });
        }
      }

      if (parked) break;
    }

    const lastAssistant = [...session.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    session.status = parked ? "parked" : "completed";
    if (!parked) this.workflows.complete(workflow);
    this.store.saveSession(session);
    emit("session.end", { status: session.status, workflowId: workflow.id });

    return {
      sessionId: session.id,
      workflowId: workflow.id,
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
    if (approve) {
      session.approvedToolKeys = [
        ...(session.approvedToolKeys ?? []),
        approvalKey(approval.toolName, approval.input),
      ];
    }
    if (session.workflowId) {
      const run = this.workflows.get(session.workflowId);
      if (run) this.workflows.resume(run);
    }
    this.store.saveSession(session);
    this.store.appendEvent({
      type: "approval.resolved",
      at: new Date().toISOString(),
      sessionId,
      data: { approvalId, approve, workflowId: session.workflowId },
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

export type { SubagentDefinition };
