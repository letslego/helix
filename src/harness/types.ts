/** Core data contracts shared across the harness framework. */

export interface Action {
  name: string;
  kwargs: Record<string, unknown>;
}

export interface Blocked {
  kind: "blocked";
  reason: string;
}

export function blocked(reason = ""): Blocked {
  return { kind: "blocked", reason };
}

export function isBlocked(value: Action | Blocked): value is Blocked {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "blocked";
}

export interface Observation {
  text: string;
  data: Record<string, unknown>;
}

export interface EnvResponse {
  observation: Observation;
  reward: number;
  terminated: boolean;
  truncated: boolean;
  info: Record<string, unknown>;
}

export interface EnvResetResponse {
  observation: Observation;
  info: Record<string, unknown>;
}

export interface EvaluationResult {
  success: boolean;
  score: number;
  metrics: Record<string, unknown>;
}

export interface Step {
  rawAction: Action;
  filteredAction?: Action | null;
  blockedReason?: string | null;
  rawObservation?: Observation | null;
  filteredObservation?: Observation | null;
  rawReward: number;
  filteredReward: number;
  terminated: boolean;
  truncated: boolean;
  info: Record<string, unknown>;
  policyRawResponse?: string | null;
  processReward: number;
  processRewardError?: string | null;
}

export interface StepInfo {
  step: Step;
  stepNumber: number;
  history: Step[];
}

export interface Candidate {
  rulesCode: string;
  inEnvActions: Action[];
  rationale: string;
}

export type Decision = "accept" | "refine" | "reject";

export interface FailureAnalysis {
  primaryAxis?: "S0" | "A" | "O" | "T" | "R" | "task_understanding" | "none" | null;
  label: string;
  description: string;
}

export interface DecideResult {
  decision: Decision;
  failureAnalysis?: FailureAnalysis | null;
  rationale: string;
}

export interface Trace {
  episodeId: string;
  iterationId: string;
  taskId: string;
  candidate: Candidate;
  candidateId: string;
  rolloutIdx: number;
  rolloutSeed?: number | null;
  steps: Step[];
  finalReward: number;
  success: boolean;
  failureAnalysis?: FailureAnalysis | null;
  durationSteps: number;
  kind: "accepted" | "exploration" | "baseline";
  policyModelId: string;
  policySeed?: number | null;
  error?: string | null;
  subprocessStderr?: string | null;
}

export interface TaskSummary {
  taskIdx: number;
  instanceId: string;
  brief: string;
  metadata: Record<string, unknown>;
}

export interface ResetOptions {
  seed?: number | null;
  options?: Record<string, unknown> | null;
}
