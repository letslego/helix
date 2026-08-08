import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { always } from "../src/approval.js";
import { WorkflowWorld } from "../src/workflow.js";
import { defineTool, runToolExecute, toolOutput, z } from "../src/tools.js";
import type { ToolContext } from "../src/types.js";

test("workflow steps replay instead of re-executing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "helix-wf-"));
  try {
    const world = new WorkflowWorld(dir);
    const run = world.create("sess-1");
    let calls = 0;
    const emit = () =>
      ({
        type: "checkpoint",
        at: new Date().toISOString(),
        sessionId: "sess-1",
      }) as const;

    const ctx1 = world.bind(run, emit as never);
    const first = await ctx1.step("work", async () => {
      calls += 1;
      return { n: 7 };
    });
    assert.deepEqual(first, { n: 7 });
    assert.equal(calls, 1);

    const ctx2 = world.bind(world.get(run.id)!, emit as never);
    const second = await ctx2.step("work", async () => {
      calls += 1;
      return { n: 99 };
    });
    assert.deepEqual(second, { n: 7 });
    assert.equal(calls, 1);
    assert.equal(ctx2.wasReplayed("work"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tools support approval helpers, partial yields, and toModelOutput", async () => {
  const events: string[] = [];
  const tool = defineTool({
    description: "stream then summarize",
    approval: always(),
    inputSchema: z.object({ city: z.string() }),
    async *execute({ city }) {
      yield { phase: "loading", city };
      yield { phase: "done", city, ok: true };
    },
    toModelOutput(output) {
      return toolOutput.text(`done:${(output as { city: string }).city}`);
    },
  });

  assert.equal(tool.approval?.mode, "always");

  const ctx = {
    sessionId: "s1",
    callId: "c1",
    toolName: tool.name,
    abortSignal: new AbortController().signal,
    memory: { list: () => [], write: (e) => ({ id: "1", createdAt: "", ...e }), search: () => [] },
    sandbox: {
      root: "",
      readFile: () => "",
      writeFile: () => {},
      list: () => [],
      exec: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    },
    connections: { list: () => [], call: async () => ({}) },
    getSandbox() {
      return this.sandbox;
    },
    getSkill: () => undefined,
    emit: (e) => {
      events.push(e.type);
    },
    runSubagent: async () => "",
  } satisfies ToolContext;

  const result = await runToolExecute(tool, { city: "Paris" }, ctx);
  assert.deepEqual(result.raw, { phase: "done", city: "Paris", ok: true });
  assert.equal(result.forModel, "done:Paris");
  assert.ok(events.includes("tool.partial"));
});
