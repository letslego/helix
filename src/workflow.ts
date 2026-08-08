import type { RuntimeEvent, RuntimeEventType } from "./types.js";

/**
 * Lightweight durable workflow helpers.
 * Steps are checkpointed into the event log so runs can park and resume.
 */
export interface WorkflowStepContext {
  sessionId: string;
  checkpoint: (name: string, data?: Record<string, unknown>) => void;
  emit: (type: RuntimeEventType, data?: Record<string, unknown>) => RuntimeEvent;
}

export async function step<T>(
  name: string,
  ctx: WorkflowStepContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  ctx.checkpoint(`step:${name}:start`);
  try {
    const value = await fn();
    ctx.checkpoint(`step:${name}:done`, { ok: true });
    return value;
  } catch (err) {
    ctx.checkpoint(`step:${name}:error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
