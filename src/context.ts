import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";
import type {
  ContextAssembleResult,
  ContextConfig,
  ContextMode,
  ContextPack,
  ContextPackKind,
  PolicySubject,
  SubagentContextOptions,
  SubagentDefinition,
} from "./types.js";
import {
  PolicySidecarClient,
  authorizePackAttachments,
  splitRefsForMode,
} from "./policy-engine.js";

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
    source: "local",
    policyEngine: { contacted: false, failClosed: false },
  };
}

/**
 * Resolve context for a specialist in local, sidecar, or hybrid (K8s) mode.
 * Policy packs are authorized + fetched from the policy-engine sidecar when configured.
 */
export async function prepareSubagentContextAsync(
  packs: ContextPack[],
  options: {
    config?: ContextConfig;
    subagent: SubagentDefinition;
    request?: SubagentContextOptions;
    tenantId?: string;
    subject?: Partial<PolicySubject>;
    policyClient?: PolicySidecarClient;
  },
): Promise<ContextAssembleResult> {
  const mode: ContextMode =
    options.config?.mode ??
    (process.env.HELIX_CONTEXT_MODE as ContextMode | undefined) ??
    "local";
  const refs = planContextRefs(options);
  const allowed = options.subagent.allowedContextRefs ?? "*";
  const failClosed = options.config?.policyEngine?.failClosed ?? true;

  if (mode === "local") {
    return prepareSubagentContext(packs, options);
  }

  const { localRefs, sidecarRefs } = splitRefsForMode(refs, mode);
  const localResolved = resolveContextPacks(packs, localRefs, allowed);
  const denied = [...localResolved.denied];
  const missing = [...localResolved.missing];
  let appliedPacks = [...localResolved.packs];
  let contacted = false;
  let engineError: string | undefined;

  const subject: PolicySubject = {
    agent: options.subject?.agent,
    subagent: options.subagent.name,
    tenant: options.tenantId ?? options.subject?.tenant,
    sessionId: options.subject?.sessionId,
  };

  if (sidecarRefs.length) {
    const client =
      options.policyClient ?? new PolicySidecarClient(options.config?.policyEngine);
    try {
      const remote = await client.resolvePacks({ subject, refs: sidecarRefs });
      contacted = true;
      const remotePacks = remote.packs ?? [];
      // Client-side allowlist still applies (defense in depth).
      const filtered = resolveContextPacks(remotePacks, sidecarRefs, allowed);
      denied.push(...filtered.denied);
      missing.push(...(remote.missing ?? []), ...filtered.missing);
      for (const d of remote.denied ?? []) {
        if (!denied.includes(d.id)) denied.push(d.id);
      }

      const authz = await authorizePackAttachments({
        client,
        subject,
        packs: filtered.packs,
        facts: options.request?.facts,
      });
      for (const d of authz.denied) {
        if (!denied.includes(d.id)) denied.push(d.id);
      }
      appliedPacks = mergePacks(appliedPacks, authz.allowed);
    } catch (err) {
      engineError = err instanceof Error ? err.message : String(err);
      contacted = true;
      if (failClosed) {
        for (const ref of sidecarRefs) {
          // Expand known local policy packs into denied if present
          const localPolicies = resolveContextPacks(packs, [ref], allowed);
          for (const p of localPolicies.packs) {
            if (!denied.includes(p.id)) denied.push(p.id);
          }
          if (!localPolicies.packs.length && !missing.includes(ref)) {
            missing.push(ref);
          }
        }
      } else {
        // Fail open: fall back to local policy packs
        const fallback = resolveContextPacks(packs, sidecarRefs, allowed);
        appliedPacks = mergePacks(appliedPacks, fallback.packs);
        denied.push(...fallback.denied);
        missing.push(...fallback.missing);
      }
    }
  }

  // Stable sort
  const rank: Record<ContextPackKind, number> = {
    org: 0,
    tenant: 1,
    policy: 2,
    custom: 3,
  };
  appliedPacks.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id),
  );

  const maxChars = options.config?.maxChars ?? DEFAULT_MAX_CHARS;
  const block = assembleContextBlock(
    appliedPacks,
    options.request?.facts,
    maxChars,
  );

  return {
    refs,
    applied: appliedPacks.map((p) => p.id),
    denied: [...new Set(denied)],
    missing: [...new Set(missing)],
    block,
    source: mode,
    policyEngine: {
      contacted,
      failClosed,
      error: engineError,
    },
  };
}

function mergePacks(base: ContextPack[], extra: ContextPack[]): ContextPack[] {
  const seen = new Set(base.map((p) => p.id));
  const out = [...base];
  for (const p of extra) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
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
