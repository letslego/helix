import type { ActionableEnv } from "./actionable-env.js";
import type { EnvHarness } from "./env-harness.js";

const envRegistry = new Map<string, ActionableEnvClass>();
const harnessRegistry = new Map<string, EnvHarnessClass>();

export type ActionableEnvClass = {
  new (): ActionableEnv;
  envType(): string;
  fromState(state: Record<string, unknown>): ActionableEnv;
};

export type EnvHarnessClass = {
  new (...args: never[]): EnvHarness;
  harnessType(): string;
  envType(): string;
  fromState(state: Record<string, unknown>, inner?: ActionableEnv | null): EnvHarness;
};

export function registerEnv(tag: string) {
  return <T extends ActionableEnvClass>(cls: T): T => {
    const existing = envRegistry.get(tag);
    if (existing && existing !== cls) {
      throw new Error(
        `env_type ${JSON.stringify(tag)} already registered to ${existing.name}; cannot reassign to ${cls.name}`,
      );
    }
    envRegistry.set(tag, cls);
    cls.envType = () => tag;
    return cls;
  };
}

export function registerHarness(tag: string) {
  return <T extends EnvHarnessClass>(cls: T): T => {
    const existing = harnessRegistry.get(tag);
    if (existing && existing !== cls) {
      throw new Error(
        `harness_type ${JSON.stringify(tag)} already registered to ${existing.name}; cannot reassign to ${cls.name}`,
      );
    }
    harnessRegistry.set(tag, cls);
    cls.harnessType = () => tag;
    cls.envType = () => tag;
    return cls;
  };
}

export function getEnvClass(tag: string): ActionableEnvClass {
  const cls = envRegistry.get(tag);
  if (!cls) {
    throw new Error(
      `Unknown env_type ${JSON.stringify(tag)}. Registered envs: ${JSON.stringify([...envRegistry.keys()].sort())}`,
    );
  }
  return cls;
}

export function getHarnessClass(tag: string): EnvHarnessClass {
  const cls = harnessRegistry.get(tag);
  if (!cls) {
    throw new Error(
      `Unknown harness_type ${JSON.stringify(tag)}. Registered harnesses: ${JSON.stringify([...harnessRegistry.keys()].sort())}`,
    );
  }
  return cls;
}

export function registeredEnvs(): Record<string, ActionableEnvClass> {
  return Object.fromEntries(envRegistry.entries());
}

export function registeredHarnesses(): Record<string, EnvHarnessClass> {
  return Object.fromEntries(harnessRegistry.entries());
}
