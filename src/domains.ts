import type {
  DomainCard,
  DomainRouteHit,
  DomainRoutePlan,
  DomainRouterConfig,
  SubagentDefinition,
} from "./types.js";

export function defineDomain(card: DomainCard): DomainCard {
  return {
    id: card.id,
    description: card.description,
    whenToUse: card.whenToUse ?? [],
    notFor: card.notFor ?? [],
    keywords: card.keywords ?? [],
    tools: card.tools ?? [],
    preferParallel: card.preferParallel ?? true,
  };
}

/** Build capability cards from subagent definitions (and optional overrides). */
export function domainsFromSubagents(
  subagents: SubagentDefinition[],
  overrides: DomainCard[] = [],
): DomainCard[] {
  const byId = new Map<string, DomainCard>();
  for (const sub of subagents) {
    const fromSub = sub.domain
      ? defineDomain({ ...sub.domain, id: sub.domain.id || sub.name })
      : defineDomain({
          id: sub.name,
          description: sub.description || sub.name,
          whenToUse: [sub.description || sub.name],
          keywords: tokenize(sub.description || sub.name),
          tools: sub.tools.map((t) => t.name),
        });
    byId.set(fromSub.id, fromSub);
  }
  for (const card of overrides) {
    byId.set(card.id, defineDomain(card));
  }
  return [...byId.values()];
}

export class DomainRegistry {
  private cards: DomainCard[];

  constructor(cards: DomainCard[] = []) {
    this.cards = cards.map(defineDomain);
  }

  static fromSubagents(
    subagents: SubagentDefinition[],
    config?: DomainRouterConfig,
  ): DomainRegistry {
    return new DomainRegistry(domainsFromSubagents(subagents, config?.cards ?? []));
  }

  list(): DomainCard[] {
    return [...this.cards];
  }

  get(id: string): DomainCard | undefined {
    return this.cards.find((c) => c.id === id);
  }

  describe(): string {
    if (!this.cards.length) return "(none)";
    return this.cards
      .map(
        (c) =>
          `- ${c.id}: ${c.description}` +
          (c.whenToUse.length ? ` | when: ${c.whenToUse.join("; ")}` : "") +
          (c.notFor?.length ? ` | not: ${c.notFor.join("; ")}` : ""),
      )
      .join("\n");
  }
}

/**
 * Rule-based domain router: score capability cards against text.
 * Returns 0..N domain ids (empty => root agent should handle).
 */
export function routeDomains(
  text: string,
  registry: DomainRegistry | DomainCard[],
  config: DomainRouterConfig = {},
): DomainRoutePlan {
  const cards = Array.isArray(registry) ? registry : registry.list();
  const minScore = config.minScore ?? 1;
  const maxDomains = config.maxDomains ?? 3;
  const preferParallel = config.parallel ?? true;
  const lower = text.toLowerCase();

  const hits: DomainRouteHit[] = [];
  for (const card of cards) {
    const scored = scoreDomain(card, lower);
    if (scored.score >= minScore) hits.push(scored);
  }

  hits.sort((a, b) => b.score - a.score);
  const selected = hits.slice(0, maxDomains);

  if (!selected.length) {
    return {
      domains: [],
      mode: "none",
      reason: "no_domain_match",
      hits: hits.slice(0, 5),
    };
  }

  const mode =
    selected.length === 1
      ? "serial"
      : preferParallel && selected.every((h) => h.preferParallel !== false)
        ? "parallel"
        : "serial";

  return {
    domains: selected.map((h) => h.id),
    mode,
    reason:
      selected.length === 1
        ? `domain:${selected[0].id}`
        : `domains:${selected.map((h) => h.id).join(",")}`,
    hits: selected,
  };
}

function scoreDomain(card: DomainCard, lowerText: string): DomainRouteHit {
  const reasons: string[] = [];
  let score = 0;

  for (const phrase of card.notFor ?? []) {
    if (phrase && lowerText.includes(phrase.toLowerCase())) {
      return {
        id: card.id,
        score: 0,
        reasons: [`not_for:${phrase}`],
        preferParallel: card.preferParallel,
      };
    }
  }

  for (const phrase of [...(card.keywords ?? []), ...(card.whenToUse ?? [])]) {
    if (!phrase) continue;
    const needle = phrase.toLowerCase();
    if (lowerText.includes(needle)) {
      // Longer phrases are stronger signals
      const weight = Math.max(1, Math.min(3, Math.ceil(needle.split(/\s+/).length / 2)));
      score += weight;
      reasons.push(`match:${phrase}`);
    } else {
      // Token overlap for multi-word whenToUse lines
      const tokens = tokenize(needle).filter((t) => t.length > 3);
      const hits = tokens.filter((t) => lowerText.includes(t));
      if (tokens.length && hits.length / tokens.length >= 0.6) {
        score += 1;
        reasons.push(`tokens:${hits.join("|")}`);
      }
    }
  }

  // Soft boost if domain id itself appears
  if (lowerText.includes(card.id.toLowerCase())) {
    score += 1;
    reasons.push(`id:${card.id}`);
  }

  return {
    id: card.id,
    score,
    reasons,
    preferParallel: card.preferParallel,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2);
}

export async function delegateDomains(
  plan: DomainRoutePlan,
  task: string,
  runOne: (name: string, task: string) => Promise<string>,
): Promise<Array<{ name: string; reply: string }>> {
  if (!plan.domains.length) return [];
  if (plan.mode === "parallel") {
    return Promise.all(
      plan.domains.map(async (name) => ({ name, reply: await runOne(name, task) })),
    );
  }
  const out: Array<{ name: string; reply: string }> = [];
  let context = task;
  for (const name of plan.domains) {
    const reply = await runOne(name, context);
    out.push({ name, reply });
    context = `${task}\n\nPrior specialist (${name}) said:\n${reply}`;
  }
  return out;
}
