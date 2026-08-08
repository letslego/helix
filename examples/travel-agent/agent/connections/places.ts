import { defineMcpConnection } from "../../../../src/connections.js";

export default defineMcpConnection({
  name: "places",
  url: "https://example.local/mcp/places",
  description: "Demo places/MCP connection with a local tool handler.",
  tools: [
    {
      name: "top_sights",
      description: "Return demo top sights for a city",
      async handler(input) {
        const city = String(input.city ?? "Paris");
        return {
          city,
          sights: [
            `${city} Old Town`,
            `${city} River Walk`,
            `${city} Central Museum`,
          ],
        };
      },
    },
  ],
});
