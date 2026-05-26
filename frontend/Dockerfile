# syntax=docker/dockerfile:1.7
# ============================================================================
# ScrumDev AI - Frontend Dockerfile (Next.js 14, standalone output)
# ----------------------------------------------------------------------------
# Multi-stage:
#   1) deps     -> sólo deps (cache)
#   2) builder  -> next build con output: 'standalone'
#   3) runner   -> imagen mínima con .next/standalone + static/public
# ============================================================================

# --------- Stage 1: deps ---------
FROM node:20-alpine AS deps

# libc6-compat es recomendación oficial de Next.js para Alpine.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Solo manifests para cachear npm ci
COPY frontend/package.json frontend/package-lock.json ./

# npm ci respeta el lockfile (build reproducible)
RUN npm ci --no-audit --no-fund


# --------- Stage 2: builder ---------
FROM node:20-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

# La URL del gateway se inyecta en build-time (Next inlinea NEXT_PUBLIC_*).
# Si no se pasa, default razonable detrás del nginx reverse proxy.
ARG NEXT_PUBLIC_API_GATEWAY_URL=/api
ENV NEXT_PUBLIC_API_GATEWAY_URL=${NEXT_PUBLIC_API_GATEWAY_URL}

RUN npm run build


# --------- Stage 3: runner ---------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl tini \
    && addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 --ingroup nodejs nextjs

# Standalone output (next.config.mjs -> output: 'standalone') incluye node_modules mínimo
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# server.js es el entrypoint generado por el modo standalone de Next
CMD ["node", "server.js"]
