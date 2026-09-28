/** Tool base class — each tool self-describes via getInfo(). */

export interface ToolSchemaProperty {
  type: string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolSchemaProperty>;
      required: string[];
    };
  };
}

export type ToolInvoke = (envState: unknown, kwargs: Record<string, unknown>) => unknown;

export interface ToolClass {
  name: string;
  description: string;
  invoke: ToolInvoke;
  getInfo: () => ToolSchema;
}

export function defineTool(def: {
  name: string;
  description: string;
  invoke: ToolInvoke;
  parameters?: Record<string, ToolSchemaProperty>;
  required?: string[];
}): ToolClass {
  const parameters = def.parameters ?? {};
  const required = def.required ?? Object.keys(parameters);
  return {
    name: def.name,
    description: def.description,
    invoke: def.invoke,
    getInfo() {
      return {
        type: "function",
        function: {
          name: def.name,
          description: def.description,
          parameters: {
            type: "object",
            properties: parameters,
            required,
          },
        },
      };
    },
  };
}

export function toolSchemas(tools: ToolClass[]): ToolSchema[] {
  return tools.map((t) => t.getInfo());
}
