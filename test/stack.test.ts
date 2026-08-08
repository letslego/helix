import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { loadAgent, describeAgent } from "../src/loader.js";
import { HelixRuntime } from "../src/runtime.js";
import { runEvals } from "../src/evals.js";

const example = resolve("examples/travel-agent");

test("travel agent loads the full Helix stack", async () => {
  const agent = await loadAgent(example);
  assert.ok(agent.tools.some((t) => t.name === "search_flights"));
  assert.equal(agent.sandbox.backend, "local");
  assert.ok(agent.channels.some((c) => c.kind === "http"));
  assert.ok(agent.connections.some((c) => c.name === "places"));
  assert.ok(agent.subagents.some((s) => s.name === "researcher"));
  assert.ok(agent.schedules.some((s) => s.name === "weekend_watch"));
  assert.match(describeAgent(agent), /Channels/);
});

test("runtime exposes builtin sandbox and connection tools", async () => {
  const agent = await loadAgent(example);
  const runtime = new HelixRuntime(agent);
  const result = await runtime.run({
    message: "What is the weather in Paris?",
    autoApprove: true,
    channel: "cli",
  });
  assert.ok(result.sessionId);
  assert.ok(result.events.some((e) => e.type === "gateway.route"));
  assert.ok(result.events.some((e) => e.type === "checkpoint"));
});

test("eval suite passes for travel smoke cases", async () => {
  const agent = await loadAgent(example);
  const suite = (await import("../examples/travel-agent/evals/suite.ts")).default;
  const report = await runEvals(agent, suite);
  assert.equal(report.failed, 0, JSON.stringify(report.results, null, 2));
});
