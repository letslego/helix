# Kubernetes + Docker deployment

Helix runs as a containerized agent runtime with an optional **policy-engine
sidecar** as the PDP for enterprise packs (PII, MNPI, …).

## Packaging layout

| Path | Role |
|------|------|
| `Dockerfile` / `Dockerfile.policy-sidecar` | Multi-stage images at repo root |
| `deploy/compose/` | Local Docker Compose (localhost sidecar) |
| `deploy/helm/helix/` | Helm chart (recommended for clusters) |
| `deploy/k8s/` | Raw manifests for no-Helm clusters |

## Same repo vs different repo

**Keep deployment code in this repo** by default:

- Chart `appVersion` tracks the Helix release that owns the sidecar contract
- One PR can change env vars, probes, and runtime together
- CI can build images and `helm package` from the same commit

**Use a separate gitops/ops repo** only when a platform team owns multi-app
charts and environment promotion. In that case:

1. Still publish the **canonical chart** from this repo (OCI or GH Pages)
2. Let the gitops repo hold **values overlays** (`image.tag`, ingress, secrets)
3. Avoid copying/forking templates into the gitops repo

Details: [`deploy/README.md`](../deploy/README.md).

## Modes

| Mode | Org / tenant | Policy packs (`policy:*`) |
|------|--------------|---------------------------|
| `local` | filesystem | filesystem |
| `hybrid` (K8s default) | filesystem / ConfigMap | **sidecar** |
| `sidecar` | sidecar | sidecar |

Set via `defineAgent({ context: { mode: "hybrid" } })` or env `HELIX_CONTEXT_MODE`.

## Sidecar contract

Base URL: `HELIX_POLICY_SIDECAR_URL` (default `http://127.0.0.1:8181`)

### `POST /v1/packs/resolve`

```json
{
  "subject": { "subagent": "researcher", "tenant": "acme" },
  "refs": ["policy:pii", "policy:mnpi"]
}
```

Returns `{ packs, denied, missing }` where `packs` match `ContextPack`.

### `POST /v1/authorize`

```json
{
  "subject": { "subagent": "researcher", "tenant": "acme" },
  "action": "context.attach",
  "resource": { "packId": "policy:mnpi", "kind": "policy" }
}
```

Returns `{ allow, reasons, obligations }`.

Helix still applies each subagent’s `allowedContextRefs` client-side, then asks
the sidecar to authorize every pack before injection. Failures are **fail-closed**
for policy refs by default (`policyEngine.failClosed: true`).

## Build & run (Docker)

```bash
docker build -t helix:local -f Dockerfile .
docker build -t helix-policy-sidecar:local -f Dockerfile.policy-sidecar .
docker compose -f deploy/compose/docker-compose.yaml up --build
curl -s http://127.0.0.1:8080/healthz
```

## Install (Helm)

```bash
helm lint deploy/helm/helix
helm upgrade --install helix deploy/helm/helix \
  --namespace helix --create-namespace \
  --set image.repository=ghcr.io/YOUR_ORG/helix \
  --set image.tag=0.1.0 \
  --set policySidecar.image.repository=ghcr.io/YOUR_ORG/helix-policy-sidecar \
  --set policySidecar.image.tag=0.1.0
```

## Raw manifests

See [`deploy/k8s/`](../deploy/k8s/) if you cannot use Helm.

## Local sidecar (no containers)

```bash
node examples/policy-sidecar/server.mjs
export HELIX_CONTEXT_MODE=hybrid
export HELIX_POLICY_SIDECAR_URL=http://127.0.0.1:8181
```

## Agent config (K8s)

```ts
export default defineAgent({
  context: {
    mode: "hybrid",
    defaultRefs: ["org", "policy:pii", "policy:mnpi"],
    policyEngine: {
      baseUrl: process.env.HELIX_POLICY_SIDECAR_URL ?? "http://127.0.0.1:8181",
      failClosed: true,
      timeoutMs: 2000,
    },
  },
});
```

`context.attach` events include `source` (`hybrid`/`sidecar`) and
`policyEngine: { contacted, failClosed, error? }` for audit.

Health endpoints on the Helix console: `GET /healthz` (liveness), `GET /readyz`.

## Regenerative smoke tests

After every deploy:

```bash
npm run smoke:compose          # Compose build + up + smoke
# or against an existing URL:
HELIX_BASE_URL=http://127.0.0.1:8080 POLICY_BASE_URL=http://127.0.0.1:8181 npm run smoke
```

See [`deploy/smoke/`](../deploy/smoke/).
