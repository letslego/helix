import { ActionableEnv } from "./actionable-env.js";
import type {
  Action,
  EnvResetResponse,
  EnvResponse,
  EvaluationResult,
  Observation,
  StepInfo,
} from "./types.js";

/** Composable wrapper around an inner ActionableEnv. */
export abstract class EnvHarness extends ActionableEnv {
  protected _inner: ActionableEnv | null = null;

  constructor(inner: ActionableEnv | null = null) {
    super();
    this._inner = inner;
  }

  static harnessType(): string {
    throw new Error(
      `${this.name}.harnessType() is not set. Decorate the class with registerHarness('<tag>') or override harnessType() manually.`,
    );
  }

  static override envType(): string {
    return this.harnessType();
  }

  get inner(): ActionableEnv {
    if (this._inner === null) {
      throw new Error(
        `${this.constructor.name} has no inner env bound. Pass inner= at construction, or use the persistence loader which attaches inner during stack construction.`,
      );
    }
    return this._inner;
  }

  attach(inner: ActionableEnv): this {
    this._inner = inner;
    return this;
  }

  override reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse {
    return this.inner.reset(seed, options);
  }

  override step(action: Action): EnvResponse {
    return this.inner.step(action);
  }

  override observe(): Observation {
    return this.inner.observe();
  }

  override evaluate(): EvaluationResult {
    return this.inner.evaluate();
  }

  override getEnvState(): unknown {
    return this.inner.getEnvState();
  }

  override stepReward(stepInfo: StepInfo): number {
    return this.inner.stepReward(stepInfo);
  }

  override notifyReplayComplete(): void {
    this.inner.notifyReplayComplete();
  }

  override defaultResetArgs(): [number | null, Record<string, unknown>] {
    return this.inner.defaultResetArgs();
  }

  override resetAfterLoad(): boolean {
    return this.inner.resetAfterLoad();
  }

  override close(): void {
    try {
      this.inner.close();
    } finally {
      this._inner = null;
    }
  }

  static override envStateSchema(): string {
    return "(see inner env's envStateSchema())";
  }

  abstract saveState(): Record<string, unknown>;

  static fromState(_state: Record<string, unknown>, _inner?: ActionableEnv | null): EnvHarness {
    throw new Error(`${this.name}.fromState is not implemented.`);
  }
}

export function isEnvHarness(value: unknown): value is EnvHarness {
  return value instanceof EnvHarness;
}
