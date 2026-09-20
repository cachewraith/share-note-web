# syntax=docker/dockerfile:1

# Two images from one file:
#
#   --target runtime  (default)  the API. No build toolchain, no Prisma CLI.
#   --target migrate             a one-shot job that applies migrations.
#
# They are separate because the Prisma CLI pulls in Studio, pglite, effect and
# TypeScript — over 200 MB of machinery that a serving process never touches.
# Running migrations as a job also avoids every replica racing to migrate the
# same database at once. See docs/decisions/0014.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------- install ---
# Manifests only, so this layer is reused whenever no dependency changed.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ------------------------------------------------------------------ build ---
FROM deps AS build
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @share-note/contracts build \
 && pnpm --filter @share-note/api build

# `pnpm deploy` resolves the workspace links into a self-contained tree.
# `--prod` drops the dev dependencies, which is what leaves the Prisma CLI out.
RUN pnpm --filter @share-note/api deploy --prod --no-optional --legacy /deploy \
 && cp -r apps/api/prisma /deploy/prisma

# ---------------------------------------------------------------- runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# A non-root user that owns nothing it executes.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=build --chown=root:root /deploy ./
USER app

EXPOSE 3001

# Readiness rather than liveness: the container is only useful once it can
# reach the database, Redis and the bucket.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/ready" >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- migrate ---
# A one-shot job that applies migrations and exits. Run it before the API, and
# wait for it to succeed.
#
# It installs only the Prisma CLI rather than reusing the build stage: the build
# stage carries the whole toolchain, and this needs one tool. The version comes
# from the workspace catalog, so it cannot drift from the client the API uses.
FROM node:22-alpine AS migrate
ENV NODE_ENV=production
WORKDIR /app

COPY pnpm-workspace.yaml ./
RUN PRISMA_VERSION="$(sed -n 's/^  prisma: //p' pnpm-workspace.yaml | tr -d ' ')" \
 && echo "installing prisma@${PRISMA_VERSION}" \
 && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
 && npm cache clean --force \
 && rm pnpm-workspace.yaml

COPY apps/api/prisma ./prisma
COPY apps/api/prisma.config.ts ./prisma.config.ts

RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
USER app

CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
