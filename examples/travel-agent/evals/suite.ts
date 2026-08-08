import { defineEval } from "../../../src/evals.js";

export default defineEval({
  name: "travel-smoke",
  cases: [
    {
      name: "paris-plan",
      input: "Plan a weekend trip to Paris.",
      expectIncludes: ["Paris"],
      expectTools: ["search_flights", "get_weather"],
    },
    {
      name: "weather-only",
      input: "What is the weather in Tokyo?",
      expectIncludes: ["Tokyo"],
      expectTools: ["get_weather"],
    },
  ],
});
