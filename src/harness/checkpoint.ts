import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ActionableEnv } from "./actionable-env.js";
import { isEnvHarness, EnvHarness } from "./env-harness.js";
import { getEnvClass, getHarnessClass } from "./registry.js";

const SCHEMA_VERSION = 1;

export interface CheckpointData {
  envType: string;
  envState: Record<string, unknown>;
  harnesses: Array<{ type: string; state: Record<string, unknown> }>;
  metadata: Record<string, unknown>;
}

export class Checkpoint {
  envType: string;
  envState: Record<string, unknown>;
  harnesses: Array<{ type: string; state: Record<string, unknown> }>;
  metadata: Record<string, unknown>;

  constructor(data: CheckpointData) {
    this.envType = data.envType;
    this.envState = data.envState;
    this.harnesses = data.harnesses;
    this.metadata = data.metadata;
  }

  toDict(): Record<string, unknown> {
    return {
      schema_version: SCHEMA_VERSION,
      env: {
        type: this.envType,
        state: { ...this.envState },
      },
      harnesses: this.harnesses.map((h) => ({
        type: String(h.type),
        state: { ...(h.state ?? {}) },
      })),
      metadata: { ...this.metadata },
    };
  }

  static fromDict(obj: Record<string, unknown>): Checkpoint {
    if (!obj || typeof obj !== "object") {
      throw new Error(`Checkpoint.fromDict: expected dict at top level, got ${typeof obj}`);
    }
    const ver = obj.schema_version ?? obj.schemaVersion;
    if (ver !== SCHEMA_VERSION) {
      throw new Error(
        `Checkpoint schema_version=${JSON.stringify(ver)} not supported; this build expects ${SCHEMA_VERSION}.`,
      );
    }
    const envBlock = obj.env;
    if (!envBlock || typeof envBlock !== "object") {
      throw new Error("Checkpoint: 'env' must be a dict with 'type' and 'state'.");
    }
    const envRec = envBlock as Record<string, unknown>;
    const envType = envRec.type;
    const envState = envRec.state;
    if (typeof envType !== "string" || !envType) {
      throw new Error("Checkpoint.env.type must be a non-empty string.");
    }
    if (!envState || typeof envState !== "object") {
      throw new Error("Checkpoint.env.state must be a dict.");
    }
    const harnessesRaw = (obj.harnesses as unknown[]) ?? [];
    if (!Array.isArray(harnessesRaw)) {
      throw new Error("Checkpoint.harnesses must be a list.");
    }
    const harnesses: Array<{ type: string; state: Record<string, unknown> }> = [];
    for (let i = 0; i < harnessesRaw.length; i++) {
      const h = harnessesRaw[i];
      if (!h || typeof h !== "object") {
        throw new Error(`Checkpoint.harnesses[${i}] must be a dict; got ${typeof h}`);
      }
      const hRec = h as Record<string, unknown>;
      const htype = hRec.type;
      let hstate = hRec.state;
      if (typeof htype !== "string" || !htype) {
        throw new Error(`Checkpoint.harnesses[${i}].type must be a non-empty string.`);
      }
      if (hstate === undefined || hstate === null) hstate = {};
      if (typeof hstate !== "object") {
        throw new Error(`Checkpoint.harnesses[${i}].state must be a dict (or omitted).`);
      }
      harnesses.push({ type: htype, state: { ...(hstate as Record<string, unknown>) } });
    }
    const metadata = (obj.metadata as Record<string, unknown>) ?? {};
    if (typeof metadata !== "object") {
      throw new Error("Checkpoint.metadata must be a dict.");
    }
    return new Checkpoint({
      envType,
      envState: { ...(envState as Record<string, unknown>) },
      harnesses,
      metadata: { ...metadata },
    });
  }

  save(path: string): string {
    mkdirSync(dirname(path), { recursive: true });
    const text = JSON.stringify(this.toDict(), null, 2);
    try {
      Checkpoint.fromDict(JSON.parse(text) as Record<string, unknown>);
    } catch (e) {
      throw new Error(
        `Checkpoint.save: refusing to write a file that wouldn't load back. Reason: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    writeFileSync(path, text, "utf8");
    return path;
  }

  static load(path: string): Checkpoint {
    const text = readFileSync(path, "utf8");
    return Checkpoint.fromDict(JSON.parse(text) as Record<string, unknown>);
  }
}

export function dumpStack(env: ActionableEnv, metadata?: Record<string, unknown>): Checkpoint {
  const layers: EnvHarness[] = [];
  let current: ActionableEnv = env;
  while (isEnvHarness(current)) {
    layers.push(current);
    current = current.inner;
  }
  const envObj = current;
  const layersInnerToOuter = [...layers].reverse();

  const harnessEntries: Array<{ type: string; state: Record<string, unknown> }> = [];
  for (const h of layersInnerToOuter) {
    const tag = (h.constructor as typeof EnvHarness).harnessType();
    getHarnessClass(tag);
    const state = h.saveState();
    if (!state || typeof state !== "object") {
      throw new TypeError(`${h.constructor.name}.saveState() must return a dict; got ${typeof state}`);
    }
    harnessEntries.push({ type: tag, state });
  }

  const envTag = (envObj.constructor as typeof ActionableEnv).envType();
  getEnvClass(envTag);
  const envState = envObj.saveState();
  if (!envState || typeof envState !== "object") {
    throw new TypeError(`${envObj.constructor.name}.saveState() must return a dict; got ${typeof env}`);
  }

  return new Checkpoint({
    envType: envTag,
    envState,
    harnesses: harnessEntries,
    metadata: { ...(metadata ?? {}) },
  });
}

export function buildStack(cp: Checkpoint): ActionableEnv {
  const envCls = getEnvClass(cp.envType);
  const env = envCls.fromState(cp.envState);
  let current: ActionableEnv = env;
  for (const hSpec of cp.harnesses) {
    const hCls = getHarnessClass(hSpec.type);
    const wrapped = hCls.fromState(hSpec.state ?? {}, current);
    if (!isEnvHarness(wrapped)) {
      throw new TypeError(`${hCls.name}.fromState returned a ${typeof wrapped}, not an EnvHarness.`);
    }
    current = wrapped;
  }
  return current;
}

export function saveCheckpoint(
  env: ActionableEnv,
  path: string,
  metadata?: Record<string, unknown>,
): string {
  return dumpStack(env, metadata).save(path);
}

export function loadCheckpoint(path: string, autoReset = true): ActionableEnv {
  const cp = Checkpoint.load(path);
  const env = buildStack(cp);
  if (autoReset && env.resetAfterLoad()) {
    const [seed, options] = env.defaultResetArgs();
    env.reset(seed, options);
  }
  return env;
}
