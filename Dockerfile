# MCP server over Streamable HTTP (POST /mcp, GET /healthz) on PORT, default 8080.
# Synthetic data only. No model API key and no spend config go in this image.
FROM node:22-slim AS build
# mcp-tool-console is a git dependency, so npm needs git to install it.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.ui.json mcp.ts mcp-http.ts ./
COPY src ./src
COPY scripts ./scripts
COPY manifest ./manifest
COPY decoys ./decoys
COPY fixtures ./fixtures
# Compile, build the in-Claude view, then drop dev dependencies.
RUN npx tsc -p . && npx tsc -p tsconfig.ui.json && node scripts/ui-build.mjs \
  && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/manifest ./manifest
COPY --from=build --chown=node:node /app/decoys ./decoys
COPY --from=build --chown=node:node /app/fixtures ./fixtures
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/mcp-http.js"]
