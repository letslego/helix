import type {
  ContextPack,
  PolicyAuthorizeRequest,
  PolicyAuthorizeResponse,
  PolicyEngineConfig,
  PolicyPacksResolveRequest,
  PolicyPacksResolveResponse,
  PolicySubject,
} from "./types.js";

const DEFAULT_BASE = "http://127.0.0.1:8181";

export function resolvePolicyEngineConfig(
  config?: PolicyEngineConfig,
): Required<
  Pick<
    PolicyEngineConfig,
    "baseUrl" | "authorizePath" | "packsPath" | "timeoutMs" | "failClosed"
  >
> {
  const fromEnv = process.env.HELIX_POLICY_SIDECAR_URL;
  return {
    baseUrl: (config?.baseUrl ?? fromEnv ?? DEFAULT_BASE).replace(/\/$/, ""),
    authorizePath: config?.authorizePath ?? "/v1/authorize",
    packsPath: config?.packsPath ?? "/v1/packs/resolve",
    timeoutMs: config?.timeoutMs ?? 2000,
    failClosed: config?.failClosed ?? true,
  };
}

/** HTTP client for a localhost policy-engine sidecar (OPA-compatible contract). */
export class PolicySidecarClient {
  private readonly cfg: ReturnType<typeof resolvePolicyEngineConfig>;
  private readonly fetchImpl: typeof fetch;

  constructor(
    config?: PolicyEngineConfig,
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.cfg = resolvePolicyEngineConfig(config);
    this.fetchImpl = fetchImpl;
  }

  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  get failClosed(): boolean {
    return this.cfg.failClosed;
  }

  async authorize(req: PolicyAuthorizeRequest): Promise<PolicyAuthorizeResponse> {
    const res = await this.post<PolicyAuthorizeResponse>(
      this.cfg.authorizePath,
      req,
    );
    return {
      allow: Boolean(res.allow),
      reasons: res.reasons ?? [],
      obligations: res.obligations ?? [],
    };
  }

  async resolvePacks(
    req: PolicyPacksResolveRequest,
  ): Promise<PolicyPacksResolveResponse> {
    return this.post<PolicyPacksResolveResponse>(this.cfg.packsPath, req);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`policy sidecar HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function isPolicyRef(id: string): boolean {
  return id === "policy" || id.startsWith("policy:") || id.startsWith("policy*");
}

export function splitRefsForMode(
  refs: string[],
  mode: "local" | "sidecar" | "hybrid",
): { localRefs: string[]; sidecarRefs: string[] } {
  if (mode === "local") return { localRefs: refs, sidecarRefs: [] };
  if (mode === "sidecar") return { localRefs: [], sidecarRefs: refs };
  const localRefs: string[] = [];
  const sidecarRefs: string[] = [];
  for (const ref of refs) {
    if (isPolicyRef(ref) || ref === "policy:*") sidecarRefs.push(ref);
    else localRefs.push(ref);
  }
  return { localRefs, sidecarRefs };
}

export async function authorizePackAttachments(options: {
  client: PolicySidecarClient;
  subject: PolicySubject;
  packs: ContextPack[];
  facts?: Record<string, string>;
}): Promise<{ allowed: ContextPack[]; denied: Array<{ id: string; reason: string }> }> {
  const allowed: ContextPack[] = [];
  const denied: Array<{ id: string; reason: string }> = [];
  for (const pack of options.packs) {
    try {
      const decision = await options.client.authorize({
        subject: options.subject,
        action: "context.attach",
        resource: { packId: pack.id, kind: pack.kind },
        input: { facts: options.facts ?? {} },
      });
      if (decision.allow) allowed.push(pack);
      else {
        denied.push({
          id: pack.id,
          reason: decision.reasons?.join("; ") || "policy_deny",
        });
      }
    } catch (err) {
      denied.push({
        id: pack.id,
        reason: err instanceof Error ? err.message : "authorize_error",
      });
    }
  }
  return { allowed, denied };
}
