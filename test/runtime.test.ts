import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scaffoldProject } from "../src/scaffold.js";
import { loadAgent } from "../src/loader.js";
import { HelixRuntime } from "../src/runtime.js";

test("scaffold + weather run is durable and inspectable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "helix-"));
  try {
    scaffoldProject(dir);
    const agent = await loadAgent(dir);
    assert.equal(agent.tools.some((t) => t.name === "get_weather"), true);

    const runtime = new HelixRuntime(agent);
    const result = await runtime.run({
      message: "What is the weather in Paris?",
      autoApprove: true,
    });

    assert.match(result.reply, /Paris|weather|°F|F/i);
    assert.ok(result.sessionId);
    const events = runtime.store.listEvents(result.sessionId);
    assert.ok(events.some((e) => e.type === "tool.call"));
    assert.ok(events.some((e) => e.type === "checkpoint"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
