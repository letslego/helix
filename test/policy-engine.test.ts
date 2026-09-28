import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PolicySidecarClient,
  splitRefsForMode,
  isPolicyRef,
} from "../src/policy-engine.js";
import { prepareSubagentContextAsync } from "../src/context.js";
import type { ContextPack, SubagentDefinition } from "../src/types.js";

test("splitRefsForMode sends policy refs to sidecar in hybrid", () => {
  const { localRefs, sidecarRefs } = splitRefsForMode(
    ["org", "tenant:acme", "policy:pii", "policy:mnpi"],
    "hybrid",
  );
  assert.deepEqual(localRefs, ["org", "tenant:acme"]);
  assert.deepEqual(sidecarRefs, ["policy:pii", "policy:mnpi"]);
  assert.equal(isPolicyRef("policy:mnpi"), true);
});

test("prepareSubagentContextAsync hybrid uses sidecar for policies", async () => {
  const local: ContextPack[] = [
    {
      id: "org",
      kind: "org",
      title: "Org",
      body: "Org voice",
      tags: [],
    },
    {
      id: "tenant:acme",
      kind: "tenant",
      title: "Acme",
      body: "Acme rules",
      tags: [],
    },
  ];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.endsWith("/v1/packs/resolve")) {
      return new Response(
        JSON.stringify({
          packs: [
            {
              id: "policy:mnpi",
              kind: "policy",
              title: "MNPI",
              body: "No tipping.",
              tags: ["mnpi"],
            },
            {
              id: "policy:pii",
              kind: "policy",
              title: "PII",
              body: "No PANs.",
              tags: ["pii"],
            },
          ].filter((p) =>
            (body.refs as string[]).some(
              (r: string) => r === p.id || r === "policy:*",
            ),
          ),
          denied: [],
          missing: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/v1/authorize")) {
      const packId = body.resource?.packId;
      const allow =
        body.subject?.subagent === "researcher" &&
        Boolean(body.subject?.tenant) &&
        (packId === "policy:mnpi" || packId === "policy:pii");
      return new Response(
        JSON.stringify({
          allow,
          reasons: allow ? [] : ["denied_by_pdp"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("nope", { status: 404 });
  };

  const client = new PolicySidecarClient(
    { baseUrl: "http://policy.test", failClosed: true },
    fetchImpl,
  );

  const sub = {
    name: "researcher",
    description: "x",
    instructions: "Investigate",
    config: {},
    tools: [],
    allowedContextRefs: ["org", "tenant:*", "policy:*"],
  } as SubagentDefinition;

  const prepared = await prepareSubagentContextAsync(local, {
    config: {
      mode: "hybrid",
      defaultRefs: ["org", "policy:pii", "policy:mnpi"],
      policyEngine: { failClosed: true },
    },
    subagent: sub,
    tenantId: "acme",
    policyClient: client,
  });

  assert.equal(prepared.source, "hybrid");
  assert.ok(prepared.applied.includes("org"));
  assert.ok(prepared.applied.includes("tenant:acme"));
  assert.ok(prepared.applied.includes("policy:mnpi"));
  assert.ok(prepared.applied.includes("policy:pii"));
  assert.match(prepared.block, /No tipping/);
  assert.equal(prepared.policyEngine?.contacted, true);
});

test("hybrid fail-closed denies policies when sidecar is down", async () => {
  const local: ContextPack[] = [
    { id: "org", kind: "org", title: "Org", body: "Org", tags: [] },
    {
      id: "policy:mnpi",
      kind: "policy",
      title: "MNPI",
      body: "local mnpi",
      tags: [],
    },
  ];
  const fetchImpl: typeof fetch = async () => {
    throw new Error("connection refused");
  };
  const client = new PolicySidecarClient(
    { baseUrl: "http://policy.test", failClosed: true },
    fetchImpl,
  );
  const sub = {
    name: "researcher",
    description: "x",
    instructions: "Investigate",
    config: {},
    tools: [],
    allowedContextRefs: "*",
  } as SubagentDefinition;

  const prepared = await prepareSubagentContextAsync(local, {
    config: {
      mode: "hybrid",
      defaultRefs: ["org", "policy:mnpi"],
      policyEngine: { failClosed: true },
    },
    subagent: sub,
    policyClient: client,
  });

  assert.ok(prepared.applied.includes("org"));
  assert.ok(!prepared.applied.includes("policy:mnpi"));
  assert.ok(prepared.denied.includes("policy:mnpi"));
  assert.ok(prepared.policyEngine?.error);
});
