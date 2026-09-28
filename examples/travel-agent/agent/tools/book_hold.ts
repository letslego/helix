import { always, defineTool, toolOutput, z } from "@letslego/helix/tools";

export default defineTool({
  description: "Place a temporary hold on a flight (requires approval).",
  approval: always(),
  inputSchema: z.object({
    flight: z.string().min(1),
    passenger: z.string().min(1),
  }),
  async execute({ flight, passenger }, ctx) {
    const holdId = `HOLD-${flight}-${Date.now().toString(36).toUpperCase()}`;
    ctx.memory.write({
      kind: "episode",
      content: `Hold ${holdId} for ${passenger} on ${flight}`,
      tags: ["booking", "hold"],
    });
    return {
      holdId,
      flight,
      passenger,
      expiresInHours: 24,
      status: "held",
    };
  },
  toModelOutput(output) {
    return toolOutput.text(
      `Hold ${output.holdId} placed on ${output.flight} for ${output.passenger}.`,
    );
  },
});
