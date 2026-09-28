import { defineAgent } from "../../../../../src/index.js";

export default defineAgent({
  model: "mock/helix-demo",
  provider: { mock: true },
  description: "Summarize weather for trip planning",
  maxSteps: 3,
});
