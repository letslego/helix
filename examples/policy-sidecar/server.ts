/**
 * Minimal Helix policy-engine sidecar for Kubernetes (localhost).
 * Contract:
 *   GET  /healthz
 *   POST /v1/authorize
 *   POST /v1/packs/resolve
 *
 *   node --import tsx examples/policy-sidecar/server.ts
 */
import { createServer, type IncomingMessage } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 8181);
const here = dirname(fileURLToPath(import.meta.url));
const packsDir =
  process.env.HELIX_POLICY_PACKS_DIR ??
  join(here, "../travel-agent/agent/context/policies");

type Pack = {
  id: string;
  kind: "policy";
  title: string;
  body: string;
  tags: string[];
};

function packs(): Pack[] {
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(packsDir, file), "utf8");
      const id = `policy:${file.replace(/\.md$/, "")}`;
      const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
      const titleMatch = raw.match(/^title:\s*(.+)$/m);
      return {
        id,
        kind: "policy" as const,
        title: titleMatch?.[1]?.trim() ?? id,
        body,
        tags: ["policy", "sidecar"],
      };
    });
}

function refMatch(ref: string, id: string): boolean {
  if (ref.endsWith(":*")) return id.startsWith(ref.slice(0, -1));
  return id === ref;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/v1/authorize") {
      const body = (await readJson(req)) as {
        subject?: { subagent?: string; tenant?: string };
        resource?: { packId?: string };
      };
      const packId = body.resource?.packId ?? "";
      const subagent = body.subject?.subagent ?? "";
      let allow = true;
      const reasons: string[] = [];
      if (
        subagent === "weather_scout" &&
        (packId === "policy:mnpi" || packId === "policy:pii")
      ) {
        allow = false;
        reasons.push("subagent_not_cleared_for_policy");
      }
      if (packId === "policy:mnpi" && !body.subject?.tenant) {
        allow = false;
        reasons.push("mnpi_requires_tenant");
      }
      res.end(JSON.stringify({ allow, reasons, obligations: [] }));
      return;
    }

    if (req.method === "POST" && req.url === "/v1/packs/resolve") {
      const body = (await readJson(req)) as { refs?: string[] };
      const refs = body.refs ?? [];
      const all = packs();
      const matched = all.filter((p) => refs.some((r) => refMatch(r, p.id)));
      const missing = refs.filter(
        (r) => !r.includes("*") && !all.some((p) => refMatch(r, p.id)),
      );
      res.end(JSON.stringify({ packs: matched, denied: [], missing }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (err) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Helix policy sidecar on http://0.0.0.0:${port}`);
  console.log(`packs dir: ${packsDir}`);
});
