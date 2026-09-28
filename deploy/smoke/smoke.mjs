#!/usr/bin/env node
/**
 * Regenerative deployment smoke tests.
 *
 * Run against any live Helix + policy-sidecar deployment (Compose, Helm, raw K8s):
 *
 *   HELIX_BASE_URL=http://127.0.0.1:8080 \
 *   POLICY_BASE_URL=http://127.0.0.1:8181 \
 *   node deploy/smoke/smoke.mjs
 *
 * Exit 0 only when every check passes. Safe to gate CI / CD on this script.
 */
import { strict as assert } from "node:assert";

const HELIX = (process.env.HELIX_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const POLICY = (process.env.POLICY_BASE_URL ?? "http://127.0.0.1:8181").replace(/\/$/, "");
const TENANT_HEADER = process.env.HELIX_TENANT_HEADER ?? "x-helix-tenant";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);

const results = [];

async function fetchJson(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS  ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

await check("helix /healthz is live", async () => {
  const { res, body } = await fetchJson(`${HELIX}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(["live", "ok", undefined].includes(body.status) || body.ok === true);
});

await check("helix /livez is live", async () => {
  const { res, body } = await fetchJson(`${HELIX}/livez`);
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

await check("helix /readyz is ready", async () => {
  const { res, body } = await fetchJson(`${HELIX}/readyz`);
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(typeof body.subagents === "number");
  assert.ok(body.subagents >= 1);
});

await check("policy sidecar /healthz", async () => {
  const { res, body } = await fetchJson(`${POLICY}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

await check("helix agent surface exposes stack features", async () => {
  const { res, body } = await fetchJson(`${HELIX}/api/agent`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.tools) && body.tools.length >= 1, "tools");
  assert.ok(Array.isArray(body.skills), "skills");
  assert.ok(Array.isArray(body.subagents) && body.subagents.length >= 1, "subagents");
  assert.ok(Array.isArray(body.contextPacks), "contextPacks");
  const names = body.subagents.map((s) => s.name);
  assert.ok(names.includes("researcher") || names.includes("weather_scout"), names.join(","));
  assert.ok(
    ["hybrid", "sidecar", "local"].includes(body.contextMode),
    `unexpected contextMode ${body.contextMode}`,
  );
  const expectMode = process.env.HELIX_EXPECT_MODE ?? "hybrid";
  assert.equal(body.contextMode, expectMode, `expected contextMode=${expectMode}`);
  const packIds = body.contextPacks.map((p) => p.id);
  assert.ok(packIds.includes("org"), `missing org in ${packIds}`);
  assert.ok(
    packIds.some((id) => id.startsWith("policy:")),
    `missing policy packs in ${packIds}`,
  );
});

await check("helix /api/stack maps durable primitives", async () => {
  const { res, body } = await fetchJson(`${HELIX}/api/stack`);
  assert.equal(res.status, 200);
  assert.ok(body.runtime);
  assert.ok(Array.isArray(body.tools));
  assert.ok(Array.isArray(body.subagents));
});

await check("policy sidecar resolves policy packs", async () => {
  const { res, body } = await fetchJson(`${POLICY}/v1/packs/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject: { subagent: "researcher", tenant: "acme" },
      refs: ["policy:pii", "policy:mnpi"],
    }),
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.packs));
  const ids = body.packs.map((p) => p.id);
  assert.ok(ids.includes("policy:pii"), `missing pii in ${ids}`);
  assert.ok(ids.includes("policy:mnpi"), `missing mnpi in ${ids}`);
});

await check("policy sidecar authorizes researcher + denies uncleared scout", async () => {
  const allow = await fetchJson(`${POLICY}/v1/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject: { subagent: "researcher", tenant: "acme" },
      action: "context.attach",
      resource: { packId: "policy:mnpi", kind: "policy" },
    }),
  });
  assert.equal(allow.res.status, 200);
  assert.equal(allow.body.allow, true);

  const deny = await fetchJson(`${POLICY}/v1/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject: { subagent: "weather_scout", tenant: "acme" },
      action: "context.attach",
      resource: { packId: "policy:mnpi", kind: "policy" },
    }),
  });
  assert.equal(deny.res.status, 200);
  assert.equal(deny.body.allow, false);
  assert.ok((deny.body.reasons ?? []).length >= 1);
});

await check("policy sidecar fail-closed MNPI without tenant", async () => {
  const { res, body } = await fetchJson(`${POLICY}/v1/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject: { subagent: "researcher" },
      action: "context.attach",
      resource: { packId: "policy:mnpi", kind: "policy" },
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(body.allow, false);
});

let sessionId;

await check("helix /api/run creates durable session", async () => {
  const { res, body } = await fetchJson(`${HELIX}/api/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TENANT_HEADER]: "acme",
    },
    body: JSON.stringify({
      message: "Plan a short weekend trip idea for Paris.",
      autoApprove: true,
      tenantId: "acme",
      contextRefs: ["org", "tenant:acme", "policy:pii", "policy:mnpi"],
    }),
  });
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.sessionId, "sessionId");
  assert.ok(typeof body.reply === "string" && body.reply.length > 0, "reply");
  sessionId = body.sessionId;
});

await check("helix sessions list includes new session", async () => {
  assert.ok(sessionId);
  const { res, body } = await fetchJson(`${HELIX}/api/sessions`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((s) => s.id === sessionId || s.sessionId === sessionId));
});

await check("helix events log is durable for session", async () => {
  assert.ok(sessionId);
  const { res, body } = await fetchJson(
    `${HELIX}/api/events?sessionId=${encodeURIComponent(sessionId)}`,
  );
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body) && body.length >= 1, "events");
  const types = body.map((e) => e.type);
  assert.ok(
    types.some((t) => /run|message|session|tool|context/i.test(t)),
    `unexpected event types: ${types.slice(0, 10).join(",")}`,
  );
});

await check("helix domain-aware weather run", async () => {
  const { res, body } = await fetchJson(`${HELIX}/api/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TENANT_HEADER]: "acme",
    },
    body: JSON.stringify({
      message: "What is the weather like in Kyoto next weekend?",
      autoApprove: true,
      tenantId: "acme",
    }),
  });
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.sessionId);
  assert.ok(typeof body.reply === "string");
});

await check("helix v1 API aliases respond", async () => {
  const agent = await fetchJson(`${HELIX}/helix/v1/agent`);
  assert.equal(agent.res.status, 200);
  assert.ok(agent.body.config);
  const stack = await fetchJson(`${HELIX}/helix/v1/stack`);
  assert.equal(stack.res.status, 200);
});

await check("console HTML is served", async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${HELIX}/`, { signal: ctrl.signal });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Helix Console"));
  } finally {
    clearTimeout(timer);
  }
});

const failed = results.filter((r) => !r.ok);
console.log("---");
console.log(
  `smoke: ${results.length - failed.length}/${results.length} passed against ${HELIX} + ${POLICY}`,
);
if (failed.length) {
  for (const f of failed) console.error(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
