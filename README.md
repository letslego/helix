<p align="center">
  <img src="docs/site/assets/demo-poster.svg" alt="Helix" width="720" />
</p>

<h1 align="center">Helix</h1>

<p align="center">
  <strong>The framework for building agents.</strong><br/>
  Filesystem-first. Durable by default. Full local stack — gateway, workflows, sandbox, channels, connections, subagents, schedules, evals.
</p>

<p align="center">
  <a href="https://letslego.github.io/helix/">Docs site</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#the-helix-stack">Stack</a> ·
  <a href="#demo">Demo</a>
</p>

---

## Demo

https://github.com/letslego/helix/raw/main/docs/site/assets/helix-demo.mp4

[![Helix demo](docs/site/assets/demo-poster.svg)](https://letslego.github.io/helix/#demo)

---

## An agent is a directory

```text
my-agent/
├── agent/
│   ├── instructions.md
│   ├── agent.ts                 # model, gateway routes, budgets
│   ├── policies.json
│   ├── tools/
│   ├── skills/
│   ├── sandbox/sandbox.ts
│   ├── channels/
│   ├── connections/
│   ├── subagents/
│   └── schedules/
└── evals/suite.ts
```

## The Helix stack

Core primitives (see [docs/stack.md](docs/stack.md)):

| Primitive | What it does |
| --- | --- |
| **Workflows** | Step replay under `.helix/workflows/` — park & resume, never re-run completed steps |
| **AI Gateway** | Intent routing, fallback chains, cost budgets (`HelixGateway`) |
| **Sandbox** | Isolated FS + glob/grep/allowlisted bash |
| **Connect** | Brokered MCP/OpenAPI auth — secrets never enter prompts |
| **Tools** | `defineTool` + `always/once/never/when`, streaming yields, `toModelOutput` |
| **Subagents** | Specialists with isolated sandboxes via `delegate_subagent` |

Also included: channels (web/HTTP/CLI/cron), schedules, evals, memory, policies.

```bash
helix stack          # print discovered stack map
helix console        # operator UI + HTTP API
helix schedule       # list / fire schedules
helix eval           # run evals/suite.ts
helix replay <id>    # forensic event log
```

---

## Quick start

```bash
npx @letslego/helix init my-agent
cd my-agent
npm install
npx helix console
```

Open `http://127.0.0.1:8787`. API surface also serves `/helix/v1/*`.

### Tools & workflows

```ts
import { defineTool, z, always, toolOutput } from "@letslego/helix/tools";

export default defineTool({
  description: "Hold a flight",
  approval: always(),
  inputSchema: z.object({ flight: z.string(), passenger: z.string() }),
  async *execute(input, ctx) {
    yield { phase: "reserving" };
    const holdId = `HOLD-${input.flight}`;
    yield { phase: "done", holdId };
  },
  toModelOutput(out) {
    return toolOutput.text(`Hold ready: ${(out as { holdId: string }).holdId}`);
  },
});
```

See [docs/tools.md](docs/tools.md) and [docs/workflows.md](docs/workflows.md).

### Gateway + sandbox

```ts
import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  fallbackModels: ["openai/gpt-4.1-mini"],
  provider: { mock: true },
  gateway: {
    defaultModel: "mock/helix-demo",
    routes: { research: "mock/helix-demo" },
  },
  costBudgetUsd: 1,
});
```

---

## Travel example

```bash
npm install
npm run demo
npx tsx src/cli.ts stack examples/travel-agent
npx tsx src/cli.ts eval examples/travel-agent/evals/suite.ts -d examples/travel-agent
npx tsx src/cli.ts console examples/travel-agent
```

Includes flights/weather tools, approval-gated booking, sandbox, places connection, researcher subagent, Friday schedule, and eval suite.

---

## How a turn works

```mermaid
flowchart LR
  A[Channel message] --> B[Helix Gateway]
  B --> C[Durable workflow]
  C --> D{Tool / subagent / connection?}
  D -->|approval| E[Park session]
  D -->|sandbox| F[Isolated compute]
  D -->|ok| G[Checkpoint]
  G --> C
  E --> H[Operator console]
  H --> C
```

---

## Development

```bash
npm install
npm test
npm run demo
bash scripts/make-demo-video.sh
```

## License

Apache-2.0 © LetsLego
