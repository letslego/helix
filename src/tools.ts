import type { z } from "zod";
import type {
  ApprovalPolicy,
  ModelToolOutput,
  ToolContext,
  ToolDefinition,
} from "./types.js";

export interface DefineToolOptions<TSchema extends z.ZodTypeAny, TOutput = unknown> {
  name?: string;
  description: string;
  inputSchema: TSchema;
  outputSchema?: z.ZodTypeAny;
  /** @deprecated Prefer `approval: always()` */
  requiresApproval?: boolean;
  approval?: ApprovalPolicy;
  /**
   * Project rich tool output down to what the model should see.
   * Channels/hooks still receive the full execute return.
   */
  toModelOutput?: (output: TOutput) => ModelToolOutput;
  execute: (
    input: z.infer<TSchema>,
    ctx: ToolContext,
  ) =>
    | TOutput
    | Promise<TOutput>
    | AsyncGenerator<TOutput, TOutput | void, unknown>;
}

export function defineTool<TSchema extends z.ZodTypeAny, TOutput = unknown>(
  def: DefineToolOptions<TSchema, TOutput>,
): ToolDefinition {
  return {
    name: def.name ?? "unnamed_tool",
    description: def.description,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    requiresApproval: def.requiresApproval,
    approval: def.approval,
    toModelOutput: def.toModelOutput as ToolDefinition["toModelOutput"],
    execute: def.execute as ToolDefinition["execute"],
  };
}

/** Helpers for shaping model-facing tool outputs. */
export const toolOutput = {
  text(value: string): ModelToolOutput {
    return { type: "text", value };
  },
  json(value: unknown): ModelToolOutput {
    return { type: "json", value };
  },
};

export async function runToolExecute(
  tool: ToolDefinition,
  input: unknown,
  ctx: ToolContext,
  onPartial?: (snapshot: unknown) => void,
): Promise<{ raw: unknown; forModel: unknown }> {
  const result = tool.execute(input, ctx);

  let raw: unknown;
  if (isAsyncGenerator(result)) {
    let last: unknown = undefined;
    while (true) {
      const next = await result.next();
      if (next.done) {
        raw = next.value === undefined ? last : next.value;
        break;
      }
      last = next.value;
      onPartial?.(next.value);
      ctx.emit({
        type: "tool.partial",
        at: new Date().toISOString(),
        sessionId: ctx.sessionId,
        data: { name: tool.name, callId: ctx.callId, snapshot: next.value },
      });
    }
  } else {
    raw = await result;
  }

  if (tool.outputSchema) {
    const parsed = tool.outputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Tool ${tool.name} output schema failed: ${parsed.error.message}`);
    }
    raw = parsed.data;
  }

  const projected = tool.toModelOutput?.(raw);
  const forModel =
    projected == null
      ? raw
      : projected.type === "text"
        ? projected.value
        : projected.value;

  return { raw, forModel };
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as AsyncGenerator).next === "function" &&
      typeof (value as AsyncGenerator)[Symbol.asyncIterator] === "function",
  );
}

export { z } from "zod";
export { always, once, never, when } from "./approval.js";
