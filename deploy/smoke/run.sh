#!/usr/bin/env bash
# Bring up Compose stack (or reuse running one) and run regenerative smoke tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${ROOT}/deploy/compose/docker-compose.yaml"
export HELIX_BASE_URL="${HELIX_BASE_URL:-http://127.0.0.1:8080}"
export POLICY_BASE_URL="${POLICY_BASE_URL:-http://127.0.0.1:8181}"

if [[ "${SMOKE_SKIP_COMPOSE:-}" != "1" ]]; then
  echo "==> Building and starting Compose stack"
  docker compose -f "$COMPOSE_FILE" up -d --build --wait || {
    echo "Compose --wait failed; falling back to up -d + poll"
    docker compose -f "$COMPOSE_FILE" up -d --build
  }
fi

echo "==> Waiting for Helix ${HELIX_BASE_URL}/healthz"
for i in $(seq 1 60); do
  if curl -sf "${HELIX_BASE_URL}/healthz" >/dev/null 2>&1 \
    && curl -sf "${POLICY_BASE_URL}/healthz" >/dev/null 2>&1; then
    echo "ready after ${i}s"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "timeout waiting for services" >&2
    docker compose -f "$COMPOSE_FILE" ps || true
    docker compose -f "$COMPOSE_FILE" logs --tail=80 || true
    exit 1
  fi
  sleep 1
done

echo "==> Running smoke suite"
node "${ROOT}/deploy/smoke/smoke.mjs"
