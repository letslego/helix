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
