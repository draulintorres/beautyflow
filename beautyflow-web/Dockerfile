# syntax=docker/dockerfile:1

# ---- Etapa builder: build de Vite con VITE_API_URL relativa (mismo origen) ----
FROM node:24-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV VITE_API_URL=/api/v1
RUN npm run build

# ---- Etapa runtime: Caddy sirve el estático y hace proxy de /api ----
FROM caddy:2-alpine AS runtime
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
