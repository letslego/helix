import type { ActionableEnv } from "./actionable-env.js";
import { loadRulesInstance } from "./code-loader.js";
import { Setup } from "./harnesses/setup.js";
import type { Candidate } from "./types.js";

export interface EnvSpec {
  importPath: string;
  resetOptions?: Record<string, unknown>;
  resetSeed?: number | null;
}

export interface EpisodeSpec {
  env: EnvSpec;
  candidate: Candidate;
  maxSteps?: number;
}

export async function importSymbol<T>(importPath: string): Promise<T> {
  const [modulePath, exportName] = importPath.includes(":")
    ? importPath.split(":", 2)
    : [importPath, "default"];
  const mod = await import(modulePath);
  const sym = mod[exportName];
  if (sym === undefined) {
    throw new Error(`Could not import ${JSON.stringify(exportName)} from ${JSON.stringify(modulePath)}`);
  }
  return sym as T;
}

type EnvConstructor = new () => ActionableEnv;

/** Build the ActionableEnv stack from a spec + candidate. */
export async function buildEnvStack(spec: EpisodeSpec): Promise<ActionableEnv> {
  const baseCls = await importSymbol<EnvConstructor>(spec.env.importPath);
  let env: ActionableEnv = new baseCls();
  const cand = spec.candidate;
  if (cand.inEnvActions?.length) {
    env = new Setup(env, cand.inEnvActions);
  }
  if ((cand.rulesCode ?? "").trim()) {
    env = loadRulesInstance(cand.rulesCode, env);
  }
  return env;
}

export function buildEnvStackSync(
  baseEnv: ActionableEnv,
  candidate: Candidate,
): ActionableEnv {
  let env: ActionableEnv = baseEnv;
  if (candidate.inEnvActions?.length) {
    env = new Setup(env, candidate.inEnvActions);
  }
  if ((candidate.rulesCode ?? "").trim()) {
    env = loadRulesInstance(candidate.rulesCode, env);
  }
  return env;
}
