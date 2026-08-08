import type { AgentConfig, SubagentDefinition, ToolDefinition } from "./types.js";
import { defineAgent } from "./define-agent.js";

export interface DefineSubagentOptions {
  name?: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: ToolDefinition[];
  config?: AgentConfig;
  /** Give the subagent its own sandbox session id namespace. */
  isolatedSandbox?: boolean;
}

export function defineSubagent(def: DefineSubagentOptions): SubagentDefinition {
  return {
    name: def.name ?? "subagent",
    description: def.description,
    instructions: def.instructions,
    config: defineAgent({
      ...(def.config ?? {}),
      model: def.model ?? def.config?.model,
      description: def.description,
    }),
    tools: def.tools ?? [],
    isolatedSandbox: def.isolatedSandbox ?? true,
  };
}

/** Fan-out helper for parallel specialist work. */
export async function delegateMany(
  names: string[],
  task: string,
  runOne: (name: string, task: string) => Promise<string>,
): Promise<Array<{ name: string; reply: string }>> {
  return Promise.all(
    names.map(async (name) => ({ name, reply: await runOne(name, task) })),
  );
}
