#!/bin/sh
# Corre una sola vez, cuando el volumen de PostgreSQL está vacío.
# Un solo servidor PostgreSQL, dos bases separadas y dos usuarios separados:
#   addi -> la usa solo la API
#   n8n  -> la usa solo n8n (sin permisos sobre addi)
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE ${APP_DB} OWNER ${APP_DB_USER};
REVOKE ALL ON DATABASE ${APP_DB} FROM PUBLIC;

CREATE ROLE ${N8N_DB_USER} LOGIN PASSWORD '${N8N_DB_PASSWORD}';
CREATE DATABASE ${N8N_DB} OWNER ${N8N_DB_USER};
REVOKE ALL ON DATABASE ${N8N_DB} FROM PUBLIC;
SQL
