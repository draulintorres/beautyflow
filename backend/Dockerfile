# syntax=docker/dockerfile:1

# ---- Etapa builder: dependencias completas (incl. dev), prisma generate, nest build ----
FROM node:24-slim AS builder
WORKDIR /app

# node:24-slim no trae OpenSSL — el motor de Prisma lo necesita para elegir
# el binario correcto (sin esto, falla con "Schema engine error" al migrar).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- Etapa runtime: imagen final, usuario no root, TZ=UTC ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV TZ=UTC
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma

USER node

EXPOSE 3000

# migrate deploy aplica las migraciones pendientes antes de arrancar el proceso.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
