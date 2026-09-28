import { defineTool, z } from "@letslego/helix/tools";

export default defineTool({
  description: "Search demo flight options to a destination.",
  inputSchema: z.object({
    destination: z.string().min(1),
    cabin: z.enum(["economy", "premium", "business"]).default("economy"),
  }),
  async execute({ destination, cabin }) {
    const seed = destination.length + cabin.length;
    const base = 280 + seed * 7;
    return {
      destination,
      cabin,
      options: [
        {
          airline: "Northwind Air",
          flight: `NW${100 + seed}`,
          priceUsd: base,
          duration: "8h 15m",
          stops: 0,
        },
        {
          airline: "Cedar Airways",
          flight: `CA${200 + seed}`,
          priceUsd: base - 40,
          duration: "10h 05m",
          stops: 1,
        },
      ],
    };
  },
});
