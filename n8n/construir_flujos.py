#!/usr/bin/env python3
"""Genera los tres flujos de n8n (JSON importables). La lógica vive en las funciones SQL del esquema addi."""
import json, uuid
CRED = {"postgres": {"id": "ADDI_PG", "name": "Postgres Addi"}}
def nodo(nombre, tipo, ver, x, y, params, **extra):
    n = {"parameters": params, "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "addi/" + nombre)), "name": nombre, "type": "n8n-nodes-base." + tipo, "typeVersion": ver, "position": [x, y]}
    n.update(extra); return n
def pg(nombre, x, y, query, repl=None, **extra):
    opt = {"queryReplacement": repl} if repl else {}
    return nodo(nombre, "postgres", 2.5, x, y, {"operation": "executeQuery", "query": query, "options": opt}, credentials=CRED, **extra)
def hook(nombre, x, y, metodo, ruta):
    return nodo(nombre, "webhook", 2, x, y, {"httpMethod": metodo, "path": ruta, "responseMode": "responseNode", "options": {"allowedOrigins": "*"}},
                webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "addi-hook/" + ruta + metodo)))
def resp(nombre, x, y, cuerpo):
    return nodo(nombre, "respondToWebhook", 1.1, x, y, {"respondWith": "json", "responseBody": cuerpo,
                "options": {"responseHeaders": {"entries": [{"name": "Access-Control-Allow-Origin", "value": "*"}]}}})
def nota(nombre, x, y, texto, w=420, h=200):
    return nodo(nombre, "stickyNote", 1, x, y, {"content": texto, "width": w, "height": h})
def flujo(nombre, nodos, enlaces):
    con = {}
    for a, b in enlaces: con.setdefault(a, {"main": [[]]})["main"][0].append({"node": b, "type": "main", "index": 0})
    return {"name": nombre, "nodes": nodos, "connections": con, "active": False, "settings": {"executionOrder": "v1"}, "pinData": {}}

f1 = flujo("Addi 01 · API del dashboard", [
    nota("Nota", 0, -240, "## API del dashboard\nGET `/webhook/addi/dashboard` devuelve un JSON con todo lo que muestra el tablero (función `addi.api_dashboard()`).\n\n**Antes de activar:** elige tu credencial de PostgreSQL en el nodo «Leer tablero»."),
    hook("GET dashboard", 0, 0, "GET", "addi/dashboard"),
    pg("Leer tablero", 240, 0, "SELECT addi.api_dashboard() AS data;"),
    resp("Responder JSON", 480, 0, "={{ $json.data }}"),
], [("GET dashboard", "Leer tablero"), ("Leer tablero", "Responder JSON")])

CORREO = ("=Hola {{ $json.aprobador }}:\n\nEl corte mensual del gobierno COBIT de Addi dejó {{ $json.n }} tema(s) del dominio {{ $json.dominio }} para tu revisión.\n\n"
          "{{ $json.detalle }}\n\nPara decidir, abre la pestaña COBIT del dashboard (cola de cambios propuestos) o usa el enlace de cada propuesta:\n"
          "http://localhost:5678/webhook/addi/aprobar?id=ID&decision=aprobar&aprobador={{ encodeURIComponent($json.aprobador) }}\n\n"
          "{{ $json.copia_cto ? 'Se copia al CTO como segunda revisión, porque eres dueño de acciones que justifican el cambio.' : '' }}\n"
          "Mientras nadie responda, el cambio sigue como propuesto y no se aplica. Suplente: {{ $json.suplente }}.\n"
          "Los cambios nacidos de mediciones simuladas llevan la etiqueta «Simulado».")
f2 = flujo("Addi 02 · Corte mensual y propuestas COBIT", [
    nota("Nota", 0, -300, "## Flujo de gobierno COBIT (7 pasos)\n1-3. `addi.fn_avanzar_corte()` valida el mes nuevo, mueve el reloj, recalcula semáforos y alertas y **propone** cambios de nivel.\n4. Se avisa al aprobador de cada dominio con propuestas o alertas.\n5-6. La decisión entra por el flujo 03 y crea una versión nueva.\n7. El tablero lee el nivel vigente.\n\nEl nodo de correo viene **desactivado**: configura SMTP y actívalo. Sin correo, la aprobación se hace desde la pestaña COBIT.", 520, 260),
    nodo("Cada mes", "scheduleTrigger", 1.2, 0, 0, {"rule": {"interval": [{"field": "months", "triggerAtDayOfMonth": 1, "triggerAtHour": 8}]}}),
    nodo("Ejecutar a mano", "manualTrigger", 1, 0, 160, {}),
    pg("Avanzar corte", 240, 80, "SELECT addi.fn_avanzar_corte() AS r;"),
    hook("POST corte", 0, 360, "POST", "addi/corte"),
    pg("Avanzar o reiniciar", 240, 360, "SELECT CASE WHEN $1 = 'reiniciar' THEN addi.fn_reiniciar_demo() ELSE addi.fn_avanzar_corte() END AS r;", "={{ [ $json.body.accion || 'avanzar' ] }}"),
    resp("Responder corte", 480, 360, "={{ $json.r }}"),
    pg("Pendientes por dominio", 480, 80, "SELECT * FROM addi.fn_pendientes_por_dominio();", alwaysOutputData=False),
    nodo("Correo al aprobador", "emailSend", 2.1, 720, 80, {"fromEmail": "gobierno-ti@addi.demo", "toEmail": "={{ $json.correo }}", "subject": "=Gobierno COBIT · {{ $json.n }} tema(s) del dominio {{ $json.dominio }} por revisar",
          "emailFormat": "text", "text": CORREO, "options": {"ccEmail": "={{ $json.copia_cto ? 'cto@addi.demo' : '' }}"}}, disabled=True),
], [("Cada mes", "Avanzar corte"), ("Ejecutar a mano", "Avanzar corte"), ("Avanzar corte", "Pendientes por dominio"), ("Pendientes por dominio", "Correo al aprobador"),
    ("POST corte", "Avanzar o reiniciar"), ("Avanzar o reiniciar", "Responder corte"), ("Avanzar o reiniciar", "Pendientes por dominio")])

f3 = flujo("Addi 03 · Decisión de aprobación", [
    nota("Nota", 0, -240, "## Decisión humana (pasos 4 a 6)\n`POST /webhook/addi/decision` con `{id, decision, aprobador, motivo}` desde el dashboard, o `GET /webhook/addi/aprobar?id=..&decision=aprobar|rechazar&aprobador=..&motivo=..` desde el correo.\n\nAprobar crea una fila nueva en `procesos_madurez`; rechazar exige motivo. Nada se edita ni se borra."),
    hook("POST decision", 0, 0, "POST", "addi/decision"),
    pg("Registrar decisión", 240, 0, "SELECT addi.fn_decidir($1::int, $2, $3, $4) AS r;", "={{ [ $json.body.id, $json.body.decision, $json.body.aprobador || '', $json.body.motivo || '' ] }}"),
    resp("Responder decisión", 480, 0, "={{ $json.r }}"),
    hook("GET aprobar (correo)", 0, 200, "GET", "addi/aprobar"),
    pg("Registrar decisión del correo", 240, 200, "SELECT addi.fn_decidir($1::int, $2, $3, $4) AS r;", "={{ [ $json.query.id, $json.query.decision, $json.query.aprobador || '', $json.query.motivo || '' ] }}"),
    resp("Responder al correo", 480, 200, "={{ $json.r }}"),
], [("POST decision", "Registrar decisión"), ("Registrar decisión", "Responder decisión"),
    ("GET aprobar (correo)", "Registrar decisión del correo"), ("Registrar decisión del correo", "Responder al correo")])

for nombre, f in (("01_api_dashboard.json", f1), ("02_corte_mensual_cobit.json", f2), ("03_decision_aprobacion.json", f3)):
    json.dump(f, open(nombre, "w"), ensure_ascii=False, indent=2); print(nombre, len(f["nodes"]), "nodos")
