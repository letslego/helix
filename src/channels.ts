import type { ChannelDefinition } from "./types.js";

export function defineChannel(
  def: Omit<ChannelDefinition, "name"> & { name?: string },
): ChannelDefinition {
  return {
    name: def.name ?? "channel",
    kind: def.kind,
    description: def.description,
    config: def.config ?? {},
  };
}

export function httpChannel(
  config: { path?: string; auth?: "none" | "bearer" } = {},
): ChannelDefinition {
  return defineChannel({
    name: "http",
    kind: "http",
    description: "HTTP JSON API for sessions and streaming turns",
    config: { path: config.path ?? "/helix/v1", auth: config.auth ?? "none" },
  });
}

export function webChannel(
  config: { path?: string } = {},
): ChannelDefinition {
  return defineChannel({
    name: "web",
    kind: "web",
    description: "Built-in operator web chat console",
    config: { path: config.path ?? "/" },
  });
}

export function slackChannel(
  config: { webhookEnv?: string } = {},
): ChannelDefinition {
  return defineChannel({
    name: "slack",
    kind: "slack",
    description: "Slack channel adapter (webhook/token via env)",
    config: { webhookEnv: config.webhookEnv ?? "SLACK_WEBHOOK_URL" },
  });
}

export function discordChannel(
  config: { tokenEnv?: string } = {},
): ChannelDefinition {
  return defineChannel({
    name: "discord",
    kind: "discord",
    description: "Discord channel adapter",
    config: { tokenEnv: config.tokenEnv ?? "DISCORD_BOT_TOKEN" },
  });
}
