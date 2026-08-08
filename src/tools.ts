import type { z } from "zod";
import type { ToolDefinition } from "./types.js";

export function defineTool<TSchema extends z.ZodTypeAny>(def: {
  name?: string;
  description: string;
  inputSchema: TSchema;
  requiresApproval?: boolean;
  execute: (input: z.infer<TSchema>, ctx: import("./types.js").ToolContext) => Promise<unknown> | unknown;
}): ToolDefinition {
  return {
    name: def.name ?? "unnamed_tool",
    description: def.description,
    inputSchema: def.inputSchema,
    requiresApproval: def.requiresApproval,
    execute: def.execute as ToolDefinition["execute"],
  };
}

export { z } from "zod";
