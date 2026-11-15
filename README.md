# Dashboard estratégico de TI de Addi · Equipo Nexus

Tablero de gobierno de TI construido sobre los diagnósticos COBIT 2019, el BSC y el catálogo de generación de datos.
Tres piezas: **PostgreSQL** (datos y reglas), **n8n** (API y flujo de aprobación) y **un HTML** (el tablero).

```
Excel de diagnósticos ─► generador/ (Python, semilla fija) ─► db/*.sql ─► PostgreSQL (esquema addi)
                                                                              │ funciones SQL
                                                    n8n: 01 API · 02 corte mensual · 03 decisión
                                                                              │ JSON
                                                              dashboard/index.html (7 pestañas)
```

## 1. Cargar la base de datos (una vez)

Los cuatro scripts crean el esquema `addi` desde cero (lo borran si ya existe). Con tu contenedor de PostgreSQL:

```bash
cd "Dashboard"
for f in db/01_esquema.sql db/02_datos_base.sql db/03_mediciones.sql db/04_funciones.sql; do
  docker exec -i <contenedor_postgres> psql -U <usuario> -d <base> -v ON_ERROR_STOP=1 < "$f"
done
```

Comprobación: `SELECT addi.fn_cfg('corte_operativo'), (SELECT count(*) FROM addi.mediciones);` debe dar `2026-11-01` y `5026`.

## 2. Importar los flujos en n8n

1. En n8n crea una credencial **Postgres** que apunte a tu contenedor (host = nombre del servicio en la red de Docker).
2. *Workflows → Import from file* y sube los tres JSON de `n8n/`.
3. En cada nodo de PostgreSQL elige tu credencial (el JSON trae una de nombre «Postgres Addi» que no existe en tu n8n).
4. **Activa** los tres flujos. Rutas que quedan publicadas:

| Flujo | Ruta | Qué hace |
|---|---|---|
| 01 API del dashboard | `GET /webhook/addi/dashboard` | Devuelve `addi.api_dashboard()` |
| 02 Corte mensual y propuestas COBIT | `POST /webhook/addi/corte` · cron mensual | Avanza un mes, recalcula alertas, propone cambios de nivel y avisa por dominio |
| 03 Decisión de aprobación | `POST /webhook/addi/decision` · `GET /webhook/addi/aprobar` | Aprueba (versión nueva) o rechaza (con motivo) |

El nodo de correo del flujo 02 viene desactivado: si quieres correo, configura SMTP y actívalo. Sin correo, la aprobación se hace en la pestaña COBIT.

## 3. Abrir el tablero

Abre `dashboard/index.html` en el navegador. Si n8n corre en otra URL, cámbiala en `dashboard/config.js`.

- **Conectado a n8n:** botones «Avanzar un mes», «Reiniciar», «Aprobar» y «Rechazar» activos.
- **Sin conexión:** el tablero usa la copia local `dashboard/datos.js` (corte inicial) y lo avisa. Sirve para presentar sin contenedores.

## 4. Guion de la demo

1. **General:** madurez 2,16, radar por dominio, alertas con responsable y fecha.
2. **COBIT:** mapa de los 40 objetivos; clic en BAI08 para ver que el nivel 1 casi no tiene plan. Cola de cambios: aprobar uno y rechazar otro con motivo → historial.
3. **Avanzar un mes** varias veces: cambian semáforos, aparecen alertas y propuestas nuevas.
4. **Reiniciar** vuelve al corte inicial; los niveles aprobados quedan en el histórico (columna `corrida`).

Decir en la presentación: el corte de la demo es mensual (en producción sería trimestral) y los datos simulados no son datos de Addi.

## 5. Regenerar los datos

```bash
cd generador
python3 extraer_diagnosticos.py ..        # solo si cambian los Excel de diagnóstico
python3 generar.py                        # reescribe db/02 y db/03; imprime la huella SHA-256
```

Requiere Python 3.10+, `numpy` y `openpyxl`. `generar.py` genera dos veces, compara huellas y valida rangos y coherencia; si algo falla no escribe nada.
Para cambiar un parámetro: edita `parametros.json`, sube `version` y vuelve a generar. Nunca se edita un dato a mano. Huella vigente: `generador/huella.txt`.

## 6. Decisiones que tomé y que el equipo debe confirmar

| Tema | Lo que hice | Por qué |
|---|---|---|
| Sección COBIT | Es la **K** (58 a 71); la J queda para los indicadores BSC sin equivalente | La J estaba usada dos veces |
| Etiquetas | 2,16, radar y riesgos van como **Estimado**, con [V]/[I]/[NV] como subetiqueta | Regla del documento de proceso: lo derivado del equipo es estimado |
| 40 objetivos | APO09, APO14 y MEA04 se muestran «sin nivel evaluado» | El Diagnóstico de Control evalúa 37 |
| Códigos | Carga con equivalencias APO09→10, 10→11, 11→12, 12→13 y MEA02↔03 | Propuesta COBIT |
| Nivel objetivo (S5) | Entero por objetivo: importancia 4 o 5 → 3; importancia 3 → 2 | El 3,5 de la plantilla no es un nivel válido |
| V(t) | Normalizado: promedio de 2026 = 1; +1,5 % mensual en 2027 y +1 % desde 2028 | Sin normalizar las fórmulas dan magnitudes absurdas |
| Factor M con varios procesos | Promedio de los niveles | El documento no lo define |
| Semáforo | Meta **a la fecha** (interpola entre años) y umbrales absolutos donde la ficha los da | Evita comparar hoy contra la meta de 2030 |
| PI2.2 | Línea base 0 % (BSC), no 50 % | Conflicto entre catálogo y BSC |
| AC1.1 | Base 20 % (catálogo), no 100 (BSC Designer) | Conflicto entre fuentes |
| Aprobación | Desde el tablero (y enlace por correo opcional) | No exige SMTP para la demo |

**Datos reconstruidos que hay que reemplazar** (no tuve las hojas del BSC):

- **Plan:** 16 acciones, no 22. Vienen de los códigos citados en los documentos (S-02, S-03, S-06, S-08, M-06, M-07, O-01 a O-03, N-01, N-03) más 5 que agregué (S-01, D-01, N-02, G-01, C-01). Fechas, pesos y vínculos COBIT son propuestas. Tabla `iniciativas_plan`, campo `origen`.
- **Riesgos:** R1 a R11 redactados a partir de las brechas de los diagnósticos. Tabla `riesgos`.
- **Metas 2027–2030 del BSC:** interpoladas hasta la meta que muestra BSC Designer. Tabla `metas`.
- **Aprobadores por dominio:** roles tentativos «(por confirmar)». Tabla `responsables`.

Todo eso se edita en `generador/catalogo.py` y se regenera.

## 7. Estructura

```
db/          01_esquema · 02_datos_base · 03_mediciones · 04_funciones
generador/   extraer_diagnosticos.py · catalogo.py · parametros.json · generar.py · diagnosticos.json · huella.txt
n8n/         01_api_dashboard · 02_corte_mensual_cobit · 03_decision_aprobacion (+ construir_flujos.py)
dashboard/   index.html · config.js · datos.js
```
