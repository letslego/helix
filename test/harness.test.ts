import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ActionableEnv,
  EnvHarness,
  Rules,
  Setup,
  Toy24Env,
  buildStack,
  dumpStack,
  loadCheckpoint,
  loadRulesInstance,
  saveCheckpoint,
  Checkpoint,
} from "../src/harness/index.js";
import type { Action } from "../src/harness/types.js";

function act(name: string, kwargs: Record<string, unknown> = {}): Action {
  return { name, kwargs };
}

class BlockDivision extends Rules {
  override filterAction(action: Action, _envState: unknown) {
    if (action.name === "combine" && action.kwargs.op === "div") {
      return { kind: "blocked" as const, reason: "division disabled in test" };
    }
    return action;
  }
}

test("Setup is EnvHarness and ActionableEnv", () => {
  const env = new Setup(null, [act("combine", { i: 0, j: 1, op: "add" })]);
  assert.ok(env instanceof EnvHarness);
  assert.ok(env instanceof ActionableEnv);
  assert.equal((Setup as unknown as { harnessType(): string }).harnessType(), "setup");
});

test("Setup replays actions on reset", () => {
  const env = new Setup(null, [
    act("combine", { i: 2, j: 0, op: "mul" }),
    act("combine", { i: 2, j: 0, op: "add" }),
  ]);
  env.attach(new Toy24Env());
  env.reset(0, { numbers: [3, 3, 7, 7], target: 24 });
  assert.deepEqual(env.getEnvState().currentNumbers, [7, 24]);
  assert.match(env.observe().text, /24/);
});

test("Rules blocks division", () => {
  const env = new BlockDivision(new Toy24Env());
  env.reset(0, { numbers: [4, 2, 8, 1], target: 24 });
  const resp = env.step(act("combine", { i: 0, j: 1, op: "div" }));
  assert.equal(resp.terminated, false);
  assert.equal(resp.reward, 0);
  assert.equal(resp.observation.data.blocked, true);
  assert.match(resp.observation.text, /division disabled in test/);
});

test("stack Rules over Setup over Toy24Env", () => {
  const inner = new Setup(new Toy24Env(), [act("combine", { i: 2, j: 0, op: "mul" })]);
  const outer = new BlockDivision(inner);
  outer.reset(0, { numbers: [3, 3, 7, 7], target: 24 });
  assert.deepEqual(outer.getEnvState().currentNumbers, [3, 7, 21]);
  const blocked = outer.step(act("combine", { i: 0, j: 1, op: "div" }));
  assert.equal(blocked.observation.data.blocked, true);
  outer.step(act("combine", { i: 2, j: 0, op: "add" }));
  outer.step(act("stop"));
  assert.equal(outer.evaluate().success, true);
});

test("toy24 save/load roundtrip", () => {
  const env = new Toy24Env();
  env.reset(0, { numbers: [3, 3, 7, 7], target: 24 });
  env.step(act("combine", { i: 2, j: 0, op: "mul" }));
  const cp = dumpStack(env);
  assert.equal(cp.envType, "toy24");
  assert.deepEqual(cp.harnesses, []);
  const restored = buildStack(cp);
  assert.ok(restored instanceof Toy24Env);
  assert.equal(restored.observe().text, env.observe().text);
});

test("full stack checkpoint roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "helix-harness-"));
  try {
    const blockDivSource = `
      class _Rules extends Rules {
        filterAction(action, envState) {
          if (action.name === "combine" && action.kwargs.op === "div") {
            return { kind: "blocked", reason: "div disabled (mutator source)" };
          }
          return action;
        }
      }
    `;
    const setupActions = [act("combine", { i: 2, j: 0, op: "mul" })];
    const inner = new Setup(new Toy24Env(), setupActions);
    const env = loadRulesInstance(blockDivSource, inner);
    env.reset(0, { numbers: [3, 3, 7, 7], target: 24 });

    const path = saveCheckpoint(env, join(dir, "stack.json"), { experiment: "smoke" });
    const loaded = loadCheckpoint(path);
    loaded.reset(0, { numbers: [3, 3, 7, 7], target: 24 });
    assert.deepEqual(loaded.getEnvState().currentNumbers, [3, 7, 21]);
    const resp = loaded.step(act("combine", { i: 0, j: 1, op: "div" }));
    assert.equal(resp.observation.data.blocked, true);
    loaded.step(act("combine", { i: 2, j: 0, op: "add" }));
    loaded.step(act("stop"));
    assert.equal(loaded.evaluate().success, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown env type raises clear error", () => {
  const cp = Checkpoint.fromDict({
    schema_version: 1,
    env: { type: "this_env_does_not_exist", state: {} },
    harnesses: [],
    metadata: {},
  });
  assert.throws(() => buildStack(cp), /Unknown env_type/);
});
