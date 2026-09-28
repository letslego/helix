import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";
import type {
  ContextAssembleResult,
  ContextConfig,
  ContextPack,
  ContextPackKind,
  SubagentContextOptions,
  SubagentDefinition,
} from "./types.js";

const DEFAULT_MAX_CHARS = 8000;

/** Load versioned context packs from agent/context/**. */
export function loadContextPacks(contextDir: string): ContextPack[] {
  if (!existsSync(contextDir)) return [];
  const packs: ContextPack[] = [];
  walkMarkdown(contextDir, contextDir, packs);
  return packs;
}

function walkMarkdown(root: string, dir: string, out: ContextPack[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(root, full, out);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    out.push(parseContextFile(root, full));
  }
}

function parseContextFile(root: string, fullPath: string): ContextPack {
  const raw = readFileSync(fullPath, "utf8");
  const parsed = matter(raw);
  const rel = relative(root, fullPath).replace(/\\/g, "/");
  const derived = deriveIdAndKind(rel);
  const id = String(parsed.data.id ?? derived.id);
  const kind = (parsed.data.kind as ContextPackKind | undefined) ?? derived.kind;
  const title =
    (parsed.data.title as string | undefined) ??
    (parsed.data.name as string | undefined) ??
    humanize(id);
  const tags = Array.isArray(parsed.data.tags)
    ? (parsed.data.tags as string[])
    : [];
  return {
    id,
    kind,
    title,
    body: parsed.content.trim(),
    tags,
    sourcePath: rel,
  };
}

function deriveIdAndKind(rel: string): { id: string; kind: ContextPackKind } {
  const noExt = rel.replace(/\.md$/i, "");
  if (noExt === "org" || noExt.endsWith("/org")) {
    return { id: "org", kind: "org" };
  }
  if (noExt.startsWith("tenants/")) {
    return { id: `tenant:${basename(noExt)}`, kind: "tenant" };
  }
  if (noExt.startsWith("policies/")) {
    return { id: `policy:${basename(noExt)}`, kind: "policy" };
  }
  return { id: noExt.replace(/\//g, ":"), kind: "custom" };
}

function humanize(id: string): string {
  return id
    .split(/[:/_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function listContextPackIds(packs: ContextPack[]): string[] {
  return packs.map((p) => p.id);
}

/**
 * Resolve refs against available packs with optional subagent allowlist.
 * Supports exact ids and prefixes like `policy:*` / `tenant:*`.
 */
export function resolveContextPacks(
  packs: ContextPack[],
  refs: string[],
  allowed?: string[] | "*",
): { packs: ContextPack[]; denied: string[]; missing: string[] } {
  const denied: string[] = [];
  const missing: string[] = [];
  const selected: ContextPack[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const matches = packs.filter((p) => refMatch(ref, p.id));
    if (!matches.length) {
      missing.push(ref);
      continue;
    }
    for (const pack of matches) {
      if (seen.has(pack.id)) continue;
      if (!refAllow(pack.id, allowed)) {
        if (!denied.includes(pack.id)) denied.push(pack.id);
        continue;
      }
      seen.add(pack.id);
      selected.push(pack);
    }
  }

  // Stable order: org → tenant → policy → custom, then id
  const rank: Record<ContextPackKind, number> = {
    org: 0,
    tenant: 1,
    policy: 2,
    custom: 3,
  };
  selected.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id),
  );
  return { packs: selected, denied, missing };
}

function refMatch(ref: string, id: string): boolean {
  if (ref.endsWith(":*")) {
    const prefix = ref.slice(0, -1); // keep trailing :
    return id.startsWith(prefix) || id === ref.slice(0, -2);
  }
  if (ref.endsWith("*") && ref.includes(":")) {
    const prefix = ref.slice(0, -1);
    return id.startsWith(prefix);
  }
  return id === ref;
}

function refAllow(ref: string, allowed?: string[] | "*"): boolean {
  if (allowed == null || allowed === "*") return true;
  return allowed.some(
    (rule) =>
      rule === "*" ||
      rule === ref ||
      (rule.endsWith(":*") && (ref.startsWith(rule.slice(0, -1)) || ref === rule.slice(0, -2))) ||
      (rule.endsWith("*") && ref.startsWith(rule.slice(0, -1))),
  );
}

export function assembleContextBlock(
  packs: ContextPack[],
  facts?: Record<string, string>,
  maxChars = DEFAULT_MAX_CHARS,
): string {
  const sections: string[] = [];
  for (const pack of packs) {
    sections.push(`### ${pack.title} (\`${pack.id}\`)\n${pack.body}`);
  }
  if (facts && Object.keys(facts).length) {
    const lines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`);
    sections.push(`### Task facts\n${lines.join("\n")}`);
  }
  if (!sections.length) return "";

  let body = sections.join("\n\n");
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n\n…[context truncated]`;
  }
  return `## Organizational context\n\n${body}`;
}

/** Build the refs list for a subagent call using defaults + caller overrides. */
export function planContextRefs(options: {
  config?: ContextConfig;
  subagent?: SubagentDefinition;
  request?: SubagentContextOptions;
  tenantId?: string;
}): string[] {
  const req = options.request ?? {};
  const defaults = options.config?.defaultRefs ?? ["org"];
  const refs: string[] = [];

  if (!req.skipDefaults) {
    refs.push(...defaults);
    if (options.tenantId) refs.push(`tenant:${options.tenantId}`);
  }
  if (req.contextRefs?.length) refs.push(...req.contextRefs);

  // De-dupe preserving order
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });
}

export function prepareSubagentContext(
  packs: ContextPack[],
  options: {
    config?: ContextConfig;
    subagent: SubagentDefinition;
    request?: SubagentContextOptions;
    tenantId?: string;
  },
): ContextAssembleResult {
  const refs = planContextRefs(options);
  const allowed = options.subagent.allowedContextRefs ?? "*";
  const resolved = resolveContextPacks(packs, refs, allowed);
  const maxChars = options.config?.maxChars ?? DEFAULT_MAX_CHARS;
  const block = assembleContextBlock(
    resolved.packs,
    options.request?.facts,
    maxChars,
  );
  return {
    refs,
    applied: resolved.packs.map((p) => p.id),
    denied: resolved.denied,
    missing: resolved.missing,
    block,
  };
}

export function composeSubagentInstructions(
  baseInstructions: string,
  contextBlock: string,
): string {
  if (!contextBlock) return baseInstructions;
  return `${baseInstructions.trim()}\n\n${contextBlock}`.trim();
}

/** Convenience for tests / callers. */
export function contextStat(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
