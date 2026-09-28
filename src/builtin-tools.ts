import { z } from "zod";
import {
  DomainRegistry,
  delegateDomains,
  routeDomains,
} from "./domains.js";
import { defineTool } from "./tools.js";
import type { DomainCard, DomainRouterConfig, ToolDefinition } from "./types.js";

/** Built-in sandbox + connection tools mounted when those capabilities exist. */
export function createBuiltinTools(options: {
  hasSandbox: boolean;
  connectionNames: string[];
  subagentNames: string[];
  domains?: DomainCard[];
  domainRouter?: DomainRouterConfig;
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const registry = new DomainRegistry(options.domains ?? []);
  const domainConfig = options.domainRouter ?? {};

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
    const domainBlurb = registry.list().length
      ? `\nDomain cards:\n${registry.describe()}`
      : "";
    tools.push(
      defineTool({
        name: "route_domains",
        description:
          `Score domain capability cards for a user request and return domain ids` +
          ` (empty means handle on the root agent). Available subagents: ${options.subagentNames.join(", ")}.${domainBlurb}`,
        inputSchema: z.object({
          text: z.string().min(1),
        }),
        async execute({ text }, ctx) {
          const plan = routeDomains(text, registry, domainConfig);
          ctx.emit({
            type: "domain.route",
            at: new Date().toISOString(),
            sessionId: ctx.sessionId,
            data: { ...plan, text },
          });
          return plan;
        },
      }),
      defineTool({
        name: "delegate_subagent",
        description: `Delegate work to a specialist subagent. Available: ${options.subagentNames.join(", ")}.${domainBlurb}`,
        inputSchema: z.object({
          name: z.string(),
          task: z.string().min(1),
        }),
        async execute({ name, task }, ctx) {
          const reply = await ctx.runSubagent(name, task);
          return { name, reply };
        },
      }),
      defineTool({
        name: "delegate_domains",
        description:
          `Route a task to one or more domain subagents (parallel or serial) and return their replies.` +
          ` Omit domains to auto-route from text/task. Available: ${options.subagentNames.join(", ")}.${domainBlurb}`,
        inputSchema: z.object({
          task: z.string().min(1),
          text: z.string().optional(),
          domains: z.array(z.string()).optional(),
          mode: z.enum(["parallel", "serial"]).optional(),
        }),
        async execute({ task, text, domains, mode }, ctx) {
          const plan =
            domains && domains.length
              ? {
                  domains,
                  mode: mode ?? (domains.length > 1 ? "parallel" : "serial"),
                  reason: "explicit",
                  hits: domains.map((id) => ({
                    id,
                    score: 1,
                    reasons: ["explicit"],
                  })),
                }
              : routeDomains(text ?? task, registry, domainConfig);

          if (mode) plan.mode = mode;
          if (!plan.domains.length) {
            ctx.emit({
              type: "domain.route",
              at: new Date().toISOString(),
              sessionId: ctx.sessionId,
              data: { ...plan, task, skipped: true },
            });
            return { plan, results: [] };
          }

          ctx.emit({
            type: "domain.route",
            at: new Date().toISOString(),
            sessionId: ctx.sessionId,
            data: { ...plan, task },
          });

          const results = await delegateDomains(plan, task, (name, t) =>
            ctx.runSubagent(name, t),
          );
          return { plan, results };
        },
      }),
    );
  }

  return tools;
}
