"""Puente con el esquema `addi` de Julian: la lógica sigue en sus funciones SQL; la API decide quién puede usarlas."""

import json
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Aprobador, Ejecucion, Usuario


def _json(v: Any) -> Any:
    return json.loads(v) if isinstance(v, str) else v


def hay_datos(db: Session) -> bool:
    return bool(db.scalar(text("SELECT to_regprocedure('addi.api_dashboard()') IS NOT NULL")))


def tablero(db: Session) -> dict:
    return _json(db.scalar(text("SELECT addi.api_dashboard()")))


def cfg(db: Session, clave: str) -> str | None:
    return db.scalar(text("SELECT addi.fn_cfg(:c)"), {"c": clave})


def poner_cfg(db: Session, clave: str, valor: str) -> None:
    db.execute(text("UPDATE addi.config_global SET valor = :v WHERE clave = :c"), {"v": valor, "c": clave})


# ---------------------------------------------------------------- aprobadores
def aprobador_de(db: Session, dominio: str) -> Aprobador | None:
    return db.get(Aprobador, dominio)


def dominios_de(db: Session, usuario_id: int) -> dict[str, str]:
    """Dominio -> 'titular' o 'suplente'."""
    salida: dict[str, str] = {}
    for a in db.scalars(select(Aprobador)):
        if a.titular_id == usuario_id:
            salida[a.dominio] = "titular"
        elif a.suplente_id == usuario_id:
            salida[a.dominio] = "suplente"
    return salida


def sincronizar_responsables(db: Session) -> None:
    """Refleja acceso.aprobadores en addi.responsables, que es lo que leen el tablero y el correo de Julian."""
    if not hay_datos(db):
        return
    def etiqueta(u: Usuario | None) -> str | None:
        # "Cargo (Nombre)": la regla de copia al CTO de Julian compara el cargo con el responsable de la acción.
        return None if not u else (f"{u.cargo} ({u.nombre})" if u.cargo else u.nombre)[:80]

    for a in db.scalars(select(Aprobador)):
        t = db.get(Usuario, a.titular_id) if a.titular_id else None
        s = db.get(Usuario, a.suplente_id) if a.suplente_id else None
        db.execute(text("UPDATE addi.responsables SET nombre = :n, correo = :c, suplente = :s WHERE dominio = :d"),
                   {"n": etiqueta(t) or "Por definir", "c": t.correo if t else None, "s": etiqueta(s), "d": a.dominio})


# ---------------------------------------------------------------- propuestas COBIT
def propuesta(db: Session, propuesta_id: int) -> dict | None:
    fila = db.execute(text("""
        SELECT p.id, to_char(p.corte, 'YYYY-MM') AS corte, p.objetivo, o.nombre, o.dominio, p.tipo, p.regla,
               p.nivel_actual, p.nivel_propuesto, p.evidencia, p.etiqueta, p.estado, p.aprobador, p.motivo_rechazo,
               p.recordatorios, p.fecha_decision, m.nivel AS nivel_vigente, mm.nivel_objetivo,
               aw.importancia, aw.desempeno, aw.etiqueta_evidencia, aw.justificacion
        FROM addi.propuestas_cambio p
        JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo
        LEFT JOIN addi.v_madurez m ON m.objetivo = p.objetivo
        LEFT JOIN addi.metas_madurez mm ON mm.objetivo = p.objetivo
        LEFT JOIN addi.diagnostico_awareness aw ON aw.objetivo = p.objetivo
        WHERE p.id = :id"""), {"id": propuesta_id}).mappings().first()
    return dict(fila) if fila else None


def vinculos(db: Session, objetivo: str) -> dict:
    """Lo que mueve al objetivo (elementos 66 a 68): indicadores con su semáforo, acciones y riesgos."""
    ind = db.execute(text("""
        SELECT i.indicador_id AS id, i.nombre, i.unidad, e.valor, e.meta, e.semaforo
        FROM addi.vinculos_objetivo v JOIN addi.indicadores i ON i.indicador_id = v.indicador_id
        LEFT JOIN addi.fn_estado(0) e ON e.indicador_id = i.indicador_id
        WHERE v.objetivo = :o ORDER BY i.indicador_id"""), {"o": objetivo}).mappings().all()
    acc = db.execute(text("""
        SELECT a.codigo, a.accion, a.responsable, to_char(a.inicio, 'YYYY-MM') AS inicio, to_char(a.fin, 'YYYY-MM') AS fin
        FROM addi.vinculos_objetivo v JOIN addi.iniciativas_plan a ON a.codigo = v.accion
        WHERE v.objetivo = :o ORDER BY a.codigo"""), {"o": objetivo}).mappings().all()
    rie = db.execute(text("""
        SELECT r.riesgo_id AS id, r.riesgo, r.probabilidad * r.impacto AS inherente
        FROM addi.vinculos_objetivo v JOIN addi.riesgos r ON r.riesgo_id = v.riesgo_id
        WHERE v.objetivo = :o ORDER BY r.riesgo_id"""), {"o": objetivo}).mappings().all()
    return {"indicadores": [dict(x) for x in ind], "acciones": [dict(x) for x in acc], "riesgos": [dict(x) for x in rie]}


def permiso_decidir(db: Session, usuario: Usuario, p: dict) -> tuple[str | None, bool, str]:
    """(rol en el dominio, puede decidir, explicación). Regla de la Propuesta COBIT:
    decide el titular del dominio; el suplente entra cuando la propuesta lleva N cortes sin respuesta."""
    if p["estado"] != "pendiente":
        return None, False, f"La propuesta ya está {p['estado']}."
    if "aprobador" not in usuario.codigos_rol:
        return None, False, "Tu rol no aprueba cambios de nivel."
    a = aprobador_de(db, p["dominio"])
    if not a:
        return None, False, "El dominio no tiene aprobador asignado."
    if a.titular_id == usuario.id:
        return "titular", True, "Eres el titular del dominio."
    if a.suplente_id == usuario.id:
        n = get_settings().cortes_para_escalar
        if p["recordatorios"] >= n:
            return "suplente", True, f"Escalada al suplente: {p['recordatorios']} cortes sin respuesta del titular."
        return "suplente", False, f"Eres suplente: podrás decidir si el titular no responde en {n} cortes."
    return None, False, f"Solo el titular o el suplente de {p['dominio']} deciden esta propuesta."


def decidir(db: Session, propuesta_id: int, decision: str, quien: str, motivo: str | None) -> dict:
    """Llama la función de Julian, que versiona el nivel o registra el rechazo, y detecta las caducadas."""
    return _json(db.scalar(text("SELECT addi.fn_decidir(:id, :d, :q, :m)"),
                           {"id": propuesta_id, "d": decision, "q": quien, "m": motivo}))


# ---------------------------------------------------------------- reloj
def estado_reloj(db: Session) -> dict:
    if not hay_datos(db):
        return {"configurado": False}
    c = {k: cfg(db, k) for k in ("corte_operativo", "corte_plan", "corte_inicial_operativo", "corte_inicial_plan",
                                  "fin_horizonte", "pausado", "corrida", "version_parametros")}
    ejec = db.execute(text("SELECT fecha, resultado FROM addi.ejecuciones ORDER BY id DESC LIMIT 12")).mappings().all()
    return {"configurado": True, **c, "pausado": c["pausado"] == "si",
            "llave_siguiente": f"corte:{c['corte_operativo']}+1:c{c['corrida']}:{c['version_parametros']}",
            "ejecuciones": [dict(e) for e in ejec]}


def avanzar(db: Session, origen: str) -> dict:
    """Un mes por llave: si n8n y el admin coinciden, el segundo recibe 'ya_hecho' y nada se mueve dos veces."""
    llave = estado_reloj(db)["llave_siguiente"]
    previo = db.scalar(select(Ejecucion).where(Ejecucion.llave == llave))
    if previo:
        return {**(previo.resultado or {}), "ya_hecho": True}
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:l))"), {"l": llave})
    if db.scalar(select(Ejecucion).where(Ejecucion.llave == llave)):
        return {"ok": True, "mensaje": "Ya estaba hecho.", "ya_hecho": True}
    r = _json(db.scalar(text("SELECT addi.fn_avanzar_corte()")))
    if r.get("ok"):
        db.add(Ejecucion(llave=llave, origen=origen, resultado=r))
    return {**r, "ya_hecho": False}


def reiniciar(db: Session, origen: str) -> dict:
    r = _json(db.scalar(text("SELECT addi.fn_reiniciar_demo()")))
    db.add(Ejecucion(llave=f"reinicio:c{cfg(db, 'corrida')}", origen=origen, resultado=r))
    return r
