"""Pasos 4 a 6 de la Propuesta COBIT con control de identidad.

El correo de n8n trae los botones Aprobar y Rechazar; cada botón abre esta confirmación en el tablero.
Aquí se exige sesión y se verifica que quien decide sea el titular del dominio (o el suplente cuando la
propuesta ya escaló). La versión nueva del nivel la sigue creando addi.fn_decidir, la función de Julian.
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auditoria import registrar
from app.db import get_db
from app.models import Usuario
from app.security import error, ip_cliente, usuario_actual
from app.servicios import dominios_de, permiso_decidir, propuesta, vinculos
from app.servicios import decidir as decidir_sql

router = APIRouter(prefix="/aprobaciones", tags=["aprobaciones"])


class DecisionIn(BaseModel):
    motivo: str | None = Field(default=None, max_length=1000)


def _vista(db: Session, u: Usuario, p: dict) -> dict:
    rol, puede, porque = permiso_decidir(db, u, p)
    return {**p, "fecha_decision": p["fecha_decision"], "rol": rol, "puede_decidir": puede, "explicacion": porque}


@router.get("")
def mis_aprobaciones(u: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """Propuestas pendientes de los dominios donde soy titular o suplente, y las decididas recientes."""
    doms = list(dominios_de(db, u.id))
    if not doms:
        return {"pendientes": [], "decididas": []}
    filas = db.execute(text("""
        SELECT p.id FROM addi.propuestas_cambio p JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo
        WHERE p.tipo = 'propuesta' AND o.dominio = ANY(:d)
        ORDER BY (p.estado = 'pendiente') DESC, p.id DESC LIMIT 60"""), {"d": doms}).scalars().all()
    todas = [_vista(db, u, propuesta(db, i)) for i in filas]
    return {"pendientes": [p for p in todas if p["estado"] == "pendiente"],
            "decididas": [p for p in todas if p["estado"] != "pendiente"][:20]}


@router.get("/{propuesta_id}")
def ver(propuesta_id: int, u: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    p = propuesta(db, propuesta_id)
    if not p or p["tipo"] != "propuesta":
        raise error(404, "no_existe", "La propuesta no existe.")
    return {**_vista(db, u, p), "vinculos": vinculos(db, p["objetivo"])}


def _decidir(propuesta_id: int, decision: str, datos: DecisionIn, request: Request, u: Usuario, db: Session):
    p = propuesta(db, propuesta_id)
    if not p or p["tipo"] != "propuesta":
        raise error(404, "no_existe", "La propuesta no existe.")
    rol, puede, porque = permiso_decidir(db, u, p)
    if not puede:
        raise error(409 if p["estado"] != "pendiente" else 403, "no_puede_decidir", porque)
    motivo = (datos.motivo or "").strip() or None
    if decision == "rechazar" and not motivo:
        raise error(422, "falta_motivo", "Para rechazar hay que escribir el motivo.")
    r = decidir_sql(db, propuesta_id, decision, f"{u.nombre} ({rol})", motivo)
    registrar(db, u.id, decision, "propuesta_cambio", str(propuesta_id),
              antes={"nivel": p["nivel_actual"], "estado": p["estado"]},
              despues={"resultado": r, "motivo": motivo, "rol": rol}, ip=ip_cliente(request))
    db.commit()
    if not r.get("ok"):
        raise error(409, "no_aplicada", r.get("mensaje", "No se pudo aplicar."))
    return {"ok": True, "mensaje": r["mensaje"], "propuesta": _vista(db, u, propuesta(db, propuesta_id))}


@router.post("/{propuesta_id}/aprobar")
def aprobar(propuesta_id: int, datos: DecisionIn, request: Request, u: Usuario = Depends(usuario_actual),
            db: Session = Depends(get_db)):
    return _decidir(propuesta_id, "aprobar", datos, request, u, db)


@router.post("/{propuesta_id}/rechazar")
def rechazar(propuesta_id: int, datos: DecisionIn, request: Request, u: Usuario = Depends(usuario_actual),
             db: Session = Depends(get_db)):
    return _decidir(propuesta_id, "rechazar", datos, request, u, db)
