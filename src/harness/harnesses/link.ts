import { ActionableEnv } from "../actionable-env.js";
import { EnvHarness } from "../env-harness.js";
import { registerHarness } from "../registry.js";
import type { Action, EnvResetResponse, EnvResponse, EvaluationResult, Observation, StepInfo } from "../types.js";

const DONE_VIA_CHOICES = new Set(["submitted", "terminated"]);

/** Serial composition of two ActionableEnvs into one long-horizon episode. */
export class Link extends EnvHarness {
  private _envB: ActionableEnv | null;
  private _carryContext: boolean;
  private _aDoneVia: "submitted" | "terminated";
  private _carryChars: number;
  private _stage: "A" | "B" = "A";
  private _aSuccess = false;
  private _aEvaluated = false;
  private _aEvalError: string | null = null;
  private _bSuccess = false;
  private _bEvaluated = false;
  private _bEvalError: string | null = null;
  private _lastObsA: Observation | null = null;
  private _bResetSeed: number | null = null;
  private _bResetOpts: Record<string, unknown> | null = null;

  constructor(
    envA: ActionableEnv | null = null,
    envB: ActionableEnv | null = null,
    options: {
      carryContext?: boolean;
      aDoneVia?: "submitted" | "terminated";
      carryChars?: number;
    } = {},
  ) {
    const aDoneVia = options.aDoneVia ?? "submitted";
    if (!DONE_VIA_CHOICES.has(aDoneVia)) {
      throw new Error(`Link.aDoneVia must be one of submitted|terminated; got ${JSON.stringify(aDoneVia)}`);
    }
    super(envA);
    this._envB = envB;
    this._carryContext = options.carryContext ?? true;
    this._aDoneVia = aDoneVia;
    this._carryChars = options.carryChars ?? 1500;
  }

  get envA(): ActionableEnv {
    return this.inner;
  }

  get envB(): ActionableEnv {
    if (this._envB === null) {
      throw new Error("Link has no env_b bound.");
    }
    return this._envB;
  }

  get stage(): "A" | "B" {
    return this._stage;
  }

  override reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse {
    this._stage = "A";
    this._aSuccess = false;
    this._aEvaluated = false;
    this._aEvalError = null;
    this._bSuccess = false;
    this._bEvaluated = false;
    this._bEvalError = null;
    this._lastObsA = null;

    const opts = options ?? {};
    const [aOpts, bOpts, linkOpts] = Link.splitOptions(opts);

    if (linkOpts !== null) {
      if ("carryContext" in linkOpts) this._carryContext = Boolean(linkOpts.carryContext);
      if ("aDoneVia" in linkOpts) {
        const v = linkOpts.aDoneVia;
        if (v !== "submitted" && v !== "terminated") {
          throw new Error(`options.link.aDoneVia must be one of submitted|terminated; got ${JSON.stringify(v)}`);
        }
        this._aDoneVia = v;
      }
      if ("carryChars" in linkOpts) this._carryChars = Number(linkOpts.carryChars);
      if ("bSeed" in linkOpts) this._bResetSeed = linkOpts.bSeed as number | null;
    }

    this._bResetOpts = bOpts;
    const r = this.envA.reset(seed, aOpts ?? undefined);
    this._lastObsA = r.observation;
    return {
      observation: r.observation,
      info: { ...r.info, linkStage: "A" },
    };
  }

  static splitOptions(opts: Record<string, unknown>): [
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null,
  ] {
    const reserved = new Set(["a", "b", "link"]);
    if (Object.keys(opts).some((k) => reserved.has(k))) {
      return [
        (opts.a as Record<string, unknown> | undefined) ?? null,
        (opts.b as Record<string, unknown> | undefined) ?? null,
        (opts.link as Record<string, unknown> | undefined) ?? null,
      ];
    }
    return [opts, null, null];
  }

  override step(action: Action): EnvResponse {
    return this._stage === "A" ? this.stepA(action) : this.stepB(action);
  }

  private stepA(action: Action): EnvResponse {
    const resp = this.envA.step(action);
    this._lastObsA = resp.observation;

    if (!this.aIsFinished(resp)) {
      return {
        observation: resp.observation,
        reward: resp.reward,
        terminated: false,
        truncated: false,
        info: { ...resp.info, linkStage: "A" },
      };
    }

    let aEvalError: string | null = null;
    try {
      this._aSuccess = Boolean(this.envA.evaluate().success);
    } catch (e) {
      this._aSuccess = false;
      aEvalError = `${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`;
    }
    this._aEvalError = aEvalError;
    this._aEvaluated = true;

    let rB: EnvResetResponse;
    try {
      rB = this.envB.reset(this._bResetSeed, this._bResetOpts ?? undefined);
    } catch (e) {
      return {
        observation: {
          text: `[Link: env_b.reset failed: ${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}]`,
          data: { linkStage: "failed_at_handoff", aSuccess: this._aSuccess },
        },
        reward: 0,
        terminated: true,
        truncated: false,
        info: {
          linkStage: "failed_at_handoff",
          aSuccess: this._aSuccess,
          aEvalError,
          handoffError: `${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }

    let firstObsB = rB.observation;
    if (this._carryContext) {
      firstObsB = this.spliceHandoff(this._lastObsA, firstObsB);
    }

    this._stage = "B";
    return {
      observation: firstObsB,
      reward: 0,
      terminated: false,
      truncated: false,
      info: {
        linkStage: "switched_to_B",
        aSuccess: this._aSuccess,
        aEvalError,
        ...rB.info,
      },
    };
  }

  private stepB(action: Action): EnvResponse {
    const resp = this.envB.step(action);
    if (!resp.terminated && !resp.truncated) {
      return {
        observation: resp.observation,
        reward: resp.reward,
        terminated: false,
        truncated: false,
        info: { ...resp.info, linkStage: "B" },
      };
    }

    let bEvalError: string | null = null;
    try {
      this._bSuccess = Boolean(this.envB.evaluate().success);
    } catch (e) {
      this._bSuccess = false;
      bEvalError = `${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`;
    }
    this._bEvalError = bEvalError;
    this._bEvaluated = true;

    const combined = this._aSuccess && this._bSuccess;
    return {
      observation: resp.observation,
      reward: combined ? 1 : 0,
      terminated: true,
      truncated: resp.truncated,
      info: {
        ...resp.info,
        linkStage: "done",
        aSuccess: this._aSuccess,
        bSuccess: this._bSuccess,
        bEvalError,
        combinedSuccess: combined,
      },
    };
  }

  override observe(): Observation {
    const active = this._stage === "A" ? this.envA : this.envB;
    return active.observe();
  }

  override evaluate(): EvaluationResult {
    let aSuccess: boolean;
    let aScore: number;
    let aMetrics: Record<string, unknown>;
    if (this._aEvaluated) {
      aSuccess = this._aSuccess;
      aScore = Number(this._aSuccess);
      aMetrics = { cachedAtHandoff: true };
      if (this._aEvalError) aMetrics.evalError = this._aEvalError;
    } else {
      try {
        const a = this.envA.evaluate();
        aSuccess = a.success;
        aScore = a.score;
        aMetrics = a.metrics;
      } catch (e) {
        aSuccess = false;
        aScore = 0;
        aMetrics = {
          notEvaluated: true,
          reason: `${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    let bSuccess: boolean;
    let bScore: number;
    let bMetrics: Record<string, unknown>;
    if (this._bEvaluated) {
      bSuccess = this._bSuccess;
      bScore = Number(this._bSuccess);
      bMetrics = { cachedAtTermination: true };
      if (this._bEvalError) bMetrics.evalError = this._bEvalError;
    } else {
      try {
        const b = this.envB.evaluate();
        bSuccess = b.success;
        bScore = b.score;
        bMetrics = b.metrics;
      } catch (e) {
        bMetrics = {
          notEvaluated: true,
          reason: `${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`,
        };
        bSuccess = false;
        bScore = 0;
      }
    }

    return {
      success: aSuccess && bSuccess,
      score: (aScore + bScore) / 2,
      metrics: {
        aSuccess,
        aScore,
        aMetrics,
        bSuccess,
        bScore,
        bMetrics,
        aVerdictCached: this._aEvaluated,
        bVerdictCached: this._bEvaluated,
        linkStage: this._stage,
        aEvaluatedAtHandoff: this._aEvaluated,
      },
    };
  }

  override getEnvState(): Record<string, unknown> {
    return {
      stage: this._stage,
      aSuccess: this._aSuccess,
      aState: this.envA.getEnvState(),
      bState: this._envB !== null ? this.envB.getEnvState() : null,
      carryContext: this._carryContext,
      aDoneVia: this._aDoneVia,
    };
  }

  override stepReward(stepInfo: StepInfo): number {
    const active = this._stage === "A" ? this.envA : this.envB;
    return active.stepReward(stepInfo);
  }

  override close(): void {
    const errors: [string, unknown][] = [];
    try {
      this.envA.close();
    } catch (e) {
      errors.push(["env_a", e]);
    }
    if (this._envB !== null) {
      try {
        this.envB.close();
      } catch (e) {
        errors.push(["env_b", e]);
      }
    }
    this._inner = null;
    this._envB = null;
    if (errors.length > 0) {
      const [kind, e] = errors[0];
      throw new Error(
        `Link.close: ${kind} raised ${e instanceof Error ? e.constructor.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  override defaultResetArgs(): [number | null, Record<string, unknown>] {
    return this.envA.defaultResetArgs();
  }

  override resetAfterLoad(): boolean {
    return this.envA.resetAfterLoad();
  }

  static override envStateSchema(): string {
    return (
      "Link.env_state = {\n" +
      "  stage: 'A' | 'B' | 'done',\n" +
      "  a_success: bool,\n" +
      "  a_state: <env_a's env_state schema>,\n" +
      "  b_state: <env_b's env_state schema>,\n" +
      "  carry_context: bool,\n" +
      "  a_done_via: 'submitted' | 'terminated',\n" +
      "}"
    );
  }

  override saveState(): Record<string, unknown> {
    throw new Error(
      "Link checkpointing is not supported in checkpoint schema v1. A Link is a TREE (env_a + env_b), but schema v1's dump_stack walks a single chain via self.inner. Re-instantiate Link from a higher-level run config instead.",
    );
  }

  static override fromState(_state: Record<string, unknown>, _inner?: ActionableEnv | null): Link {
    throw new Error("Link.fromState is not supported in checkpoint schema v1; see Link.saveState for context.");
  }

  private aIsFinished(resp: EnvResponse): boolean {
    if (resp.terminated || resp.truncated) return true;
    if (this._aDoneVia === "submitted") {
      return Boolean((resp.info ?? {}).submitted);
    }
    return false;
  }

  private spliceHandoff(lastObsA: Observation | null, firstObsB: Observation): Observation {
    let tail = "";
    if (lastObsA?.text) {
      let t = lastObsA.text;
      if (t.length > this._carryChars) {
        t = `...${t.slice(-this._carryChars)}`;
      }
      tail = `\n\n[end of previous task A -- excerpt of last observation]\n${t}\n`;
    }
    const banner =
      "[Link: SWITCHED TO A NEW TASK. The previous task is over; " +
      "your work on it is preserved in the chat history above but " +
      "the environment below is a DIFFERENT task in a different " +
      "repository. Re-orient before acting.]" +
      `${tail}\n` +
      "[Begin new task B]\n";
    return {
      text: banner + (firstObsB.text ?? ""),
      data: { ...(firstObsB.data ?? {}), linkedFromA: true },
    };
  }
}

registerHarness("link")(Link);
