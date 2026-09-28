# Helix on Kubernetes

Hybrid context architecture:

- **Helix container** — agent runtime; mounts org/tenant packs from ConfigMaps
- **policy-sidecar** — PDP on `127.0.0.1:8181`; owns `policy:*` (PII, MNPI, …)

Prefer the **Helm chart** for real installs:

```bash
helm upgrade --install helix ../helm/helix -n helix --create-namespace
```

Raw manifests (reference / no-Helm):

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmaps.yaml
kubectl apply -f deployment.yaml
```

See [deploy/README.md](../README.md) (same-repo vs gitops) and
[docs/k8s-policy-sidecar.md](../../docs/k8s-policy-sidecar.md).
