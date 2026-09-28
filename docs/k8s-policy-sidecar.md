# Kubernetes + policy-engine sidecar

Helix is designed to run in Kubernetes with a **policy sidecar** as the PDP
(policy decision point) for enterprise packs such as PII and MNPI.

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

## Manifests

See [`deploy/k8s/`](../deploy/k8s/):

- `namespace.yaml`
- `configmaps.yaml` — org/tenant + policy pack ConfigMaps
- `deployment.yaml` — Helix container + policy sidecar, hybrid env, NetworkPolicy

## Local sidecar

```bash
node --import tsx examples/policy-sidecar/server.ts
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
