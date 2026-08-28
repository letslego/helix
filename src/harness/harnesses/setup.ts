import { EnvHarness } from "../env-harness.js";
import { registerHarness } from "../registry.js";
import type { ActionableEnv } from "../actionable-env.js";
import type { Action, EnvResetResponse } from "../types.js";

/** Replay a fixed action sequence on every reset to land on a mutated starting state. */
export class Setup extends EnvHarness {
  actions: Action[];

  constructor(inner: ActionableEnv | null = null, actions: Action[] | null = null) {
    super(inner);
    this.actions = [...(actions ?? [])];
  }

  override reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse {
    const resetResp = this.inner.reset(seed, options);
    for (const action of this.actions) {
      this.inner.step(action);
    }
    if (this.actions.length > 0) {
      this.inner.notifyReplayComplete();
    }
    return {
      observation: this.inner.observe(),
      info: { ...resetResp.info },
    };
  }

  override saveState(): Record<string, unknown> {
    return {
      actions: this.actions.map((a) => ({ name: a.name, kwargs: { ...a.kwargs } })),
    };
  }

  static override fromState(
    state: Record<string, unknown>,
    inner: ActionableEnv | null = null,
  ): Setup {
    const rawActions = (state.actions as unknown[]) ?? [];
    const actions: Action[] = [];
    for (let i = 0; i < rawActions.length; i++) {
      const a = rawActions[i];
      if (typeof a !== "object" || a === null || !("name" in a)) {
        throw new Error(
          `Setup.fromState: actions[${i}] must be a dict with a 'name' field; got ${JSON.stringify(a)}`,
        );
      }
      const rec = a as Record<string, unknown>;
      actions.push({
        name: String(rec.name),
        kwargs: { ...((rec.kwargs as Record<string, unknown>) ?? {}) },
      });
    }
    return new Setup(inner, actions);
  }

  append(action: Action): void {
    this.actions.push(action);
  }
}

registerHarness("setup")(Setup);
