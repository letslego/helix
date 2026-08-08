import type { z } from "zod";
import type { ToolDefinition } from "./types.js";

export function defineTool<TSchema extends z.ZodTypeAny>(
  def: Omit<ToolDefinition<TSchema>, "name"> & { name?: string },
): ToolDefinition<TSchema> {
  return {
    name: def.name ?? "unnamed_tool",
    description: def.description,
    inputSchema: def.inputSchema,
    requiresApproval: def.requiresApproval,
    execute: def.execute,
  };
}

export { z } from "zod";
