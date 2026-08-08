import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function scaffoldProject(targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const agentDir = join(targetDir, "agent");
  const toolsDir = join(agentDir, "tools");
  const skillsDir = join(agentDir, "skills");
  const evalsDir = join(targetDir, "evals");

  for (const dir of [agentDir, toolsDir, skillsDir, evalsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  writeIfMissing(
    join(targetDir, "package.json"),
    JSON.stringify(
      {
        name: "my-helix-agent",
        private: true,
        type: "module",
        scripts: {
          dev: "helix dev",
          start: "helix run",
          console: "helix console",
        },
        dependencies: {
          "@letslego/helix": "^0.1.0",
          zod: "^3.24.2",
        },
      },
      null,
      2,
    ) + "\n",
  );

  writeIfMissing(
    join(agentDir, "instructions.md"),
    `# Instructions

You are a helpful durable agent built with Helix.
Be concise, call tools when they improve accuracy, and explain what you did.
`,
  );

  writeIfMissing(
    join(agentDir, "agent.ts"),
    `import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  fallbackModels: ["openai/gpt-4.1-mini"],
  provider: { mock: true },
  costBudgetUsd: 1,
});
`,
  );

  writeIfMissing(
    join(toolsDir, "get_weather.ts"),
    `import { defineTool, z } from "@letslego/helix/tools";

export default defineTool({
  description: "Return mock weather for a city.",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
});
`,
  );

  writeIfMissing(
    join(skillsDir, "be_concise.md"),
    `---
name: be_concise
description: Keep answers short and scannable.
tags: [style]
---

Prefer short paragraphs and bullet lists. Avoid filler.
`,
  );

  writeIfMissing(
    join(agentDir, "policies.json"),
    JSON.stringify(
      {
        requireApprovalFor: [],
        denyTools: [],
        maxToolCallsPerTurn: 8,
      },
      null,
      2,
    ) + "\n",
  );

  writeIfMissing(
    join(targetDir, ".env.example"),
    `# Optional when provider.mock is false
OPENAI_API_KEY=
HELIX_PROVIDER_BASE_URL=https://api.openai.com/v1
`,
  );

  writeIfMissing(
    join(targetDir, "README.md"),
    `# My Helix Agent

\`\`\`bash
npm install
npx helix dev
\`\`\`

Edit \`agent/instructions.md\`, add tools under \`agent/tools/\`, and skills under \`agent/skills/\`.
`,
  );
}

function writeIfMissing(path: string, contents: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, contents);
}
