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
import { httpChannel, webChannel } from "./channels.js";
import { defineSandbox } from "./sandbox.js";
import type {
  AgentConfig,
  ChannelDefinition,
  ConnectionDefinition,
  LoadedAgent,
  PolicyConfig,
  ScheduleDefinition,
  SkillDefinition,
  SubagentDefinition,
  ToolDefinition,
} from "./types.js";

const defaultPolicies: PolicyConfig = {
  requireApprovalFor: [],
  denyTools: [],
  maxToolCallsPerTurn: 12,
};

function helixPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function ensureLocalHelixResolution(rootDir: string): void {
  const linkDir = join(rootDir, "node_modules", "@letslego");
  const linkPath = join(linkDir, "helix");
  const target = helixPackageRoot();
  if (existsSync(linkPath)) return;
  mkdirSync(linkDir, { recursive: true });
  try {
    symlinkSync(target, linkPath, "dir");
  } catch {
    // ignore
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
  const configPath = firstExisting(join(agentDir, "agent.ts"), join(agentDir, "agent.js"));
  if (configPath) {
    const mod = await import(pathToFileURL(configPath).href);
    config = defineAgent(mod.default ?? mod.agent ?? {});
  }

  const tools = await loadTools(join(agentDir, "tools"));
  const skills = loadSkills(join(agentDir, "skills"));
  const policies = loadPolicies(join(agentDir, "policies.json"));
  const sandbox = await loadSandbox(agentDir);
  const channels = await loadChannels(join(agentDir, "channels"));
  const connections = await loadConnections(join(agentDir, "connections"));
  const subagents = await loadSubagents(join(agentDir, "subagents"));
  const schedules = await loadSchedules(join(agentDir, "schedules"));

  if (!channels.length) {
    channels.push(httpChannel(), webChannel());
  }

  return {
    rootDir,
    instructions,
    config,
    tools,
    skills,
    policies,
    sandbox,
    channels,
    connections,
    subagents,
    schedules,
  };
}

function firstExisting(...paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
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
    const name =
      def.name && def.name !== "unnamed_tool"
        ? def.name
        : basename(file, extname(file));
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
      const name = (parsed.data.name as string | undefined) ?? basename(file, ".md");
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

async function loadSandbox(agentDir: string) {
  const path = firstExisting(
    join(agentDir, "sandbox", "sandbox.ts"),
    join(agentDir, "sandbox", "sandbox.js"),
    join(agentDir, "sandbox.ts"),
  );
  if (!path) return defineSandbox({ backend: "local" });
  const mod = await import(pathToFileURL(path).href);
  return defineSandbox(mod.default ?? mod.sandbox ?? {});
}

async function loadChannels(dir: string): Promise<ChannelDefinition[]> {
  if (!existsSync(dir)) return [];
  const out: ChannelDefinition[] = [];
  for (const file of readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    const def = (mod.default ?? mod.channel) as ChannelDefinition | undefined;
    if (!def?.kind) throw new Error(`Invalid channel file: ${file}`);
    const name = def.name && def.name !== "channel" ? def.name : basename(file, extname(file));
    out.push({ ...def, name });
  }
  return out;
}

async function loadConnections(dir: string): Promise<ConnectionDefinition[]> {
  if (!existsSync(dir)) return [];
  const out: ConnectionDefinition[] = [];
  for (const file of readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    const def = (mod.default ?? mod.connection) as ConnectionDefinition | undefined;
    if (!def?.kind) throw new Error(`Invalid connection file: ${file}`);
    const name =
      def.name && def.name !== "connection" ? def.name : basename(file, extname(file));
    out.push({ ...def, name });
  }
  return out;
}

async function loadSubagents(dir: string): Promise<SubagentDefinition[]> {
  if (!existsSync(dir)) return [];
  const out: SubagentDefinition[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nested = join(dir, entry.name);
      const instructionsPath = join(nested, "instructions.md");
      if (!existsSync(instructionsPath)) continue;
      const configPath = firstExisting(join(nested, "agent.ts"), join(nested, "agent.js"));
      let config = defineAgent();
      if (configPath) {
        const mod = await import(pathToFileURL(configPath).href);
        config = defineAgent(mod.default ?? {});
      }
      out.push({
        name: entry.name,
        description: config.description ?? entry.name,
        instructions: readFileSync(instructionsPath, "utf8").trim(),
        config,
        tools: await loadTools(join(nested, "tools")),
      });
      continue;
    }
    if (/\.(ts|js)$/.test(entry.name)) {
      const mod = await import(pathToFileURL(join(dir, entry.name)).href);
      const def = (mod.default ?? mod.subagent) as SubagentDefinition | undefined;
      if (!def?.instructions) throw new Error(`Invalid subagent file: ${entry.name}`);
      const name =
        def.name && def.name !== "subagent"
          ? def.name
          : basename(entry.name, extname(entry.name));
      out.push({ ...def, name, tools: def.tools ?? [] });
    }
  }
  return out;
}

async function loadSchedules(dir: string): Promise<ScheduleDefinition[]> {
  if (!existsSync(dir)) return [];
  const out: ScheduleDefinition[] = [];
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".md")) {
      const raw = readFileSync(join(dir, file), "utf8");
      const parsed = matter(raw);
      out.push({
        name: (parsed.data.name as string | undefined) ?? basename(file, ".md"),
        cron: String(parsed.data.cron ?? "0 8 * * *"),
        prompt: parsed.content.trim(),
        description: parsed.data.description as string | undefined,
      });
      continue;
    }
    if (/\.(ts|js)$/.test(file)) {
      const mod = await import(pathToFileURL(join(dir, file)).href);
      const def = (mod.default ?? mod.schedule) as ScheduleDefinition | undefined;
      if (!def?.cron || !def.prompt) throw new Error(`Invalid schedule file: ${file}`);
      const name =
        def.name && def.name !== "schedule" ? def.name : basename(file, extname(file));
      out.push({ ...def, name });
    }
  }
  return out;
}

export function describeAgent(agent: LoadedAgent): string {
  return [
    `Agent root: ${agent.rootDir}`,
    `Model: ${agent.config.model}`,
    `Gateway routes: ${Object.keys(agent.config.gateway?.routes ?? {}).join(", ") || "(none)"}`,
    `Fallback models: ${agent.config.fallbackModels?.join(", ") || "(none)"}`,
    `Tools (${agent.tools.length}): ${agent.tools.map((t) => t.name).join(", ") || "(none)"}`,
    `Skills (${agent.skills.length}): ${agent.skills.map((s) => s.name).join(", ") || "(none)"}`,
    `Channels (${agent.channels.length}): ${agent.channels.map((c) => `${c.name}:${c.kind}`).join(", ")}`,
    `Connections (${agent.connections.length}): ${agent.connections.map((c) => c.name).join(", ") || "(none)"}`,
    `Subagents (${agent.subagents.length}): ${agent.subagents.map((s) => s.name).join(", ") || "(none)"}`,
    `Schedules (${agent.schedules.length}): ${agent.schedules.map((s) => `${s.name}[${s.cron}]`).join(", ") || "(none)"}`,
    `Sandbox: ${agent.sandbox.backend}`,
    `Approval-gated: ${[
      ...agent.policies.requireApprovalFor,
      ...agent.tools.filter((t) => t.requiresApproval).map((t) => t.name),
    ].join(", ") || "(none)"}`,
  ].join("\n");
}
