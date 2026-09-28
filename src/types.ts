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

export type ApprovalMode = "always" | "once" | "never" | "when";

export interface ApprovalPolicy {
  mode: ApprovalMode;
  predicate?: (input: Record<string, unknown>) => boolean;
}

export type ModelToolOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  requiresApproval?: boolean;
  approval?: ApprovalPolicy;
  toModelOutput?: (output: unknown) => ModelToolOutput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (
    input: any,
    ctx: ToolContext,
  ) =>
    | unknown
    | Promise<unknown>
    | AsyncGenerator<unknown, unknown, unknown>;
}

export interface ToolContext {
  sessionId: string;
  callId: string;
  toolName: string;
  abortSignal: AbortSignal;
  memory: MemoryStore;
  sandbox: SandboxHandle;
  connections: ConnectionRegistry;
  getSandbox: () => SandboxHandle;
  getSkill: (name: string) => SkillDefinition | undefined;
  emit: (event: RuntimeEvent) => void;
  runSubagent: (name: string, task: string) => Promise<string>;
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
  description?: string;
  gateway?: GatewayConfig;
  /** Domain-aware specialist routing (subagent selection). */
  domains?: DomainRouterConfig;
}

export interface GatewayConfig {
  /** Named routes: intent keyword -> model id */
  routes?: Record<string, string>;
  defaultModel?: string;
}

/** Capability card used by the domain router to pick specialist subagents. */
export interface DomainCard {
  /** Usually matches a subagent name. */
  id: string;
  description: string;
  /** Phrases / situations when this domain should run. */
  whenToUse: string[];
  /** Phrases that should exclude this domain. */
  notFor?: string[];
  /** Extra keyword triggers. */
  keywords?: string[];
  /** Informational tool names owned by this domain. */
  tools?: string[];
  /** Eligible for parallel fan-out when multiple domains match. */
  preferParallel?: boolean;
}

export interface DomainRouterConfig {
  /** Minimum score for a domain to be selected (default 1). */
  minScore?: number;
  /** Max domains to select (default 3). */
  maxDomains?: number;
  /** Prefer parallel when multiple domains match (default true). */
  parallel?: boolean;
  /** Explicit cards; merged over cards derived from subagents. */
  cards?: DomainCard[];
}

export interface DomainRouteHit {
  id: string;
  score: number;
  reasons: string[];
  preferParallel?: boolean;
}

export interface DomainRoutePlan {
  domains: string[];
  mode: "none" | "serial" | "parallel";
  reason: string;
  hits: DomainRouteHit[];
}

export interface ProviderConfig {
  baseUrl?: string;
  apiKeyEnv?: string;
  mock?: boolean;
}

export interface SandboxConfig {
  backend?: "local" | "none";
  root?: string;
  allowNetwork?: boolean;
  bootstrap?: string[];
  /** Seed files copied into sandbox/workspace on create. */
  workspaceSeed?: string;
}

export interface SandboxHandle {
  root: string;
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
  list(path?: string): string[];
  exec(command: string): { stdout: string; stderr: string; exitCode: number };
  glob?(pattern: string): string[];
  grep?(
    pattern: string,
    path?: string,
  ): Array<{ path: string; line: number; text: string }>;
  bash?(command: string): { stdout: string; stderr: string; exitCode: number };
}

export interface ChannelDefinition {
  name: string;
  kind: "http" | "web" | "slack" | "discord" | "cron" | "custom";
  description?: string;
  config?: Record<string, unknown>;
}

export interface ConnectionToolContext {
  headers: Record<string, string>;
  url?: string;
}

export interface ConnectionDefinition {
  name: string;
  description: string;
  kind: "mcp" | "openapi" | "http" | "oauth";
  url?: string;
  authEnv?: string;
  headers?: Record<string, string>;
  tools?: Array<{
    name: string;
    description: string;
    handler: (
      input: Record<string, unknown>,
      ctx?: ConnectionToolContext,
    ) => Promise<unknown> | unknown;
  }>;
}

export interface ConnectionRegistry {
  list(): ConnectionDefinition[];
  call(connection: string, tool: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface SubagentDefinition {
  name: string;
  description: string;
  instructions: string;
  config: AgentConfig;
  tools: ToolDefinition[];
  isolatedSandbox?: boolean;
  /** Optional capability card; defaults are derived from description/tools. */
  domain?: Omit<DomainCard, "id"> & { id?: string };
}

export interface ScheduleDefinition {
  name: string;
  cron: string;
  prompt: string;
  description?: string;
}

export interface EvalCase {
  name: string;
  input: string;
  expectIncludes?: string[];
  expectTools?: string[];
}

export interface EvalSuite {
  name: string;
  cases: EvalCase[];
}

export interface EvalResult {
  name: string;
  passed: boolean;
  details: string[];
  reply?: string;
  toolsUsed?: string[];
}

export interface LoadedAgent {
  rootDir: string;
  instructions: string;
  config: AgentConfig;
  tools: ToolDefinition[];
  skills: SkillDefinition[];
  policies: PolicyConfig;
  sandbox: SandboxConfig;
  channels: ChannelDefinition[];
  connections: ConnectionDefinition[];
  subagents: SubagentDefinition[];
  /** Capability cards for domain-aware routing (from subagents + overrides). */
  domains: DomainCard[];
  schedules: ScheduleDefinition[];
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

export type RuntimeEventType =
  | "session.start"
  | "model.request"
  | "model.response"
  | "tool.call"
  | "tool.partial"
  | "tool.result"
  | "approval.requested"
  | "approval.resolved"
  | "memory.write"
  | "checkpoint"
  | "sandbox.exec"
  | "connection.call"
  | "subagent.start"
  | "subagent.end"
  | "domain.route"
  | "schedule.fire"
  | "gateway.route"
  | "workflow.step.start"
  | "workflow.step.done"
  | "workflow.step.error"
  | "workflow.replay"
  | "workflow.park"
  | "session.end"
  | "error";

export interface RuntimeEvent {
  type: RuntimeEventType;
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
  approvedToolKeys?: string[];
  workflowId?: string;
  channel?: string;
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
  workflowId?: string;
  reply: string;
  usage: TokenUsage;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  events: RuntimeEvent[];
  parked?: boolean;
  modelUsed?: string;
}
