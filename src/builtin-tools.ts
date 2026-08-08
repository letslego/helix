import { z } from "zod";
import { defineTool } from "./tools.js";
import type { ToolDefinition } from "./types.js";

/** Built-in sandbox + connection tools mounted when those capabilities exist. */
export function createBuiltinTools(options: {
  hasSandbox: boolean;
  connectionNames: string[];
  subagentNames: string[];
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  if (options.hasSandbox) {
    tools.push(
      defineTool({
        name: "sandbox_write_file",
        description: "Write a file inside the agent sandbox.",
        inputSchema: z.object({
          path: z.string().min(1),
          contents: z.string(),
        }),
        async execute({ path, contents }, ctx) {
          ctx.sandbox.writeFile(path, contents);
          return { ok: true, path };
        },
      }),
      defineTool({
        name: "sandbox_read_file",
        description: "Read a file from the agent sandbox.",
        inputSchema: z.object({ path: z.string().min(1) }),
        async execute({ path }, ctx) {
          return { path, contents: ctx.sandbox.readFile(path) };
        },
      }),
      defineTool({
        name: "sandbox_list",
        description: "List files in the agent sandbox.",
        inputSchema: z.object({ path: z.string().default(".") }),
        async execute({ path }, ctx) {
          return { files: ctx.sandbox.list(path) };
        },
      }),
      defineTool({
        name: "sandbox_glob",
        description: "Glob files inside the sandbox.",
        inputSchema: z.object({ pattern: z.string().min(1) }),
        async execute({ pattern }, ctx) {
          return { files: ctx.sandbox.glob?.(pattern) ?? [] };
        },
      }),
      defineTool({
        name: "sandbox_grep",
        description: "Search file contents inside the sandbox.",
        inputSchema: z.object({
          pattern: z.string().min(1),
          path: z.string().default("."),
        }),
        async execute({ pattern, path }, ctx) {
          return { hits: ctx.sandbox.grep?.(pattern, path) ?? [] };
        },
      }),
      defineTool({
        name: "sandbox_exec",
        description: "Run a constrained command inside the sandbox working directory.",
        requiresApproval: true,
        inputSchema: z.object({ command: z.string().min(1) }),
        async execute({ command }, ctx) {
          const result = ctx.getSandbox().bash?.(command) ?? ctx.sandbox.exec(command);
          ctx.emit({
            type: "sandbox.exec",
            at: new Date().toISOString(),
            sessionId: ctx.sessionId,
            data: { command, ...result },
          });
          return result;
        },
      }),
    );
  }

  if (options.connectionNames.length) {
    tools.push(
      defineTool({
        name: "connection_call",
        description: `Call a connected service tool. Available: ${options.connectionNames.join(", ")}`,
        inputSchema: z.object({
          connection: z.string(),
          tool: z.string(),
          input: z.record(z.unknown()).default({}),
        }),
        async execute({ connection, tool, input }, ctx) {
          const output = await ctx.connections.call(
            connection,
            tool,
            input as Record<string, unknown>,
          );
          ctx.emit({
            type: "connection.call",
            at: new Date().toISOString(),
            sessionId: ctx.sessionId,
            data: { connection, tool, output },
          });
          return output;
        },
      }),
    );
  }

  if (options.subagentNames.length) {
    tools.push(
      defineTool({
        name: "delegate_subagent",
        description: `Delegate work to a specialist subagent. Available: ${options.subagentNames.join(", ")}`,
        inputSchema: z.object({
          name: z.string(),
          task: z.string().min(1),
        }),
        async execute({ name, task }, ctx) {
          const reply = await ctx.runSubagent(name, task);
          return { name, reply };
        },
      }),
    );
  }

  return tools;
}
