import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RuntimeEvent, RuntimeEventType } from "./types.js";

export type WorkflowStatus = "running" | "parked" | "completed" | "failed";

export interface WorkflowStepRecord {
  name: string;
  status: "done" | "error";
  result?: unknown;
  error?: string;
  at: string;
}

export interface WorkflowParkState {
  reason: string;
  data?: Record<string, unknown>;
  at: string;
}

export interface WorkflowRun {
  id: string;
  sessionId: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStepRecord[];
  park?: WorkflowParkState;
  meta?: Record<string, unknown>;
}

export interface WorkflowContext {
  run: WorkflowRun;
  sessionId: string;
  step: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
  checkpoint: (name: string, data?: Record<string, unknown>) => void;
  park: (reason: string, data?: Record<string, unknown>) => void;
  emit: (type: RuntimeEventType, data?: Record<string, unknown>) => RuntimeEvent;
  /** True when a named step already completed and its result was replayed. */
  wasReplayed: (name: string) => boolean;
}

/**
 * Local-first durable workflow world.
 * Completed steps never re-run; parked runs resume from disk.
 */
export class WorkflowWorld {
  private dir: string;

  constructor(rootDir: string) {
    this.dir = join(rootDir, ".helix", "workflows");
    mkdirSync(this.dir, { recursive: true });
  }

  create(sessionId: string, meta?: Record<string, unknown>): WorkflowRun {
    const now = new Date().toISOString();
    const run: WorkflowRun = {
      id: randomUUID(),
      sessionId,
      status: "running",
      createdAt: now,
      updatedAt: now,
      steps: [],
      meta,
    };
    this.save(run);
    return run;
  }

  get(id: string): WorkflowRun | null {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as WorkflowRun;
  }

  list(sessionId?: string): WorkflowRun[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf8")) as WorkflowRun)
      .filter((r) => (sessionId ? r.sessionId === sessionId : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  save(run: WorkflowRun): void {
    run.updatedAt = new Date().toISOString();
    writeFileSync(join(this.dir, `${run.id}.json`), JSON.stringify(run, null, 2));
  }

  /**
   * Bind a run into a step-aware context.
   * `step(name, fn)` replays recorded results for completed steps.
   */
  bind(
    run: WorkflowRun,
    emit: (type: RuntimeEventType, data?: Record<string, unknown>) => RuntimeEvent,
  ): WorkflowContext {
    const replayed = new Set<string>();

    const checkpoint = (name: string, data?: Record<string, unknown>) => {
      emit("checkpoint", { workflowId: run.id, name, ...data });
    };

    const step = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      const existing = run.steps.find((s) => s.name === name && s.status === "done");
      if (existing) {
        replayed.add(name);
        emit("workflow.replay", { workflowId: run.id, step: name, result: existing.result });
        return existing.result as T;
      }

      emit("workflow.step.start", { workflowId: run.id, step: name });
      checkpoint(`step:${name}:start`);
      try {
        const value = await fn();
        run.steps.push({
          name,
          status: "done",
          result: value ?? null,
          at: new Date().toISOString(),
        });
        this.save(run);
        checkpoint(`step:${name}:done`, { ok: true });
        emit("workflow.step.done", { workflowId: run.id, step: name });
        return value;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        run.steps.push({
          name,
          status: "error",
          error: message,
          at: new Date().toISOString(),
        });
        run.status = "failed";
        this.save(run);
        checkpoint(`step:${name}:error`, { error: message });
        emit("workflow.step.error", { workflowId: run.id, step: name, error: message });
        throw err;
      }
    };

    const park = (reason: string, data?: Record<string, unknown>) => {
      run.status = "parked";
      run.park = { reason, data, at: new Date().toISOString() };
      this.save(run);
      emit("workflow.park", { workflowId: run.id, reason, data });
      checkpoint("park", { reason, ...data });
    };

    return {
      run,
      sessionId: run.sessionId,
      step,
      checkpoint,
      park,
      emit,
      wasReplayed: (name) => replayed.has(name),
    };
  }

  complete(run: WorkflowRun): void {
    run.status = "completed";
    run.park = undefined;
    this.save(run);
  }

  resume(run: WorkflowRun): WorkflowRun {
    run.status = "running";
    run.park = undefined;
    this.save(run);
    return run;
  }
}

/** Convenience helper matching the public `step()` export. */
export async function step<T>(
  name: string,
  ctx: Pick<WorkflowContext, "step">,
  fn: () => Promise<T> | T,
): Promise<T> {
  return ctx.step(name, fn);
}
