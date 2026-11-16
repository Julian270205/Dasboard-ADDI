# Se construye en GitHub Actions (contexto = raíz del repo), nunca en la EC2.
FROM node:22-alpine AS build
WORKDIR /web
COPY web/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY web/ ./
RUN npm run build

# Imagen final: Caddy sirve el frontend compilado y hace de proxy hacia la API.
FROM caddy:2-alpine
COPY --from=build /web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
