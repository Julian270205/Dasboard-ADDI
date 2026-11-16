#!/usr/bin/env bash
# Preparación única de la EC2 (Ubuntu, capa gratuita, 1 GB de RAM).
# Uso: sudo bash setup-ec2.sh
set -euo pipefail

echo "== 1. Swap de 2 GB =="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Usar swap solo cuando haga falta
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "== 2. Docker y plugin compose =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${SUDO_USER:-ubuntu}"

echo "== 3. Carpeta de la app =="
install -d -o "${SUDO_USER:-ubuntu}" -g "${SUDO_USER:-ubuntu}" /opt/addi-dashboard/postgres/init /opt/addi-dashboard/backups

echo "== 4. Respaldo diario de la base (03:30) =="
cat > /etc/cron.d/addi-backup <<'CRON'
30 3 * * * ubuntu /opt/addi-dashboard/backup.sh >> /opt/addi-dashboard/backups/backup.log 2>&1
CRON

echo "Listo. Cierra sesión y vuelve a entrar para usar docker sin sudo."
echo "Luego copia .env a /opt/addi-dashboard/.env (ver .env.example)."
