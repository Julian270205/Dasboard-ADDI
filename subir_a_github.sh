#!/usr/bin/env bash
# Inicializa el repositorio Git local y, si tienes `gh` autenticado, crea el repo en GitHub y hace push.
#
# Uso:  ./subir_a_github.sh [nombre-repo] [--public|--private]
# Por defecto:  dashboard-ti-addi-nexus · privado
#
# Requisitos: git. Opcional: gh (https://cli.github.com/) autenticado con `gh auth login`.

set -e
cd "$(dirname "$0")"

REPO="${1:-dashboard-ti-addi-nexus}"
VISIBILIDAD="${2:---private}"

# --- git local ---
if [ ! -d .git ]; then
  echo "▶ Inicializando repositorio local…"
  git init -q -b main
  git add -A
  git -c commit.gpgsign=false commit -q -m "Dashboard estratégico de TI de Addi · Equipo Nexus

- Esquema PostgreSQL con 40 objetivos COBIT, diagnósticos, BSC e indicadores
- Generador replicable con semilla por indicador y mes (5026 mediciones)
- Dashboard HTML con 7 pestañas (General, Estrategia, Datos, Seguridad, IA, Operación, COBIT)
- Flujos n8n: API, corte mensual COBIT, decisión de aprobación"
  echo "  ✔ Primer commit creado."
else
  echo "▶ Repositorio local ya existe — omito git init."
fi

# --- GitHub ---
if ! command -v gh >/dev/null 2>&1; then
  echo
  echo "⚠ 'gh' no está instalado. Instálalo (https://cli.github.com) o crea el repo a mano en GitHub y luego ejecuta:"
  echo "   git remote add origin git@github.com:TU_USUARIO/$REPO.git"
  echo "   git push -u origin main"
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo
  echo "▶ 'gh' no está autenticado. Ejecutando 'gh auth login' (sigue las instrucciones)…"
  gh auth login
fi

echo "▶ Creando el repositorio $REPO en GitHub ($VISIBILIDAD) y haciendo push…"
gh repo create "$REPO" "$VISIBILIDAD" --source=. --remote=origin --push
echo
echo "✔ Listo. URL del repositorio:"
gh repo view --json url -q .url
