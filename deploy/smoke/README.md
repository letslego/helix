# Regenerative deployment smoke tests

Run after every Compose / Helm / raw-manifest deploy. Exit code `0` only when
all checks pass — safe to gate CI/CD.

## What it verifies

- Helix liveness / readiness (`/healthz`, `/livez`, `/readyz`)
- Policy sidecar health + PDP (`/v1/authorize`, `/v1/packs/resolve`)
- Hybrid context mode + org/policy packs on `/api/agent`
- Durable session create, sessions list, event log
- Domain-aware weather turn
- `/helix/v1/*` aliases + console HTML

## Against a live deployment

```bash
# Compose (default ports)
npm run smoke

# After helm port-forward
kubectl -n helix port-forward svc/helix 8080:80
# Sidecar is localhost-only in-pod; for PDP checks from outside, port-forward the pod:
# kubectl -n helix port-forward deploy/helix 8080:8080 8181:8181
HELIX_BASE_URL=http://127.0.0.1:8080 \
POLICY_BASE_URL=http://127.0.0.1:8181 \
npm run smoke
```

## Build + up + smoke (Compose)

```bash
npm run smoke:compose
```

Env knobs: `HELIX_BASE_URL`, `POLICY_BASE_URL`, `HELIX_EXPECT_MODE` (default `hybrid`),
`SMOKE_TIMEOUT_MS`, `SMOKE_SKIP_COMPOSE=1` (reuse running stack).
