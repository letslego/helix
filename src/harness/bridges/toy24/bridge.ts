import { ActionableEnv } from "../../actionable-env.js";
import { registerEnv } from "../../registry.js";
import type { Action, EnvResetResponse, EnvResponse, EvaluationResult, Observation } from "../../types.js";
import { generatePuzzle } from "./solver.js";
import { createToy24State, type Toy24State } from "./state.js";
import { TOY24_TOOLS } from "./tools.js";

const EPS = 1e-6;

export type { Toy24State };

export class Toy24Env extends ActionableEnv {
  static override toolRegistry = TOY24_TOOLS;
  state: Toy24State = createToy24State();
  private lastResetSeed: number | null = null;
  private lastResetOptions: Record<string, unknown> = {};

  override reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse {
    const opts = options ?? {};
    let nums: number[];
    if ("numbers" in opts && Array.isArray(opts.numbers)) {
      nums = [...(opts.numbers as number[])];
    } else {
      const rng = seededRandom(seed ?? 0);
      nums = generatePuzzle(String(opts.difficulty ?? "easy"), Number(opts.target ?? 24), false, rng);
    }
    this.state = createToy24State({
      target: Number(opts.target ?? 24),
      initialNumbers: nums,
      currentNumbers: nums.map((n) => Number(n)),
    });
    this.lastResetSeed = seed ?? null;
    this.lastResetOptions = { ...opts };
    return {
      observation: this.observeInternal(),
      info: { taskId: opts.taskId ?? "" },
    };
  }

  override step(action: Action): EnvResponse {
    this.state.stepCount += 1;
    const tool = Toy24Env.toolRegistry.find((t) => t.name === action.name);
    if (!tool) {
      return {
        observation: {
          text: `[unknown tool: ${action.name}]`,
          data: { numbers: [...this.state.currentNumbers] },
        },
        reward: 0,
        terminated: false,
        truncated: false,
        info: { error: "unknown_tool" },
      };
    }
    let result: unknown;
    try {
      result = tool.invoke(this.state, action.kwargs);
    } catch (e) {
      return {
        observation: {
          text: `[bad args: ${e instanceof Error ? e.message : String(e)}]`,
          data: { numbers: [...this.state.currentNumbers] },
        },
        reward: 0,
        terminated: false,
        truncated: false,
        info: { error: "bad_args" },
      };
    }
    const terminated = this.state.stopped;
    const reward = this.state.stopped && this.state.success ? 1 : 0;
    return {
      observation: this.observeInternal(String(result)),
      reward,
      terminated,
      truncated: false,
      info: {
        success: this.state.stopped ? this.state.success : null,
        result,
      },
    };
  }

  override evaluate(): EvaluationResult {
    return {
      success: this.state.stopped && this.state.success,
      score: this.state.stopped && this.state.success ? 1 : 0,
      metrics: {
        steps: this.state.stepCount,
        historyLen: this.state.history.length,
      },
    };
  }

  override getEnvState(): Toy24State {
    return this.state;
  }

  override observe(): Observation {
    return this.observeInternal();
  }

  override defaultResetArgs(): [number | null, Record<string, unknown>] {
    return [this.lastResetSeed, { ...this.lastResetOptions }];
  }

  override resetAfterLoad(): boolean {
    return !this.state.initialNumbers.length;
  }

  static override envStateSchema(): string {
    return (
      "env_state is a Toy24State object with these fields:\n" +
      "  target: number\n" +
      "  initialNumbers: number[]\n" +
      "  currentNumbers: number[]\n" +
      "  history: string[]\n" +
      "  stopped: boolean\n" +
      "  success: boolean\n" +
      "  stepCount: number\n" +
      "  extras: Record<string, unknown>\n" +
      "S0 changes go through inEnvActions (Setup layer), not Rules."
    );
  }

  override saveState(): Record<string, unknown> {
    return {
      target: this.state.target,
      initialNumbers: [...this.state.initialNumbers],
      currentNumbers: [...this.state.currentNumbers],
      history: [...this.state.history],
      stopped: this.state.stopped,
      success: this.state.success,
      stepCount: this.state.stepCount,
      extras: { ...this.state.extras },
      resetSeed: this.lastResetSeed,
      resetOptions: { ...this.lastResetOptions },
    };
  }

  static override fromState(state: Record<string, unknown>): Toy24Env {
    const env = new Toy24Env();
    env.state = createToy24State({
      target: Number(state.target ?? 24),
      initialNumbers: [...((state.initialNumbers as number[]) ?? [])],
      currentNumbers: [...((state.currentNumbers as number[]) ?? [])],
      history: [...((state.history as string[]) ?? [])],
      stopped: Boolean(state.stopped),
      success: Boolean(state.success),
      stepCount: Number(state.stepCount ?? 0),
      extras: { ...((state.extras as Record<string, unknown>) ?? {}) },
    });
    env.lastResetSeed = (state.resetSeed as number | null) ?? null;
    env.lastResetOptions = { ...((state.resetOptions as Record<string, unknown>) ?? {}) };
    return env;
  }

  private observeInternal(extra = ""): Observation {
    const nums = this.state.currentNumbers.map(fmt).join(", ");
    const history = this.state.history.slice(-5).join(" | ");
    const text =
      `target=${this.state.target}, numbers=[${nums}]` +
      (history ? `. recent: ${history}` : "") +
      (extra ? `. last_result: ${extra}` : "");
    return {
      text,
      data: {
        numbers: [...this.state.currentNumbers],
        target: this.state.target,
        history: [...this.state.history],
        stepCount: this.state.stepCount,
      },
    };
  }
}

registerEnv("toy24")(Toy24Env);

function fmt(x: number): string {
  if (Math.abs(x - Math.round(x)) < EPS) return String(Math.round(x));
  return x.toFixed(4).replace(/\.?0+$/, "");
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
