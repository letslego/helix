import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import { defineAgent } from "./define-agent.js";
import type {
  AgentConfig,
  LoadedAgent,
  PolicyConfig,
  SkillDefinition,
  ToolDefinition,
} from "./types.js";

const defaultPolicies: PolicyConfig = {
  requireApprovalFor: [],
  denyTools: [],
  maxToolCallsPerTurn: 12,
};

/** Helix package root (works from src/ via tsx and from dist/ after build). */
function helixPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ -> ..   or dist/ -> ..
  return resolve(here, "..");
}

/**
 * Ensure agent files can import `@letslego/helix` even before the project has
 * installed dependencies (local demos, tests, scaffolds).
 */
function ensureLocalHelixResolution(rootDir: string): void {
  const linkDir = join(rootDir, "node_modules", "@letslego");
  const linkPath = join(linkDir, "helix");
  const target = helixPackageRoot();
  if (existsSync(linkPath)) return;
  mkdirSync(linkDir, { recursive: true });
  try {
    symlinkSync(target, linkPath, "dir");
  } catch {
    // Another process may have created it; ignore collisions.
  }
}

export async function loadAgent(projectDir: string): Promise<LoadedAgent> {
  const rootDir = resolve(projectDir);
  ensureLocalHelixResolution(rootDir);
  const agentDir = join(rootDir, "agent");
  if (!existsSync(agentDir)) {
    throw new Error(`No agent/ directory found in ${rootDir}`);
  }

  const instructionsPath = join(agentDir, "instructions.md");
  if (!existsSync(instructionsPath)) {
    throw new Error(`Missing required file: agent/instructions.md`);
  }
  const instructions = readFileSync(instructionsPath, "utf8").trim();

  let config: AgentConfig = defineAgent();
  const configPath = join(agentDir, "agent.ts");
  const configPathJs = join(agentDir, "agent.js");
  if (existsSync(configPath) || existsSync(configPathJs)) {
    const mod = await import(
      pathToFileURL(existsSync(configPath) ? configPath : configPathJs).href
    );
    config = defineAgent(mod.default ?? mod.agent ?? {});
  }

  const tools = await loadTools(join(agentDir, "tools"));
  const skills = loadSkills(join(agentDir, "skills"));
  const policies = loadPolicies(join(agentDir, "policies.json"));

  return { rootDir, instructions, config, tools, skills, policies };
}

async function loadTools(toolsDir: string): Promise<ToolDefinition[]> {
  if (!existsSync(toolsDir)) return [];
  const files = readdirSync(toolsDir).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js"),
  );
  const tools: ToolDefinition[] = [];
  for (const file of files) {
    const full = join(toolsDir, file);
    const mod = await import(pathToFileURL(full).href);
    const def = (mod.default ?? mod.tool) as ToolDefinition | undefined;
    if (!def || typeof def.execute !== "function") {
      throw new Error(`Tool file ${file} must default-export a tool definition`);
    }
    const name = def.name && def.name !== "unnamed_tool" ? def.name : basename(file, extname(file));
    tools.push({ ...def, name });
  }
  return tools;
}

function loadSkills(skillsDir: string): SkillDefinition[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(skillsDir, file), "utf8");
      const parsed = matter(raw);
      const name =
        (parsed.data.name as string | undefined) ??
        basename(file, ".md");
      const description =
        (parsed.data.description as string | undefined) ??
        parsed.content.trim().split("\n")[0] ??
        name;
      const tags = Array.isArray(parsed.data.tags)
        ? (parsed.data.tags as string[])
        : [];
      return { name, description, body: parsed.content.trim(), tags };
    });
}

function loadPolicies(path: string): PolicyConfig {
  if (!existsSync(path)) return { ...defaultPolicies };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PolicyConfig>;
  return {
    requireApprovalFor: raw.requireApprovalFor ?? [],
    denyTools: raw.denyTools ?? [],
    maxToolCallsPerTurn: raw.maxToolCallsPerTurn ?? 12,
  };
}

export function describeAgent(agent: LoadedAgent): string {
  const lines = [
    `Agent root: ${agent.rootDir}`,
    `Model: ${agent.config.model}`,
    `Fallback models: ${agent.config.fallbackModels?.join(", ") || "(none)"}`,
    `Tools (${agent.tools.length}): ${agent.tools.map((t) => t.name).join(", ") || "(none)"}`,
    `Skills (${agent.skills.length}): ${agent.skills.map((s) => s.name).join(", ") || "(none)"}`,
    `Approval-gated: ${[
      ...agent.policies.requireApprovalFor,
      ...agent.tools.filter((t) => t.requiresApproval).map((t) => t.name),
    ].join(", ") || "(none)"}`,
  ];
  return lines.join("\n");
}
