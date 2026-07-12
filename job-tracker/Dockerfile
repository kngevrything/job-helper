# syntax=docker/dockerfile:1

# Multi-stage build using Next.js's "standalone" output (see next.config.ts)
# so the final image only ships the server + the node_modules it actually
# uses, not the full dev dependency tree.

FROM node:22-alpine AS base

# ---- deps: install dependencies only (cached separately from source) ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: build the app ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No env vars are required at build time: "/" renders dynamically (see
# `export const dynamic = "force-dynamic"` in src/app/page.tsx) and no other
# route touches the database during `next build`.
RUN npm run build

# ---- runner: minimal production image ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
