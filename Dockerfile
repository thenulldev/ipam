# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the Vite frontend + the Hono server bundle ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Install build deps for better-sqlite3 native compile.
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy only the manifest first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the source.
COPY tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY vite.config.ts eslint.config.js index.html ./
COPY src ./src
COPY scripts ./scripts

# Build the frontend bundle and the compiled Hono server. The release
# workflow does the same; the server compile removes the need for `tsx`
# in the runtime image and matches `npm start`.
RUN npm run build:all

# Prune to production-only deps so we copy a smaller node_modules to runtime.
RUN npm prune --omit=dev


# ---------- Stage 2: minimal runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# better-sqlite3's .node binary is built in the builder stage; the runtime
# image only needs libc6-compat for the binary to load. Add tini for proper
# PID-1 signal handling.
RUN apk add --no-cache tini libc6-compat

ENV NODE_ENV=production
ENV PORT=8787
# Inside the container the data directory is a bind-mount or volume.
ENV IPAM_DATA_DIR=/data
# IPAM_DIST_DIR points the server at the frontend bundle.
ENV IPAM_DIST_DIR=/app/dist

# Create the data directory; in compose this is replaced by a volume.
RUN mkdir -p /data

# Copy the pruned production node_modules + built artifacts. The runtime
# image runs the compiled server (`npm start`); no tsx in production.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server-build ./server-build
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/scripts ./scripts

USER node

EXPOSE 8787

# Healthcheck hits the same /healthz the compose file uses.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz | grep -q '"ok":true' || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# Production-only entrypoint: no watch, no tsx, just the compiled server.
CMD ["node", "server-build/index.js"]
