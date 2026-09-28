import { defineTool, z } from "@letslego/helix/tools";

const MOCK: Record<string, { condition: string; temperatureF: number }> = {
  paris: { condition: "Partly cloudy", temperatureF: 64 },
  tokyo: { condition: "Clear", temperatureF: 71 },
  rome: { condition: "Sunny", temperatureF: 78 },
  "san francisco": { condition: "Foggy", temperatureF: 58 },
};

export default defineTool({
  description: "Return weather for a city (demo dataset).",
  inputSchema: z.object({
    city: z.string().min(1),
  }),
  async execute({ city }, ctx) {
    const key = city.toLowerCase().trim();
    const hit = MOCK[key] ?? { condition: "Mild", temperatureF: 70 };
    ctx.memory.write({
      kind: "fact",
      content: `Weather lookup: ${city} -> ${hit.condition}, ${hit.temperatureF}F`,
      tags: ["weather", city.toLowerCase()],
    });
    return { city, ...hit, source: "demo-cache" };
  },
});
