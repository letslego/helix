# Workflows

Every Helix turn runs as a durable workflow under `.helix/workflows/`.

## Model

- **session** — long-lived conversation
- **turn** — one user message and the work it triggers (one workflow run)
- **step** — checkpointed unit (`model:N`, `tool:N:callId:name`)

Completed steps **never re-run**. Helix replays their recorded result. A step interrupted mid-execution re-runs, so gate non-idempotent side effects with `approval: always()`.

## Park & resume

When a tool needs approval, the workflow parks (`workflow.park`) and holds no compute. After `resolveApproval`, call `run` again with the same `sessionId` (and optional `workflowId`) — completed steps replay, and the gated tool continues.

```ts
const result = await runtime.run({ message: "Book it", sessionId });
if (result.parked) {
  runtime.resolveApproval(result.sessionId, approvalId, true);
  await runtime.run({
    message: "Book it",
    sessionId: result.sessionId,
    workflowId: result.workflowId,
    autoApprove: true,
  });
}
```

## Authoring steps in tools

```ts
import { step } from "@letslego/helix/workflow";

// Inside custom orchestration code with a WorkflowContext:
await step("fetch-profile", ctx, async () => loadProfile(id));
```

The runtime already wraps model calls and tool executions in `wf.step(...)`.
