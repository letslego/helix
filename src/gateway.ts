import { completeWithFallback } from "./provider.js";
import type {
  AgentConfig,
  ChatMessage,
  GatewayConfig,
  ProviderConfig,
  TokenUsage,
  ToolDefinition,
} from "./types.js";

export interface GatewayRouteResult {
  model: string;
  reason: string;
  chain: string[];
}

export interface GatewayRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  /** Override routing text (defaults to last user message). */
  routeText?: string;
}

export interface GatewayResponse {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  usage: TokenUsage;
  modelUsed: string;
  routed: GatewayRouteResult;
}

/**
 * Helix AI Gateway — local-first model router.
 * Routes by intent, chains fallbacks, and tracks estimated spend.
 */
export class HelixGateway {
  constructor(
    private config: AgentConfig,
    private provider?: ProviderConfig,
  ) {}

  getConfig(): GatewayConfig {
    return (
      this.config.gateway ?? {
        defaultModel: this.config.model ?? "mock/helix-demo",
        routes: {},
      }
    );
  }

  resolve(text: string): GatewayRouteResult {
    const gateway = this.getConfig();
    const routes = gateway.routes ?? {};
    const lower = text.toLowerCase();

    for (const [keyword, model] of Object.entries(routes)) {
      if (lower.includes(keyword.toLowerCase())) {
        return {
          model,
          reason: `route:${keyword}`,
          chain: modelChain(model, this.config),
        };
      }
    }

    const model = gateway.defaultModel ?? this.config.model ?? "mock/helix-demo";
    return { model, reason: "default", chain: modelChain(model, this.config) };
  }

  async complete(request: GatewayRequest): Promise<GatewayResponse> {
    const lastUser =
      request.routeText ??
      [...request.messages].reverse().find((m) => m.role === "user")?.content ??
      "";
    const routed = this.resolve(lastUser);
    const response = await completeWithFallback(
      routed.chain,
      {
        messages: request.messages,
        tools: request.tools ?? [],
        temperature: request.temperature ?? this.config.temperature ?? 0.2,
      },
      this.provider ?? this.config.provider ?? { mock: true },
    );
    return { ...response, routed };
  }
}

export function resolveModel(
  message: string,
  config: AgentConfig,
): { model: string; reason: string } {
  const routed = new HelixGateway(config).resolve(message);
  return { model: routed.model, reason: routed.reason };
}

export function modelChain(primary: string, config: AgentConfig): string[] {
  const fallbacks = (config.fallbackModels ?? []).filter((m) => m !== primary);
  return [primary, ...fallbacks];
}

export function defineGateway(config: GatewayConfig): GatewayConfig {
  return {
    defaultModel: config.defaultModel ?? "mock/helix-demo",
    routes: config.routes ?? {},
  };
}
