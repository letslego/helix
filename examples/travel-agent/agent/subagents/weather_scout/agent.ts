import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  provider: { mock: true },
  description: "Summarize weather for trip planning",
  maxSteps: 3,
});
