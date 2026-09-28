# Helix deployment packaging
#
# Layout (same repo — recommended default):
#
#   deploy/
#     compose/          local Docker Compose (pod-like localhost sidecar)
#     helm/helix/       production Helm chart
#     k8s/              raw manifests (reference / no-Helm clusters)
#
# Dockerfiles live at the repo root so `docker build -f Dockerfile .`
# keeps appVersion and chart values in lockstep with the source that ships.

## Same repo vs different repo

**Prefer the same repo** (`deploy/helm` next to `Dockerfile` and `src/`) when:

- One team owns the agent runtime and its chart
- Chart `appVersion` should track git tags / CI image digests
- Reviewers need app + deploy changes in one PR (env vars, probes, sidecar contract)

**Split to a separate ops/gitops repo** when:

- A platform team owns multi-service charts across many apps
- Promotion (dev → staging → prod) is values-only and must not require app commits
- You already run Argo CD / Flux with an environment overlay repo

A common hybrid: keep the **canonical chart** in this repo (versioned with Helix),
and let a gitops repo **vendors/references** chart versions + environment values
(`image.tag`, secrets, ingress hosts). Do not fork the template tree into the
gitops repo unless platform ownership requires it.

## Quick start — Docker Compose

```bash
# from repo root
docker compose -f deploy/compose/docker-compose.yaml up --build
curl -s http://127.0.0.1:8080/healthz
curl -s http://127.0.0.1:8181/healthz
```

Compose uses `network_mode: service:policy-sidecar` so Helix reaches the PDP at
`http://127.0.0.1:8181`, matching the Kubernetes pod localhost pattern.

## Quick start — images

```bash
docker build -t helix:local -f Dockerfile .
docker build -t helix-policy-sidecar:local -f Dockerfile.policy-sidecar .
```

Push to your registry and set Helm `image.repository` / `policySidecar.image.repository`.

## Quick start — Helm

```bash
helm lint deploy/helm/helix
helm template helix deploy/helm/helix | less
helm upgrade --install helix deploy/helm/helix \
  --namespace helix \
  --create-namespace \
  --set image.repository=ghcr.io/YOUR_ORG/helix \
  --set image.tag=0.1.0 \
  --set policySidecar.image.repository=ghcr.io/YOUR_ORG/helix-policy-sidecar \
  --set policySidecar.image.tag=0.1.0

kubectl -n helix port-forward svc/helix 8080:80
```

## Architecture

```
┌─ Pod ─────────────────────────────────────────────┐
│  helix (:8080)  ──localhost──▶  policy-sidecar    │
│  org/tenant ConfigMaps          (:8181 PDP)       │
│  HELIX_CONTEXT_MODE=hybrid      policy ConfigMap  │
└───────────────────────────────────────────────────┘
```

See [docs/k8s-policy-sidecar.md](../../docs/k8s-policy-sidecar.md).

## Regenerative smoke (every deploy)

```bash
# against a running stack
npm run smoke

# build Compose images, wait for health, then smoke
npm run smoke:compose
```

Details: [`deploy/smoke/README.md`](./smoke/README.md).
