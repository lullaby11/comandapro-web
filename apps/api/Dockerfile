# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api

COPY apps/api ./apps/api
RUN cd apps/api && npx prisma generate && npm run build

# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Instala solo dependencias de producción (sin workspaces)
COPY --from=builder /app/apps/api/package*.json ./
RUN npm ci --omit=dev

# Copia el cliente Prisma generado (sobreescribe el instalado arriba)
COPY --from=builder /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
