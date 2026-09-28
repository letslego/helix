import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function scaffoldProject(targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const agentDir = join(targetDir, "agent");
  const dirs = [
    join(agentDir, "tools"),
    join(agentDir, "skills"),
    join(agentDir, "channels"),
    join(agentDir, "connections"),
    join(agentDir, "subagents", "researcher"),
    join(agentDir, "schedules"),
    join(agentDir, "sandbox"),
    join(targetDir, "evals"),
  ];
  for (const dir of dirs) mkdirSync(dir, { recursive: true });

  writeIfMissing(
    join(targetDir, "package.json"),
    JSON.stringify(
      {
        name: "my-helix-agent",
        private: true,
        type: "module",
        scripts: {
          dev: "helix dev",
          start: "helix console",
          eval: "helix eval",
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
Use tools, sandbox, connections, and subagents when they improve accuracy.
For multi-domain requests, call route_domains or delegate_domains before answering.
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
  gateway: {
    defaultModel: "mock/helix-demo",
    routes: {
      research: "mock/helix-demo",
    },
  },
  domains: {
    minScore: 1,
    maxDomains: 2,
    parallel: true,
  },
});
`,
  );

  writeIfMissing(
    join(agentDir, "sandbox", "sandbox.ts"),
    `import { defineSandbox } from "@letslego/helix";

export default defineSandbox({
  backend: "local",
  bootstrap: ["workspace/.gitkeep"],
});
`,
  );

  writeIfMissing(
    join(agentDir, "channels", "http.ts"),
    `import { httpChannel } from "@letslego/helix";

export default httpChannel({ path: "/helix/v1" });
`,
  );

  writeIfMissing(
    join(agentDir, "channels", "web.ts"),
    `import { webChannel } from "@letslego/helix";

export default webChannel();
`,
  );

  writeIfMissing(
    join(agentDir, "tools", "get_weather.ts"),
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
    join(agentDir, "skills", "be_concise.md"),
    `---
name: be_concise
description: Keep answers short and scannable.
tags: [style]
---

Prefer short paragraphs and bullet lists. Avoid filler.
`,
  );

  writeIfMissing(
    join(agentDir, "subagents", "researcher", "instructions.md"),
    `# Researcher

You investigate questions briefly and return bullet findings.
`,
  );

  writeIfMissing(
    join(agentDir, "subagents", "researcher", "agent.ts"),
    `import { defineAgent } from "@letslego/helix";

export default defineAgent({
  model: "mock/helix-demo",
  provider: { mock: true },
  description: "Investigate questions",
});
`,
  );

  writeIfMissing(
    join(agentDir, "subagents", "researcher", "domain.json"),
    JSON.stringify(
      {
        id: "researcher",
        description: "Investigate open questions and gather brief findings",
        whenToUse: [
          "research a topic",
          "investigate",
          "look up background",
          "summarize findings",
        ],
        notFor: ["book a flight", "change production config"],
        keywords: ["research", "investigate", "findings"],
        preferParallel: true,
      },
      null,
      2,
    ) + "\n",
  );

  writeIfMissing(
    join(agentDir, "schedules", "morning_digest.md"),
    `---
name: morning_digest
cron: "0 8 * * *"
description: Daily digest
---

Send a short morning digest using memory and weather tools when useful.
`,
  );

  writeIfMissing(
    join(agentDir, "policies.json"),
    JSON.stringify(
      {
        requireApprovalFor: ["sandbox_exec"],
        denyTools: [],
        maxToolCallsPerTurn: 8,
      },
      null,
      2,
    ) + "\n",
  );

  writeIfMissing(
    join(targetDir, "evals", "suite.ts"),
    `import { defineEval } from "@letslego/helix";

export default defineEval({
  name: "smoke",
  cases: [
    {
      name: "weather",
      input: "What is the weather in Paris?",
      expectIncludes: ["Paris"],
      expectTools: ["get_weather"],
    },
  ],
});
`,
  );

  writeIfMissing(
    join(targetDir, ".env.example"),
    `OPENAI_API_KEY=
HELIX_PROVIDER_BASE_URL=https://api.openai.com/v1
PORT=8787
`,
  );

  writeIfMissing(
    join(targetDir, "README.md"),
    `# My Helix Agent

\`\`\`bash
npm install
npx helix console
npx helix stack
npx helix eval
\`\`\`
`,
  );
}

function writeIfMissing(path: string, contents: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, contents);
}
