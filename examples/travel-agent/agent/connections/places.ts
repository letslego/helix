import { connect, defineMcpConnection } from "../../../../src/connect.js";

export default defineMcpConnection({
  name: "places",
  url: "https://example.local/mcp/places",
  description: "Demo places connection — credentials stay in the app runtime.",
  auth: connect({ tokenEnv: "PLACES_TOKEN" }),
  tools: [
    {
      name: "top_sights",
      description: "Return demo top sights for a city",
      async handler(input, ctx) {
        // ctx.headers may include Authorization; never return it to the model.
        const city = String(input.city ?? "Paris");
        return {
          city,
          sights: [
            `${city} Old Town`,
            `${city} River Walk`,
            `${city} Central Museum`,
          ],
          brokered: Boolean(ctx?.headers),
        };
      },
    },
  ],
});
