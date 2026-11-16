# Flujo de n8n

`corte_y_avisos_cobit.json` cubre los pasos 1 a 4 de la Propuesta COBIT:

| Disparador | Qué hace |
|---|---|
| Cron: día 1 de cada mes, 7:00 | Pide a la API el corte del mes (`POST /api/v1/internal/corte`). Si avanzó, pide los correos y los envía. |
| Webhook `addi-avisos` | Lo llama la API cuando un administrador pulsa **Avanzar un mes**: solo pide los correos y los envía. |

Reglas:

- n8n **no** tiene credenciales de la base. Habla con la API por la red de Docker con la cabecera `X-Internal-Token`.
- La API arma un correo por dominio con las propuestas pendientes y las alertas del corte. Cada propuesta trae los botones **Aprobar** y **Rechazar**, que abren la confirmación en el tablero (`/aprobaciones/<id>?decision=aprobar`). El enlace no decide nada: hay que iniciar sesión y la API verifica que sea el titular del dominio, o el suplente si la propuesta lleva 2 cortes sin respuesta.
- Recordatorio y escalado: cada corte sin decisión suma un recordatorio; desde el segundo, el correo también va al suplente. El CTO recibe copia cuando el aprobador es dueño de las acciones que justifican el cambio.
- El avance del corte es idempotente: si el cron y un administrador coinciden, el mes avanza una sola vez.

## Importar

1. Abre el editor (local: http://localhost:5678; EC2: túnel `ssh -L 5678:localhost:5678 ubuntu@<ip>`).
2. Crea una credencial **SMTP**:
   - Local: host `mailpit`, puerto `1025`, sin usuario ni SSL. Los correos se ven en http://localhost:8025.
   - Producción: por ejemplo Gmail con contraseña de aplicación (smtp.gmail.com, 465, SSL) o Brevo (gratis hasta 300 por día).
3. *Workflows → Import from file* → `corte_y_avisos_cobit.json`. Asigna la credencial SMTP al nodo **Enviar correo al aprobador**.
4. Activa (o publica, en n8n 2.x) el flujo.

Variables que el flujo lee del contenedor (las pone `infra/docker-compose.yml`): `API_INTERNAL_BASE`, `API_INTERNAL_TOKEN`, `CORREO_REMITENTE`.

## Exportar después de un cambio

```bash
docker compose exec n8n n8n export:workflow --all --separate --output=/home/node/.n8n/export
docker compose cp n8n:/home/node/.n8n/export ./n8n-export
```

Copia el archivo a esta carpeta, revisa que no tenga secretos y abre un PR.
