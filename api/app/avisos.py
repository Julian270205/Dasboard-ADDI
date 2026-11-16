"""Correos del flujo COBIT (paso 4 de la Propuesta). La API los arma; n8n solo los envía.

Cada propuesta trae dos botones, Aprobar y Rechazar, que abren la confirmación en el tablero:
    {PUBLIC_URL}/aprobaciones/{id}?decision=aprobar
El enlace no aprueba nada por sí solo: la página pide iniciar sesión y la API verifica el rol.
"""

import html
import logging

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Aprobador, Usuario

log = logging.getLogger(__name__)
NOMBRE_DOMINIO = {"EDM": "Evaluar, dirigir y monitorear", "APO": "Alinear, planificar y organizar",
                  "BAI": "Construir, adquirir e implementar", "DSS": "Entregar, dar servicio y soporte",
                  "MEA": "Monitorear, evaluar y valorar"}


def _boton(url: str, texto: str, fondo: str) -> str:
    return (f'<a href="{url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:{fondo};'
            f'color:#fff;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px">{texto}</a>')


def _tarjeta(p: dict, base: str) -> str:
    e = html.escape
    flecha = "↑" if (p["nivel_propuesto"] or 0) > (p["nivel_actual"] or 0) else "↓"
    escalada = ('<div style="color:#b45309;font-size:12px;margin-top:4px">'
                f'Escalada al suplente · {p["recordatorios"]} cortes sin respuesta</div>') if p.get("escalada") else ""
    return (
        '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0">'
        f'<div style="font-size:12px;color:#64748b">{e(p["dominio"])} · corte {e(p["corte"])} · dato {e(p["etiqueta"])}</div>'
        f'<div style="font-size:16px;font-weight:600;margin:4px 0">{e(p["objetivo"])} · {e(p["nombre"])}</div>'
        f'<div style="font-size:22px;font-weight:700;margin:6px 0">Nivel {p["nivel_actual"]} {flecha} {p["nivel_propuesto"]}</div>'
        f'<div style="font-size:13px;color:#334155"><b>{e(p["regla"])}.</b> {e(p["evidencia"])}</div>{escalada}'
        f'<div style="margin-top:14px">{_boton(f"{base}/aprobaciones/{p["id"]}?decision=aprobar", "Aprobar", "#15803d")}'
        f'{_boton(f"{base}/aprobaciones/{p["id"]}?decision=rechazar", "Rechazar", "#b91c1c")}</div></div>')


def _persona(u: Usuario | None) -> str:
    return u.nombre if u else "Por definir"


def armar(db: Session) -> list[dict]:
    """Un correo por dominio con propuestas pendientes o alertas del corte (la Propuesta: solo a quien tenga algo)."""
    s = get_settings()
    base = s.public_url.rstrip("/")
    filas = db.execute(text("""
        SELECT p.id, to_char(p.corte, 'YYYY-MM') AS corte, p.objetivo, o.nombre, o.dominio, p.tipo, p.regla,
               p.nivel_actual, p.nivel_propuesto, p.evidencia, p.etiqueta, p.estado, p.recordatorios,
               EXISTS (SELECT 1 FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan a ON a.codigo = v.accion
                       JOIN addi.responsables r ON r.dominio = o.dominio
                       WHERE v.objetivo = p.objetivo AND a.responsable ILIKE '%' || split_part(r.nombre, ' (', 1) || '%')
                 AND o.dominio <> 'EDM' AS copia_cto
        FROM addi.propuestas_cambio p JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo
        WHERE p.estado = 'pendiente' OR (p.estado = 'informativa' AND p.corte = addi.fn_corte('plan'))
        ORDER BY o.dominio, p.objetivo""")).mappings().all()
    aprob = {a.dominio: a for a in db.scalars(select(Aprobador))}
    cto = db.get(Usuario, aprob["EDM"].titular_id) if "EDM" in aprob and aprob["EDM"].titular_id else None

    mensajes = []
    for dom in sorted({f["dominio"] for f in filas}):
        a = aprob.get(dom)
        titular = db.get(Usuario, a.titular_id) if a and a.titular_id else None
        suplente = db.get(Usuario, a.suplente_id) if a and a.suplente_id else None
        props = [{**dict(f), "escalada": f["recordatorios"] >= s.cortes_para_escalar}
                 for f in filas if f["dominio"] == dom and f["tipo"] == "propuesta"]
        alertas = [dict(f) for f in filas if f["dominio"] == dom and f["tipo"] == "alerta"]
        para = [u.correo for u in (titular,) if u]
        if suplente and any(p["escalada"] for p in props):
            para.append(suplente.correo)
        cc = [cto.correo] if cto and any(p["copia_cto"] for p in props) and cto.correo not in para else []
        if not para:
            log.warning("Dominio %s sin aprobador: no se envía correo", dom)
            continue
        cuerpo = "".join(_tarjeta(p, base) for p in props)
        if alertas:
            cuerpo += ('<h3 style="font-size:14px;margin:20px 0 6px">Alertas del corte (no cambian el nivel)</h3>'
                       '<ul style="font-size:13px;color:#334155">')
            cuerpo += "".join(f'<li><b>{html.escape(x["objetivo"])}</b> · {html.escape(x["regla"])}: {html.escape(x["evidencia"])}</li>'
                              for x in alertas) + "</ul>"
        html_correo = (
            '<div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:auto;color:#0f172a">'
            f'<div style="font-size:12px;color:#64748b">Addi · Dashboard estratégico de TI · COBIT 2019</div>'
            f'<h2 style="margin:6px 0 2px">Dominio {dom} · {NOMBRE_DOMINIO[dom]}</h2>'
            f'<p style="font-size:14px;color:#334155">Hola {html.escape(_persona(titular))}: el flujo mensual propuso '
            f'{len(props)} cambio(s) de nivel que necesitan tu decisión. El flujo propone; una persona aprueba.</p>'
            f'{cuerpo}'
            '<p style="font-size:12px;color:#64748b;margin-top:20px">Los botones abren la confirmación en el tablero: ahí '
            'inicias sesión, revisas la evidencia y confirmas. Mientras nadie responda, el cambio queda pendiente y no se aplica. '
            'Los datos simulados no son datos de Addi.</p></div>')
        texto = "\n".join(f"- {p['objetivo']} {p['nivel_actual']} → {p['nivel_propuesto']} ({p['regla']}): "
                          f"{base}/aprobaciones/{p['id']}" for p in props) or "Solo alertas informativas."
        mensajes.append({
            "dominio": dom, "para": ", ".join(para), "cc": ", ".join(cc),
            "asunto": f"[Addi TI] {dom}: {len(props)} cambio(s) de nivel COBIT por decidir" if props
            else f"[Addi TI] {dom}: alertas COBIT del corte",
            "html": html_correo, "texto": texto, "propuestas": len(props), "alertas": len(alertas),
        })
    return mensajes


def disparar_envio() -> None:
    """Le pide a n8n que envíe los correos del corte. Si n8n no está, el tablero sigue funcionando."""
    s = get_settings()
    try:
        httpx.post(s.n8n_webhook_avisos, headers={"X-Internal-Token": s.api_internal_token}, json={"origen": "api"},
                   timeout=5)
    except httpx.HTTPError as e:
        log.warning("No se pudo avisar a n8n: %s", e)
