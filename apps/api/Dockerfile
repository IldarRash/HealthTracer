# syntax=docker/dockerfile:1
#
# Railway service: health-api
# Build from repo root:
#   docker build -f apps/api/Dockerfile .
# Redeploy trigger: add @health/ai-behavior workspace manifest to deps stage (2026-06-03)
#
# The API runs TypeScript source via @swc-node/register because workspace
# packages export TS entrypoints. A compiled-only image can be added later.

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/ai/package.json ./packages/ai/
COPY packages/ai-behavior/package.json ./packages/ai-behavior/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

# Intentionally NOT --prod: the Railway pre-deploy migration
# (pnpm --dir packages/db db:migrate, from apps/api/railway.json) needs
# drizzle-kit, a devDependency of @health/db, present in the image.
RUN pnpm install --frozen-lockfile --filter @health/api...

FROM deps AS runner

COPY . .

ENV NODE_ENV=production

RUN mkdir -p /app/.data/documents

EXPOSE 3000

CMD ["pnpm", "--dir", "apps/api", "start"]
