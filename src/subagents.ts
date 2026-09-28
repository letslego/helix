import type { AgentConfig, SubagentDefinition, ToolDefinition } from "./types.js";
import { defineAgent } from "./define-agent.js";
import type { DomainCard } from "./types.js";

export interface DefineSubagentOptions {
  name?: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: ToolDefinition[];
  config?: AgentConfig;
  /** Give the subagent its own sandbox session id namespace. */
  isolatedSandbox?: boolean;
  /** Capability card for domain routing. */
  domain?: Omit<DomainCard, "id"> & { id?: string };
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
    domain: def.domain,
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
