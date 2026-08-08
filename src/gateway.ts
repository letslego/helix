import type { AgentConfig, GatewayConfig } from "./types.js";

/**
 * Helix Gateway — provider-agnostic model routing.
 * Similar in role to a hosted AI gateway, but local-first and configurable
 * from agent.ts without a proprietary control plane.
 */
export function resolveModel(
  message: string,
  config: AgentConfig,
): { model: string; reason: string } {
  const gateway: GatewayConfig = config.gateway ?? {};
  const routes = gateway.routes ?? {};
  const lower = message.toLowerCase();

  for (const [keyword, model] of Object.entries(routes)) {
    if (lower.includes(keyword.toLowerCase())) {
      return { model, reason: `route:${keyword}` };
    }
  }

  return {
    model: gateway.defaultModel ?? config.model ?? "mock/helix-demo",
    reason: "default",
  };
}

export function modelChain(primary: string, config: AgentConfig): string[] {
  const fallbacks = (config.fallbackModels ?? []).filter((m) => m !== primary);
  return [primary, ...fallbacks];
}
