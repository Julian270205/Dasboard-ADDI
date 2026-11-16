"""Endpoints que solo llama n8n por la red de Docker (Caddy responde 404 a /api/v1/internal desde afuera).

n8n ya no toca la base: el cron mensual pide el corte aquí y la API arma los correos que n8n envía.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.avisos import armar
from app.db import get_db
from app.security import error, token_interno
from app.servicios import avanzar, hay_datos

router = APIRouter(prefix="/internal", tags=["interno (n8n)"], dependencies=[Depends(token_interno)])


@router.post("/corte")
def corte(db: Session = Depends(get_db)):
    """Paso 1 a 3 del flujo: avanza un mes, recalcula alertas y propone cambios (addi.fn_avanzar_corte)."""
    if not hay_datos(db):
        raise error(503, "sin_datos", "Faltan los datos.")
    r = avanzar(db, "n8n")
    db.commit()
    return r


@router.get("/avisos")
def avisos(db: Session = Depends(get_db)):
    """Paso 4: un correo por dominio con propuestas o alertas, con los botones Aprobar y Rechazar."""
    if not hay_datos(db):
        return []
    return armar(db)
