"""Lectura del tablero: el mismo JSON que arma addi.api_dashboard() en la v1, ahora detrás del login."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.security import error, usuario_actual
from app.servicios import hay_datos, tablero as leer_tablero

router = APIRouter(tags=["tablero"], dependencies=[Depends(usuario_actual)])


@router.get("/tablero")
def tablero(db: Session = Depends(get_db)):
    if not hay_datos(db):
        raise error(503, "sin_datos", "Faltan los datos: corre `python -m app.cli cargar-datos`.")
    return leer_tablero(db)
