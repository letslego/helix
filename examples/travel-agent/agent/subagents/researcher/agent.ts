import { defineAgent } from "../../../../../src/index.js";

export default defineAgent({
  model: "mock/helix-demo",
  provider: { mock: true },
  description: "Investigate destinations",
  maxSteps: 3,
});
