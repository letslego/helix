import type { AgentConfig, SubagentDefinition, ToolDefinition } from "./types.js";
import { defineAgent } from "./define-agent.js";

export function defineSubagent(def: {
  name?: string;
  description: string;
  instructions: string;
  model?: string;
  tools?: ToolDefinition[];
  config?: AgentConfig;
}): SubagentDefinition {
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
  };
}
