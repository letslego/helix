# Helix Helm chart

Deploys the Helix console/API with an optional **policy-engine sidecar** in hybrid
context mode (org/tenant from ConfigMaps; `policy:*` from the sidecar PDP).

## Install

```bash
helm upgrade --install helix .
```

## Values of note

| Key | Purpose |
| --- | --- |
| `image.*` / `policySidecar.image.*` | Container images |
| `env.HELIX_CONTEXT_MODE` | `hybrid` (default), `local`, or `sidecar` |
| `orgContext` / `policyPacks` | Pack bodies rendered into ConfigMaps |
| `networkPolicy.enabled` | Restrict ingress to Helix HTTP; sidecar stays on localhost |
| `ingress.enabled` | Optional Ingress |

Full defaults: [`values.yaml`](./values.yaml).

## Same-repo packaging

This chart lives in the Helix repo under `deploy/helm/helix` so `appVersion`
tracks the runtime. Prefer a separate gitops repo only for environment overlays
(values + secrets), not a forked copy of these templates. See
[`deploy/README.md`](../../README.md).
