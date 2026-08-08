import { randomUUID } from "node:crypto";
import { createMemoryStore, defaultMemoryPath } from "./memory.js";
import { completeWithFallback } from "./provider.js";
import { DurableStore } from "./store.js";
import type {
  ApprovalRequest,
  ChatMessage,
  LoadedAgent,
  RunResult,
  RuntimeEvent,
  SessionRecord,
  TokenUsage,
} from "./types.js";

export interface RunOptions {
  message: string;
  sessionId?: string;
  autoApprove?: boolean;
  onEvent?: (event: RuntimeEvent) => void;
}

export class HelixRuntime {
  readonly store: DurableStore;
  private memory;

  constructor(private agent: LoadedAgent) {
    this.store = new DurableStore(agent.rootDir);
    this.memory = createMemoryStore(defaultMemoryPath(agent.rootDir));
  }

  getAgent(): LoadedAgent {
    return this.agent;
  }

  async run(options: RunOptions): Promise<RunResult> {
    const session =
      (options.sessionId && this.store.getSession(options.sessionId)) ||
      this.store.createSession();

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
    };

    emit("session.start", { message: options.message });
    session.messages.push({ role: "user", content: options.message });

    const toolCalls: RunResult["toolCalls"] = [];
    const models = [
      this.agent.config.model ?? "mock/helix-demo",
      ...(this.agent.config.fallbackModels ?? []),
    ];

    const system = buildSystemPrompt(this.agent, this.memory.list());
    let parked = false;

    for (let step = 0; step < (this.agent.config.maxSteps ?? 8); step++) {
      if (
        this.agent.config.costBudgetUsd != null &&
        session.usage.estimatedCostUsd >= this.agent.config.costBudgetUsd
      ) {
        emit("error", { reason: "cost_budget_exceeded" });
        break;
      }

      emit("model.request", { step, models });
      const response = await completeWithFallback(
        models,
        {
          messages: [{ role: "system", content: system }, ...session.messages],
          tools: this.agent.tools,
          temperature: this.agent.config.temperature ?? 0.2,
        },
        this.agent.config.provider ?? { mock: true },
      );
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
        emit("session.end", { status: session.status });
        return {
          sessionId: session.id,
          reply: response.content,
          usage: session.usage,
          toolCalls,
          events,
        };
      }

      session.messages.push({
        role: "assistant",
        content: response.content || `(calling ${response.toolCalls.map((t) => t.name).join(", ")})`,
      });

      let toolCount = 0;
      for (const call of response.toolCalls) {
        if (toolCount >= this.agent.policies.maxToolCallsPerTurn) break;
        toolCount += 1;

        if (this.agent.policies.denyTools.includes(call.name)) {
          const denied = { error: `Tool ${call.name} is denied by policy` };
          session.messages.push({
            role: "tool",
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(denied),
          });
          continue;
        }

        const tool = this.agent.tools.find((t) => t.name === call.name);
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
          this.agent.policies.requireApprovalFor.includes(tool.name);

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
          emit: (e) => {
            events.push(e);
            this.store.appendEvent(e);
            options.onEvent?.(e);
          },
        });

        toolCalls.push({ name: tool.name, input: parsed.data, output });
        session.messages.push({
          role: "tool",
          name: tool.name,
          toolCallId: call.id,
          content: JSON.stringify(output),
        });
        emit("tool.result", { name: tool.name, output });
        emit("checkpoint", { step, tool: tool.name });
      }

      if (parked) break;
    }

    // Remember the user ask for future turns.
    this.memory.write({
      kind: "episode",
      content: options.message,
      tags: ["user-request"],
    });
    emit("memory.write", { kind: "episode" });

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

function buildSystemPrompt(
  agent: LoadedAgent,
  memories: { kind: string; content: string; tags: string[] }[],
): string {
  const skillIndex = agent.skills
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
    "Use tools when they improve accuracy. Prefer concise, actionable answers.",
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

export type { ChatMessage };
