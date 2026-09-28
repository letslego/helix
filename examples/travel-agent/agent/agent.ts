import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  fallbackModels: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet"],
  provider: { mock: true },
  temperature: 0.2,
  maxSteps: 6,
  costBudgetUsd: 0.5,
  gateway: {
    defaultModel: "mock/helix-demo",
    routes: {
      research: "mock/helix-demo",
      weather: "mock/helix-demo",
    },
  },
  domains: {
    minScore: 1,
    maxDomains: 2,
    parallel: true,
  },
  context: {
    mode: (process.env.HELIX_CONTEXT_MODE as "local" | "hybrid" | "sidecar") ?? "local",
    defaultRefs: ["org", "policy:pii", "policy:mnpi"],
    maxChars: 6000,
    policyEngine: {
      baseUrl: process.env.HELIX_POLICY_SIDECAR_URL ?? "http://127.0.0.1:8181",
      failClosed: true,
      timeoutMs: 2000,
    },
  },
});
