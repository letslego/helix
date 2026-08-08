import type { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  requiresApproval?: boolean;
  execute: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<unknown> | unknown;
}

export interface ToolContext {
  sessionId: string;
  memory: MemoryStore;
  emit: (event: RuntimeEvent) => void;
}

export interface SkillDefinition {
  name: string;
  description: string;
  body: string;
  tags: string[];
}

export interface AgentConfig {
  model?: string;
  fallbackModels?: string[];
  temperature?: number;
  maxSteps?: number;
  provider?: ProviderConfig;
  costBudgetUsd?: number;
}

export interface ProviderConfig {
  /** openai-compatible base URL */
  baseUrl?: string;
  apiKeyEnv?: string;
  /** Use the built-in mock provider (great for demos / CI). */
  mock?: boolean;
}

export interface LoadedAgent {
  rootDir: string;
  instructions: string;
  config: AgentConfig;
  tools: ToolDefinition[];
  skills: SkillDefinition[];
  policies: PolicyConfig;
}

export interface PolicyConfig {
  requireApprovalFor: string[];
  denyTools: string[];
  maxToolCallsPerTurn: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface RuntimeEvent {
  type:
    | "session.start"
    | "model.request"
    | "model.response"
    | "tool.call"
    | "tool.result"
    | "approval.requested"
    | "approval.resolved"
    | "memory.write"
    | "checkpoint"
    | "session.end"
    | "error";
  at: string;
  sessionId: string;
  data?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  usage: TokenUsage;
  status: "active" | "parked" | "completed" | "failed";
  pendingApprovals: ApprovalRequest[];
}

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input: unknown;
  createdAt: string;
  status: "pending" | "approved" | "denied";
}

export interface MemoryStore {
  list(): MemoryEntry[];
  write(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry;
  search(query: string, limit?: number): MemoryEntry[];
}

export interface MemoryEntry {
  id: string;
  kind: "fact" | "episode" | "preference";
  content: string;
  tags: string[];
  createdAt: string;
}

export interface RunResult {
  sessionId: string;
  reply: string;
  usage: TokenUsage;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  events: RuntimeEvent[];
  parked?: boolean;
}
