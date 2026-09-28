# Helix on Kubernetes

Hybrid context architecture:

- **Helix container** — agent runtime; mounts org/tenant packs from ConfigMaps
- **policy-sidecar** — PDP on `127.0.0.1:8181`; owns `policy:*` (PII, MNPI, …)

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmaps.yaml
kubectl apply -f deployment.yaml
```

See [docs/k8s-policy-sidecar.md](../docs/k8s-policy-sidecar.md).
