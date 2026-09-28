import { loadRulesSubclass } from "../code-loader.js";
import { EnvHarness } from "../env-harness.js";
import { registerHarness } from "../registry.js";
import type { ActionableEnv } from "../actionable-env.js";
import type { Action, Blocked, EnvResetResponse, EnvResponse, Observation } from "../types.js";
import { blocked, isBlocked } from "../types.js";

/** A/T/O code-as-mutation EnvHarness. Subclass to override hooks. */
export class Rules extends EnvHarness {
  rulesCode = "";

  filterAction(action: Action, _envState: unknown): Action | Blocked {
    return action;
  }

  modifyTransition(_action: Action, rawResponse: EnvResponse, _envState: unknown): EnvResponse {
    return rawResponse;
  }

  filterObservation(obs: Observation, _envState: unknown): Observation {
    return obs;
  }

  override reset(seed?: number | null, options?: Record<string, unknown> | null): EnvResetResponse {
    const resetResp = this.inner.reset(seed, options);
    const envState = this.inner.getEnvState();
    const fresh = this.inner.observe();
    return {
      observation: this.filterObservation(fresh, envState),
      info: { ...resetResp.info },
    };
  }

  override step(action: Action): EnvResponse {
    const envState = this.inner.getEnvState();
    const filtered = this.filterAction(action, envState);
    if (isBlocked(filtered)) {
      const fresh = this.filterObservation(this.inner.observe(), envState);
      return {
        observation: {
          text: `[blocked] ${filtered.reason}\n\n${fresh.text}`,
          data: {
            ...(fresh.data ?? {}),
            blocked: true,
            blockedReason: filtered.reason,
          },
        },
        reward: 0,
        terminated: false,
        truncated: false,
        info: { blockedReason: filtered.reason },
      };
    }

    const rawResponse = this.inner.step(filtered);
    const postState = this.inner.getEnvState();
    const transformed = this.modifyTransition(filtered, rawResponse, postState);
    const newObs = this.filterObservation(transformed.observation, postState);
    return {
      observation: newObs,
      reward: transformed.reward,
      terminated: transformed.terminated,
      truncated: transformed.truncated,
      info: transformed.info,
    };
  }

  override observe(): Observation {
    const envState = this.inner.getEnvState();
    return this.filterObservation(this.inner.observe(), envState);
  }

  override saveState(): Record<string, unknown> {
    return { rules_code: this.rulesCode || "" };
  }

  static override fromState(
    state: Record<string, unknown>,
    inner: ActionableEnv | null = null,
  ): Rules {
    const code = String(state.rules_code ?? state.rulesCode ?? "").trim();
    if (!code) {
      return new Rules(inner);
    }
    const Subclass = loadRulesSubclass(code);
    const instance = new Subclass(inner);
    instance.rulesCode = code;
    return instance;
  }
}

registerHarness("rules")(Rules);

export { blocked };
