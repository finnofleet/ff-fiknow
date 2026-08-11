# syntax=docker/dockerfile:1.7
# ============================================================
# FINKNOW (ff-fiknow) — Production-Image
#
# Multi-stage Build:
#   1. deps     → npm ci (nur production-dependencies)
#   2. builder  → npm run build (Next.js standalone output)
#   3. runner   → schlankes Alpine-Image, nur Build-Artefakte
#
# Result: ~150 MB Image, läuft als non-root auf Kubernetes
# (IBM Cloud, Helm-Chart unter deploy/helm/fiknow).
#
# Brand-Konfig (brand/brand.yaml) ist FINKNOW-spezifisch im Image.
# Das Repository baut FINKNOW direkt — kein Basis-Image-Overlay mehr.
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

# Build-Metadaten für die Versions-/Build-Anzeige (lib/app-version.ts,
# GET /version, /manage-Footer). Werden NICHT automatisch ermittelt — beim
# `docker build` explizit mitgeben, sonst bleibt "unknown":
#   docker build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
#                --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) ...
# Additiv/optional: fehlen die Build-Args, läuft das Image unverändert
# weiter (Default "unknown", keine Secrets, kein Verhaltenseinfluss).
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME

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

# Brand-Konfig: FINKNOW-Brand ist im Image (brand/brand.yaml aus diesem Repo).
COPY --from=builder --chown=nextjs:nodejs /app/brand ./brand

# Migrations-Artefakte für Auto-Migrate beim App-Start
# (siehe lib/db/auto-migrate.ts + instrumentation.ts):
#   - drizzle/      Drizzle-Migrations für public.*-Tabellen + RLS
#                   (auth.uid()/role()-Helfer legt der Auto-Migrate selbst an)
#   - migrations/   Payload-Migrations (payload.*-Tabellen)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

# Full node_modules (statt nur Next.js-Trace) — Payload-Migrations sind
# .ts-Files mit eigenen package-Imports (@payloadcms/db-postgres etc.),
# die Next's standalone-Tracer nicht erfasst. Ohne dies bricht
# auto-migrate beim App-Boot mit ERR_MODULE_NOT_FOUND ab.
#
# Trade-off: Image wird ~2-3x grösser. Akzeptabel — Storage ist günstig,
# komplette manuelle Migrations-Schritte pro Brand-Env sind teuer.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Ops-/Cron-Entrypoints: Batch-Jobs laufen NICHT über `node server.js`,
# sondern als eigener CronJob-Pod mit `npx tsx scripts/<job>.ts` (gleiches
# Image, anderes command). Dafür braucht der Runner den TS-Quellbaum der
# Scripts + der importierten lib/ + tsconfig.json (für die `@/`-Pfad-
# Auflösung). tsx + typescript sind bereits in node_modules (npm ci ohne
# --omit=dev). Payload-agnostisch: retention-purge importiert nur den
# Drizzle-Client. Siehe deploy/helm/fiknow/templates/cronjob.yaml.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000

# Healthcheck (Docker/Compose) — Liveness-Endpoint, kein DB-Zugriff.
# In Kubernetes übernehmen das die Probes aus dem Helm-Chart
# (Liveness /api/health, Readiness /api/health/ready).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
