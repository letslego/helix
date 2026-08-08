import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HelixGateway, defineGateway } from "../src/gateway.js";
import { createSandbox, defineSandbox } from "../src/sandbox.js";
import { connect, createConnectionRegistry, defineMcpConnection } from "../src/connect.js";
import { defineSubagent, delegateMany } from "../src/subagents.js";

test("AI Gateway routes and builds fallback chains", () => {
  const gateway = new HelixGateway({
    model: "mock/helix-demo",
    fallbackModels: ["openai/gpt-4.1-mini"],
    gateway: defineGateway({
      defaultModel: "mock/helix-demo",
      routes: { weather: "mock/helix-demo" },
    }),
  });
  const routed = gateway.resolve("What is the weather in Paris?");
  assert.equal(routed.reason, "route:weather");
  assert.deepEqual(routed.chain[0], "mock/helix-demo");
  assert.ok(routed.chain.includes("openai/gpt-4.1-mini"));
});

test("Sandbox glob/grep/bash stay inside the root", () => {
  const dir = mkdtempSync(join(tmpdir(), "helix-sbx-"));
  try {
    const cfg = defineSandbox({ backend: "local", bootstrap: ["workspace/a.md"] });
    const sbx = createSandbox(dir, cfg, "t1");
    sbx.writeFile("workspace/a.md", "Paris is lovely");
    assert.ok(sbx.glob("workspace/*.md").includes("workspace/a.md"));
    assert.equal(sbx.grep("paris")[0]?.path, "workspace/a.md");
    const blocked = sbx.bash("rm -rf /");
    assert.equal(blocked.exitCode, 126);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Connect brokers auth without exposing tokens in list()", async () => {
  process.env.DEMO_TOKEN = "secret-value";
  const conn = defineMcpConnection({
    name: "demo",
    url: "https://example.local",
    description: "demo",
    auth: connect({ tokenEnv: "DEMO_TOKEN" }),
    tools: [
      {
        name: "ping",
        description: "ping",
        async handler(_input, ctx) {
          return { hasAuth: Boolean(ctx?.headers.authorization) };
        },
      },
    ],
  });
  const registry = createConnectionRegistry([conn]);
  const listed = registry.list()[0];
  assert.equal((listed as { authEnv?: string }).authEnv, undefined);
  const result = (await registry.call("demo", "ping", {})) as { hasAuth: boolean };
  assert.equal(result.hasAuth, true);
});

test("Subagents can fan out with delegateMany", async () => {
  const sub = defineSubagent({
    description: "researcher",
    instructions: "Investigate",
    isolatedSandbox: true,
  });
  assert.equal(sub.isolatedSandbox, true);
  const results = await delegateMany(["a", "b"], "task", async (name, task) => `${name}:${task}`);
  assert.deepEqual(results, [
    { name: "a", reply: "a:task" },
    { name: "b", reply: "b:task" },
  ]);
});

test("sandbox workspace seed copies authored files", () => {
  const dir = mkdtempSync(join(tmpdir(), "helix-seed-"));
  try {
    const seedDir = join(dir, "agent/sandbox/workspace");
    mkdirSync(seedDir, { recursive: true });
    writeFileSync(join(seedDir, "note.txt"), "hello");
    const sbx = createSandbox(dir, defineSandbox({ backend: "local" }), "seed");
    assert.equal(sbx.readFile("workspace/note.txt"), "hello");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
