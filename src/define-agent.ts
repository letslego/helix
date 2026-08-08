import type { AgentConfig } from "./types.js";

export function defineAgent(config: AgentConfig = {}): AgentConfig {
  return {
    model: config.model ?? "mock/helix-demo",
    fallbackModels: config.fallbackModels ?? [],
    temperature: config.temperature ?? 0.2,
    maxSteps: config.maxSteps ?? 8,
    provider: config.provider ?? { mock: true },
    costBudgetUsd: config.costBudgetUsd,
  };
}
