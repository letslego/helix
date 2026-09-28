import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  provider: { mock: true },
  description: "Investigate destinations",
  maxSteps: 3,
});
