import type { ToolClass } from "./tool.js";
import { toolSchemas } from "./tool.js";
import type {
  Action,
  EnvResetResponse,
  EnvResponse,
  EvaluationResult,
  Observation,
  ResetOptions,
  StepInfo,
  TaskSummary,
} from "./types.js";

/** Universal env interface — every benchmark implements this directly. */
export abstract class ActionableEnv {
  static toolRegistry: ToolClass[] = [];

  static envType(): string {
    throw new Error(
      `${this.name}.envType() is not set. Decorate the class with registerEnv('<tag>') or override envType() manually.`,
    );
  }

  abstract reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse;
  abstract step(action: Action): EnvResponse;
  abstract observe(): Observation;
  abstract evaluate(): EvaluationResult;
  abstract getEnvState(): unknown;
  abstract saveState(): Record<string, unknown>;

  static fromState(_state: Record<string, unknown>): ActionableEnv {
    throw new Error(`${this.name}.fromState is not implemented.`);
  }

  static toolSchemas(): ReturnType<typeof toolSchemas> {
    return toolSchemas(this.toolRegistry);
  }

  static envStateSchema(): string {
    return "(no env_state schema declared)";
  }

  defaultResetArgs(): [number | null, Record<string, unknown>] {
    return [null, {}];
  }

  resetAfterLoad(): boolean {
    return true;
  }

  stepReward(_stepInfo: StepInfo): number {
    return 0;
  }

  notifyReplayComplete(): void {
    return;
  }

  static listTasks(_resetOptions?: Record<string, unknown> | null, _limit?: number | null): TaskSummary[] {
    throw new Error(
      `${this.name} does not implement listTasks(). Set mutatorSelectsTasks=false or implement listTasks() on this env.`,
    );
  }

  close(): void {
    return;
  }
}

export function isActionableEnv(value: unknown): value is ActionableEnv {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ActionableEnv).reset === "function" &&
    typeof (value as ActionableEnv).step === "function" &&
    typeof (value as ActionableEnv).observe === "function" &&
    typeof (value as ActionableEnv).evaluate === "function" &&
    typeof (value as ActionableEnv).getEnvState === "function" &&
    typeof (value as ActionableEnv).saveState === "function"
  );
}

export type { ResetOptions };
