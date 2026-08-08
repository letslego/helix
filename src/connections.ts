import type { ConnectionDefinition, ConnectionRegistry } from "./types.js";

export function defineConnection(
  def: Omit<ConnectionDefinition, "name"> & { name?: string },
): ConnectionDefinition {
  return {
    name: def.name ?? "connection",
    description: def.description,
    kind: def.kind,
    url: def.url,
    authEnv: def.authEnv,
    tools: def.tools ?? [],
  };
}

export function defineMcpConnection(
  def: {
    name?: string;
    url: string;
    description: string;
    authEnv?: string;
    tools?: ConnectionDefinition["tools"];
  },
): ConnectionDefinition {
  return defineConnection({
    name: def.name,
    kind: "mcp",
    url: def.url,
    description: def.description,
    authEnv: def.authEnv,
    tools: def.tools,
  });
}

export function createConnectionRegistry(
  connections: ConnectionDefinition[],
): ConnectionRegistry {
  const byName = new Map(connections.map((c) => [c.name, c]));
  return {
    list: () => [...connections],
    async call(connection, tool, input) {
      const conn = byName.get(connection);
      if (!conn) throw new Error(`Unknown connection: ${connection}`);
      const t = (conn.tools ?? []).find((x) => x.name === tool);
      if (!t) {
        // Remote MCP call stub — keeps credentials out of the model prompt.
        return {
          connection,
          tool,
          ok: false,
          error: `Tool ${tool} not registered locally for ${connection}`,
          url: conn.url,
        };
      }
      return t.handler(input);
    },
  };
}
