#!/usr/bin/env bash
# Respaldo diario de las dos bases. Guarda los últimos 7 días.
set -euo pipefail
cd /opt/addi-dashboard
set -a; . ./.env; set +a

FECHA=$(date +%F)
for DB in "${APP_DB:-addi}" "${N8N_DB:-n8n}"; do
  docker compose exec -T postgres pg_dump -U "${POSTGRES_SUPERUSER:-postgres}" -Fc "$DB" > "backups/${DB}-${FECHA}.dump"
done
find backups -name '*.dump' -mtime +7 -delete
echo "$(date -Is) respaldo ok"
