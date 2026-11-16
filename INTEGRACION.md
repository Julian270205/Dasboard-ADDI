# Integración: v1 de Julian + API, aprobación controlada y React

Esta rama (`feat/integracion-api-react`) parte de `develop` y mejora la v1 sin rehacerla: el generador, el
esquema `addi`, las funciones SQL y las reglas de negocio siguen siendo los de Julian. Lo que se agrega
cierra las dos brechas con los documentos del proyecto (datos reconstruidos y aprobación sin control de
identidad) y lleva la interfaz a React con la barra superior que el equipo eligió.

## Qué se conserva de la v1

- Generador replicable (`generador/generar.py`): semilla por indicador y mes, doble generación con huella, validaciones.
- Esquema `addi` y funciones SQL: `api_dashboard`, `fn_estado`, `fn_semaforo` con meta a la fecha, `fn_recalcular_alertas`,
  `fn_proponer_cambios` (subir, bajar y tres alertas), `fn_decidir` con caducidad, `fn_avanzar_corte`, `fn_reiniciar_demo`.
- Los dos relojes (operativo noviembre de 2026, plan junio de 2028), las corridas de la demo y el histórico inmutable.
- Las decisiones de su README: sección COBIT K, etiquetas (la madurez 2,16 es **Estimado**, como dice el documento de
  Proceso), equivalencias de códigos, S5 entero, V(t) normalizado, factor M, PI2.2 base 0 y AC1.1 base 20.
- La organización del tablero: siete pestañas, filtros por perspectiva y tipo de dato, buscador, panel de detalle con
  selector de meta por año, y todos los elementos 1 a 71.

## Qué cambia y por qué

| Cambio | Documento que lo pide |
|---|---|
| Plan (22 acciones), riesgos (R1 a R11) y metas 2027–2030 salen de la BD del BSC (`datos/BD_Dashboard_TI_Addi.xlsx` → `generador/bsc.json`), no reconstruidos | Proceso de generación: tablas de entrada y S2 |
| El motor usa los códigos reales: gobierno de datos S-04 (antes D-01), cifrado S-03 (antes S-01); N-01 y N-03 sin fechas no mueven indicadores; capacitación #57 queda plana | BD del BSC, hoja Plan |
| Aprobación: el titular del dominio decide; el suplente solo cuando la propuesta lleva 2 cortes sin respuesta; el admin no aprueba por serlo; el historial guarda a la persona real | Propuesta COBIT: aprobadores, "sin respuesta: recordatorio, luego el suplente" |
| El correo trae los botones Aprobar y Rechazar; cada uno abre la confirmación en el tablero, que pide sesión. Abrir el enlace no decide nada | Propuesta COBIT: "botones Aprobar y Rechazar" + control de identidad |
| n8n ya no toca la base ni publica webhooks sin autenticación: el cron pide el corte a la API y la API arma los correos | Arquitectura del equipo: solo la API escribe |
| Login con roles (lector, aprobador, admin), CSRF, auditoría y reloj idempotente | Requisito del equipo: "que no cualquiera modifique los datos" |
| Interfaz en React con la barra superior de la v1 (relojes, vigencia, contadores) y un pulso de estado | Mejoras del dashboard, elementos 1 a 6 |

## Por confirmar con el equipo

La BD del BSC no trae el vínculo de cada acción y cada riesgo con COBIT. Son una propuesta del equipo técnico,
marcada "por confirmar" en el tablero. Se corrigen en `generador/catalogo.py` (`PLAN_VINCULOS`, `RIESGOS_VINCULOS`),
se regenera y se commitea `db/`.

### Acciones del plan

| Acción | Qué es | Objetivo COBIT | Indicador | Fechas |
|---|---|---|---|---|
| S-01 | Definir RTO y RPO, montar recuperación multirregión, probar… | DSS04 | 49 | 2027-01 a 2028-06 |
| S-02 | Contratar centro de seguridad gestionado 24/7 con SIEM | DSS05 | PI1.2 | 2027-01 a 2027-06 |
| S-03 | Análisis de brechas ISO 27001 y PCI DSS, cierre y auditoría de… | APO13 | PI1.1 | 2027-01 a 2028-12 |
| S-04 | Definir el gobierno de datos: dueño por conjunto de datos,… | APO14 | PI2.2 | 2027-01 a 2028-06 |
| S-05 | Plataforma común de datos con trazabilidad y conciliación de… | APO14 | 22 | 2026-01 a 2028-12 |
| S-06 | Aprobar política de IA responsable, inventariar modelos y… | APO04 | PI2.1 | 2026-01 a 2027-12 |
| S-07 | Pruebas de inyección de instrucciones, filtros, simulacro y… | DSS05 | 36 | 2027-07 a 2028-06 |
| S-08 | Gestionar proveedores críticos: matriz, SLA, contingencia y… | APO10 | PI3.1 | 2027-01 a 2027-12 |
| M-01 | Levantar el catálogo de sistemas con dueño, tecnología, versión… | BAI09 | – | 2027-01 a 2027-06 |
| M-02 | Definir requisitos del core para depósitos y componentes a… | BAI02 | – | 2026-01 a 2027-06 |
| M-03 | Implementar core de depósitos y transición a Addi CF | BAI03 | – | 2026-01 a 2028-12 |
| M-04 | Migrar Java 11 por sistema, empezando por los conectados con… | BAI06 | 51 | 2026-01 a 2029-12 |
| M-05 | Pasarela central de APIs y portal de desarrolladores con sandbox | APO03 | C3.1 | 2027-07 a 2028-06 |
| M-06 | Conectar Bre-B al recaudo y habilitar APIs de finanzas abiertas… | BAI03 | C2.1 | 2028-01 a 2029-12 |
| M-07 | Catálogo de servicios de TI con ANS, gestión de problemas y… | APO09 | PI3.2 | 2027-07 a 2028-12 |
| D-01 | Documentar controles de acceso y antifraude y compararlos con… | DSS06 | 24b | 2026-01 a 2027-06 |
| O-01 | Inventariar y empaquetar conectores (Shopify, VTEX, WooCommerce) | BAI03 | C3.1 | 2027-07 a 2028-06 |
| O-02 | Requisitos técnicos de integración para entidades financieras | BAI02 | C3.1 | 2028-01 a 2028-06 |
| O-03 | Integrar un aliado piloto de cada tipo y medir el tiempo de… | BAI07 | C3.1 | 2028-07 a 2029-06 |
| O-04 | Pruebas de estrés y autoescalado con el volumen de los aliados | BAI04 | 47 | 2028-07 a 2029-12 |
| N-01 | Respaldo de roles críticos de TI: identificar roles, documentar… | BAI08 | AC1.1 | sin fecha a sin fecha |
| N-03 | Encuesta semestral al equipo de TI sobre claridad de… | APO07 | AC3.2 | sin fecha a sin fecha |

### Riesgos

| Riesgo | Qué es | Categoría (S6) | Proceso que lo mitiga | Dueño | Señal |
|---|---|---|---|---|---|
| R1 | Incumplir o atrasar las exigencias obligatorias de la… | Cumplimiento | MEA03 | Oficial de Cumplimiento | #22 |
| R2 | Ciberataques, fraude e IA generativa (phishing,… | Seguridad y datos | DSS05 | CISO | #27a |
| R3 | Sanciones y reclamos por errores en el tratamiento o… | Cumplimiento | APO14 | Head of Data / DPO | #25b |
| R4 | Sin recuperación ante desastres probada (RTO y RPO) | Operación | DSS04 | CTO | #49 |
| R5 | Core sin capacidad para depósitos y deuda técnica de… | Operación | BAI03 | CTO | #51 |
| R6 | Integraciones sin pasarela central de APIs ni portal | Innovación | APO03 | CPO | #C3.1 |
| R7 | Seguridad sin respaldo formal (sin SOC/SIEM ni… | Seguridad y datos | APO13 | CISO | #PI1.2 |
| R8 | Dependencia de proveedores críticos (nube, core, LLM,… | Operación | APO10 | CTO | #PI3.1 |
| R9 | Vacante prolongada de un rol crítico de TI | Operación | APO07 | Head of People / CTO | #AC1.2 |
| R10 | Los controles de seguridad no se aplican por hábito | Seguridad y datos | APO07 | CISO | #AC2.1 |
| R11 | El plan no se cumple por prioridades poco claras | Operación | APO02 | CTO | #AC3.2 |

### Otros pendientes

- **Peso de cada acción en el presupuesto:** hoy es proporcional a la duración (suma 100). Falta el peso real.
- **Metas del BSC frente a parámetros del generador:** con las metas reales, C3.1 baja a 40 en 2030 y C1.1 a 60, pero
  el generador apunta a 85; PI2.2 tiene meta 100 y techo 85. Esos indicadores terminarán en rojo hasta que el equipo
  decida si ajusta el parámetro (supuesto aprobado) o la meta.
- **Correo:** en local se usa Mailpit; en producción hace falta una cuenta SMTP (Gmail con contraseña de aplicación o Brevo).
- **Aprobadores reales:** `crear-usuarios-demo` crea personas de demostración por dominio; en la presentación se
  pueden reemplazar desde Administración.

## Cómo revisarla y unirla

1. Traer la rama (bundle o push) y abrir un Pull Request de `feat/integracion-api-react` hacia `develop`.
2. La CI debe pasar: generador replicable y `db/` al día, lint y pruebas de la API con PostgreSQL, build del frontend.
3. Revisión de al menos una persona del equipo (idealmente Julian, por el generador y las funciones SQL).
4. Merge a `develop` con "Squash" desactivado, para conservar los commits por tema.
5. Cuando el equipo lo apruebe, PR de `develop` a `main`: eso despliega en la EC2.
