# Helix runtime image (API console + agent project)
# Build: docker build -t helix:local -f Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json* ./
# Prefer npm ci when lockfile exists
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HELIX_BIND_HOST=0.0.0.0 \
    HELIX_CONTEXT_MODE=hybrid \
    HELIX_POLICY_SIDECAR_URL=http://127.0.0.1:8181 \
    HELIX_AGENT_DIR=/data/agent-project

RUN useradd --system --uid 10001 --create-home helix \
  && mkdir -p /data/agent-project /app \
  && chown -R helix:helix /data /app

COPY --from=build --chown=helix:helix /src/package.json /src/package-lock.json* ./
COPY --from=build --chown=helix:helix /src/node_modules ./node_modules
COPY --from=build --chown=helix:helix /src/dist ./dist
COPY --from=build --chown=helix:helix /src/bin ./bin
COPY --from=build --chown=helix:helix /src/examples/travel-agent ./examples/travel-agent

# Default project: travel-agent demo (override by mounting /data/agent-project).
# Agent modules import @letslego/helix — link the installed package so Node resolves it
# without a second npm install inside the agent project.
RUN cp -a /app/examples/travel-agent/. /data/agent-project/ \
  && mkdir -p /data/agent-project/node_modules/@letslego \
  && ln -sfn /app /data/agent-project/node_modules/@letslego/helix \
  && chown -R helix:helix /data/agent-project

USER helix
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js", "console", "/data/agent-project", "--port", "8080"]
