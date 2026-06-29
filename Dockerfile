# syntax=docker/dockerfile:1.7
# ============================================================
# FIKNOW (ff-fiknow) — Production-Image
#
# Multi-stage Build:
#   1. deps     → npm ci (nur production-dependencies)
#   2. builder  → npm run build (Next.js standalone output)
#   3. runner   → schlankes Alpine-Image, nur Build-Artefakte
#
# Result: ~150 MB Image, läuft als non-root auf Kubernetes
# (IBM Cloud, Helm-Chart unter deploy/helm/fiknow).
#
# Brand-Konfig (brand/brand.yaml) ist FIKNOW-spezifisch im Image.
# Das Repository baut FIKNOW direkt — kein Basis-Image-Overlay mehr.
# Image: ghcr.io/finnofleet/ff-fiknow
#
# Deployment-Doku: deploy/RUNBOOK.md
# ============================================================

# ----- 1. Dependencies -----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ----- 2. Build -----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ----- 3. Runtime -----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Build-Artefakte
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Content (MDX-Kurse) ist NICHT im Image — kommt zur Laufzeit als Volume,
# oder per Brand-Build-Overlay (siehe Brand-Repo-Pattern).
RUN mkdir -p ./content && chown nextjs:nodejs ./content

# Brand-Konfig: FIKNOW-Brand ist im Image (brand/brand.yaml aus diesem Repo).
COPY --from=builder --chown=nextjs:nodejs /app/brand ./brand

# Migrations-Artefakte für Auto-Migrate beim App-Start
# (siehe lib/db/auto-migrate.ts + instrumentation.ts):
#   - drizzle/      Drizzle-Migrations für public.*-Tabellen + RLS
#                   (auth.uid()/role()-Helfer legt der Auto-Migrate selbst an)
#   - migrations/   Payload-Migrations (payload.*-Tabellen)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

# Ops-Scripts (plain .mjs ohne TS-Toolchain) für manuelle Aktionen via
# Web-SSH, z.B. `node scripts/promote-admin.mjs <email>` für den ersten
# Admin einer frischen Brand-DB.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/promote-admin.mjs ./scripts/promote-admin.mjs

# Full node_modules (statt nur Next.js-Trace) — Payload-Migrations sind
# .ts-Files mit eigenen package-Imports (@payloadcms/db-postgres etc.),
# die Next's standalone-Tracer nicht erfasst. Ohne dies bricht
# auto-migrate beim App-Boot mit ERR_MODULE_NOT_FOUND ab.
#
# Trade-off: Image wird ~2-3x grösser. Akzeptabel — Storage ist günstig,
# komplette manuelle Migrations-Schritte pro Brand-Env sind teuer.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000

# Healthcheck (Docker/Compose) — Liveness-Endpoint, kein DB-Zugriff.
# In Kubernetes übernehmen das die Probes aus dem Helm-Chart
# (Liveness /api/health, Readiness /api/health/ready).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
