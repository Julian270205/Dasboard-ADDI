#!/usr/bin/env bash
# Lo ejecuta GitHub Actions por SSH en la EC2. Solo descarga y arranca: no compila nada.
# Uso: TAG=<sha> bash deploy.sh
set -euo pipefail
cd /opt/addi-dashboard

export TAG="${TAG:-latest}"

docker compose pull
docker compose up -d --no-build --remove-orphans

# Migraciones del esquema acceso con la imagen nueva de la API
docker compose exec -T api alembic upgrade head
# Datos del esquema addi: solo se recargan si el generador publicó otra versión de parámetros
docker compose exec -T api python -m app.cli cargar-datos --si-cambio

# Limpiar imágenes viejas para no llenar el disco
docker image prune -f

docker compose ps
