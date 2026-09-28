# Helix stack primitives

The stack is split into standalone packages under [letslego/helix-ecosystem](https://github.com/letslego/helix-ecosystem). Helix depends on them and re-exports the same APIs from `@letslego/helix`.

## Workflows

Package: [`@letslego/helix-workflow`](https://github.com/letslego/helix-workflow)

Durable turns under `.helix/workflows/`. Model calls and tool calls are `step()`s. Completed steps replay; parked runs resume after approvals.

See [workflows.md](./workflows.md).

## AI Gateway

Package: [`@letslego/helix-gateway`](https://github.com/letslego/helix-gateway)

`HelixGateway` routes by intent keywords, builds fallback chains, and completes chat turns through provider adapters.

```ts
import { defineAgent, defineGateway } from "@letslego/helix";

export default defineAgent({
  gateway: defineGateway({
    defaultModel: "mock/helix-demo",
    routes: { research: "openai/gpt-4.1-mini" },
  }),
  fallbackModels: ["anthropic/claude-sonnet"],
});
```

## Sandbox

Package: [`@letslego/helix-sandbox`](https://github.com/letslego/helix-sandbox)

Isolated filesystem + allowlisted bash (`ls`, `cat`, `node`, …), plus `glob` / `grep`. Seed files from `agent/sandbox/workspace`.

```ts
import { defineSandbox } from "@letslego/helix/sandbox";

export default defineSandbox({
  backend: "local",
  bootstrap: ["workspace/.gitkeep"],
});
```

## Connect

Package: [`@letslego/helix-connect`](https://github.com/letslego/helix-connect)

Credential-brokered MCP/OpenAPI connections. Tokens resolve from env in the app runtime and never enter model context.

```ts
import { connect, defineMcpConnection } from "@letslego/helix/connect";

export default defineMcpConnection({
  url: "https://mcp.example/places",
  description: "Places",
  auth: connect({ tokenEnv: "PLACES_TOKEN" }),
});
```

## Channels

Package: [`@letslego/helix-channels`](https://github.com/letslego/helix-channels)

HTTP API, web operator console, Slack, and Discord adapters under `agent/channels/`.

## Tools

Typed actions with `approval`, streaming yields, and `toModelOutput`. See [tools.md](./tools.md).

## Subagents

Specialists under `agent/subagents/<name>/` with their own instructions/tools and isolated sandboxes. Root agents call `delegate_subagent`.

## Domain router

Helix builds **capability cards** from each subagent (plus optional `domain.json` / `agent/domains/*` overrides) and routes user text to `0..N` domain ids.

```ts
import { routeDomains, DomainRegistry, defineDomain } from "@letslego/helix";

const registry = new DomainRegistry([
  defineDomain({
    id: "researcher",
    description: "Investigate open questions",
    whenToUse: ["research a topic", "investigate"],
    notFor: ["book a flight"],
    keywords: ["research"],
  }),
]);

const plan = routeDomains("Please investigate Kyoto neighborhoods", registry);
// plan.domains => ["researcher"]
```

Built-in tools (when subagents exist):

| Tool | Role |
|------|------|
| `route_domains` | Score cards; return domain ids (empty = root handles) |
| `delegate_subagent` | Run one named specialist |
| `delegate_domains` | Auto-route (or explicit ids) then fan-out parallel/serial |

Configure thresholds on the agent:

```ts
export default defineAgent({
  domains: { minScore: 1, maxDomains: 3, parallel: true },
});
```

Per-subagent card file: `agent/subagents/<name>/domain.json`.

## Organizational context packs

Enterprise / tenant knowledge lives under `agent/context/**` — not in the task string.

```text
agent/context/
  org.md                 # id: org
  tenants/acme.md        # id: tenant:acme
  policies/pii.md        # id: policy:pii
  policies/mnpi.md       # id: policy:mnpi
```

Defaults and caps:

```ts
export default defineAgent({
  context: {
    defaultRefs: ["org", "policy:pii", "policy:mnpi"],
    maxChars: 6000,
  },
});
```

Delegation envelope:

```ts
await ctx.runSubagent("researcher", "Investigate Kyoto", {
  contextRefs: ["tenant:acme"],
  facts: { tripDates: "2026-10-10..12" },
});
```

Subagents declare allowlists via `allowedContextRefs` in `domain.json` (e.g. `["org", "tenant:*"]`). Denied refs are skipped and recorded on `context.attach` events. Child runs do **not** inherit the parent session memory list — only the resolved packs + facts.

### Kubernetes policy sidecar

In cluster, set `context.mode: "hybrid"` so org/tenant packs stay on the filesystem/ConfigMap while `policy:*` (PII, MNPI, …) are resolved and authorized by a localhost policy-engine sidecar. See [k8s-policy-sidecar.md](./k8s-policy-sidecar.md) and `deploy/k8s/`.
