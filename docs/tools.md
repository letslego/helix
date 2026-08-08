# Tools

A tool is a typed action the model can call. The filename under `agent/tools/` is the tool name.

```ts
import { defineTool, z } from "@letslego/helix/tools";
import { always } from "@letslego/helix/tools/approval";

export default defineTool({
  description: "Refund a charge.",
  inputSchema: z.object({ chargeId: z.string(), amount: z.number() }),
  approval: always(), // or once() / never() / when(input => ...)
  async execute(input, ctx) {
    // ctx.sessionId, ctx.callId, ctx.getSandbox(), ctx.getSkill(), ctx.abortSignal
    return { ok: true };
  },
  toModelOutput(output) {
    return { type: "text", value: `Refunded ${output.ok}` };
  },
});
```

## Streaming partial results

`execute` may be an async generator. Each `yield` emits `tool.partial` for channels/UI; only the final value enters model history.

```ts
export default defineTool({
  description: "Build a report",
  inputSchema: z.object({ project: z.string() }),
  async *execute({ project }) {
    yield { phase: "collecting" };
    yield { phase: "complete", project };
  },
});
```

## Approvals

| Helper | Behavior |
| --- | --- |
| `always()` | Park every call |
| `once()` | Park first identical tool+input per session |
| `never()` | Explicitly skip approval |
| `when(fn)` | Park when predicate matches |

Policy file `requireApprovalFor` still applies as a deny/approve list overlay.
