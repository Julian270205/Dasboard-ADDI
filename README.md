# Dashboard estratégico de TI de Addi · Equipo Nexus

Tablero de gobierno de TI construido sobre los diagnósticos COBIT 2019, el BSC de TI 2027–2030 y el
catálogo de generación de datos. La lógica de negocio (generador, semáforos, reglas COBIT, riesgo
residual) es la de la v1 de Julian; esta versión le agrega login, aprobación controlada, una interfaz
en React y despliegue en AWS. Qué cambió y qué queda por confirmar: [`INTEGRACION.md`](INTEGRACION.md).

```
datos/*.xlsx ─► generador/ (Python, semilla fija) ─► db/01..04.sql ─► PostgreSQL · esquema addi (datos + funciones SQL)
                                                                          │
                                          api/ (FastAPI): login, roles, aprobaciones, reloj ─► esquema acceso
                                            │                          ▲
                              web/ (React) ◄┘        n8n: cron mensual y correos con botones (sin acceso a la base)
                                     Caddy (HTTPS) sirve el frontend y hace de proxy a la API
```

| Pieza | Tecnología | Carpeta |
|---|---|---|
| Datos y reglas | Python 3 + numpy (generador), PostgreSQL 16 (funciones SQL) | `generador/`, `db/`, `datos/` |
| API | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic | `api/` |
| Frontend | React 19 · Vite · TypeScript · Tailwind 4 · ECharts | `web/` |
| Automatización | n8n (corte mensual y correos de aprobación) | `n8n/` |
| Infraestructura | Docker Compose · Caddy · GitHub Actions · GHCR · EC2 capa gratuita | `infra/`, `.github/` |

## Reglas que no se rompen

1. **No se compila nada en la EC2.** GitHub Actions construye las imágenes; la instancia solo descarga y arranca.
2. **Swap de 2 GB y límite de memoria por contenedor** (`mem_limit` en `infra/docker-compose.yml`).
3. **Un solo PostgreSQL** para la app y n8n, en bases y usuarios separados.
4. **Nunca se edita un dato generado a mano.** Se cambia un parámetro, se regenera y se commitea `db/`.
5. **Toda cifra lleva su etiqueta** (real, estimado o simulado). Los datos simulados no son datos de Addi.
6. **El flujo propone y una persona aprueba.** El correo trae los botones; la decisión exige sesión y rol.

## Correr en local

Requisitos: Docker. Opcional para desarrollo: Python 3.12 y Node 22.

```bash
cp .env.example infra/.env                       # cambia los secretos
cd infra
alias dc='docker compose -f docker-compose.yml -f docker-compose.local.yml'
dc up -d --build
dc exec api alembic upgrade head                 # esquema acceso (usuarios, aprobadores, auditoría)
dc exec api python -m app.cli cargar-datos       # esquema addi: corre db/01..04
dc exec api python -m app.cli crear-admin --nombre "Tu nombre" --correo tu@correo.com
dc exec api python -m app.cli crear-usuarios-demo   # CTO y aprobadores por dominio; imprime claves
```

- Tablero: http://localhost
- n8n: http://localhost:5678 (importa `n8n/corte_y_avisos_cobit.json`, ver [`n8n/README.md`](n8n/README.md))
- Correos de prueba (Mailpit): http://localhost:8025

Frontend con recarga en caliente: `cd web && npm install && npm run dev` (http://localhost:5173; `/api` va a la API en el puerto 8000).

### Guion de la demo

1. **General:** madurez 2,16, radar por dominio, alertas con responsable y fecha; el borde de la barra superior es el pulso del tablero.
2. **Estrategia de TI:** mapa del BSC, plan real de 22 acciones con su línea de tiempo y los 11 riesgos antes y después de controles.
3. **COBIT:** mapa de los 40 objetivos; clic en BAI08 para ver que el nivel 1 casi no tiene plan.
4. Entra como administrador y pulsa **Avanzar un mes** varias veces: cambian semáforos y aparecen propuestas. En Mailpit llegan los correos por dominio con los botones **Aprobar** y **Rechazar**.
5. Abre un botón del correo: pide iniciar sesión. Entra con el aprobador del dominio y confirma. Prueba también con otra persona: la API no la deja decidir.
6. **Reiniciar** vuelve al corte inicial; los niveles aprobados quedan en el histórico de la corrida anterior.

Decir en la presentación: el corte de la demo es mensual (en producción sería trimestral) y los datos simulados no son datos de Addi.

## Regenerar los datos

```bash
cd generador
python3 extraer_diagnosticos.py ../datos   # solo si cambian los Excel de diagnóstico
python3 extraer_bsc.py                     # solo si cambia la BD del BSC
python3 generar.py                         # reescribe db/02 y db/03; imprime la huella SHA-256
```

Requiere Python 3.10+, `numpy` y `openpyxl`. `generar.py` genera dos veces, compara huellas y valida rangos y
coherencia; si algo falla no escribe nada. Para cambiar un parámetro: edita `parametros.json`, sube `version`,
regenera y commitea `db/` y `huella.txt` (la CI lo verifica). Al desplegar, la EC2 recarga los datos solo si la
versión cambió: `python -m app.cli cargar-datos --si-cambio`.

## Pruebas

```bash
cd api && pip install -r requirements-dev.txt
ruff check . && pytest -q        # sin DATABASE_URL corre solo las pruebas sin base de datos
```

En CI las pruebas de la API corren contra PostgreSQL con los datos de `db/` cargados.

## Flujo de trabajo con Git

- `main` = lo que está en producción. `develop` = integración. Ambas protegidas: todo entra por Pull Request con al menos una revisión y la CI en verde.
- Ramas de trabajo desde `develop`: `feat/...`, `fix/...`, `docs/...`. Commits pequeños con mensajes en presente (`feat(api): ...`).
- PR de `develop` a `main` para publicar: al hacer merge, el workflow **Deploy** construye las imágenes, las sube a GHCR y despliega en la EC2.
- Esto también es evidencia de gobierno: gestión de cambios (BAI06) con trazabilidad.

## Primer despliegue en la EC2

1. Security group: 80 y 443 abiertos; 22 solo para las IP del equipo.
2. Copia y corre `infra/scripts/setup-ec2.sh` con `sudo` (swap, Docker, carpetas, respaldo diario).
3. Crea `/opt/addi-dashboard/.env` desde `.env.example` con `ENV=produccion`, `REGISTRY` **en minúsculas**, `SITE_ADDRESS=<subdominio>.duckdns.org` y `PUBLIC_URL=https://<subdominio>.duckdns.org`.
4. En GitHub: secretos `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` y `GHCR_PAT`, y el environment `produccion`.
5. Merge a `main` (o corre Deploy a mano). Una sola vez: `crear-admin` y `crear-usuarios-demo` como arriba.
6. Importa el flujo de n8n por túnel SSH (`ssh -L 5678:localhost:5678 ubuntu@<ip>`) y configura el SMTP.

## Estructura

```
datos/       Excel originales (evidencia): tres diagnósticos COBIT y la BD del BSC
generador/   extraer_diagnosticos.py · extraer_bsc.py · catalogo.py · parametros.json · generar.py · huella.txt
db/          01_esquema · 02_datos_base · 03_mediciones · 04_funciones   (los escribe el generador)
api/         FastAPI: app/ (auth, tablero, aprobaciones, admin, internal) · migrations/ · tests/
web/         React: src/pages (General, Estrategia, Temas, Cobit, Aprobaciones, Admin, Login)
n8n/         corte_y_avisos_cobit.json
infra/       docker-compose.yml · docker-compose.local.yml · Caddyfile · scripts/
```
