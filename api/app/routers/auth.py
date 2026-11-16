from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auditoria import registrar
from app.config import get_settings
from app.db import get_db
from app.models import Sesion, Usuario
from app.security import (
    COOKIE_CSRF, COOKIE_SESION, error, hash_contrasena, ip_cliente, limitar_login, nueva_sesion,
    usuario_actual, verificar_contrasena,
)
from app.servicios import dominios_de

router = APIRouter(prefix="/auth", tags=["autenticación"])


class LoginIn(BaseModel):
    correo: EmailStr
    contrasena: str = Field(min_length=1, max_length=200)


class CambioIn(BaseModel):
    actual: str
    nueva: str = Field(min_length=10, max_length=200)


def perfil(db: Session, u: Usuario) -> dict:
    return {"id": u.id, "nombre": u.nombre, "cargo": u.cargo, "correo": u.correo, "roles": sorted(u.codigos_rol),
            "dominios": dominios_de(db, u.id)}


@router.post("/login")
def login(datos: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    limitar_login(ip_cliente(request))
    u = db.scalar(select(Usuario).where(Usuario.correo == datos.correo.lower()))
    if not u or not u.activo or not verificar_contrasena(u.hash_contrasena, datos.contrasena):
        raise error(401, "credenciales", "Correo o contraseña incorrectos.")
    token, csrf, expira = nueva_sesion(db, u)
    u.ultimo_acceso = datetime.now(UTC)
    registrar(db, u.id, "login", "usuario", str(u.id), ip=ip_cliente(request))
    db.commit()

    seguro = get_settings().es_produccion
    max_age = int((expira - datetime.now(UTC)).total_seconds())
    response.set_cookie(COOKIE_SESION, token, httponly=True, secure=seguro, samesite="lax", max_age=max_age, path="/")
    response.set_cookie(COOKIE_CSRF, csrf, httponly=False, secure=seguro, samesite="lax", max_age=max_age, path="/")
    return perfil(db, u)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, u: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    sesion = db.get(Sesion, request.state.jti)
    if sesion:
        sesion.revocada = True
    db.commit()
    response.delete_cookie(COOKIE_SESION, path="/")
    response.delete_cookie(COOKIE_CSRF, path="/")


@router.get("/me")
def me(u: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    return perfil(db, u)


@router.post("/cambiar-contrasena", status_code=204)
def cambiar_contrasena(datos: CambioIn, request: Request, u: Usuario = Depends(usuario_actual),
                       db: Session = Depends(get_db)):
    if not verificar_contrasena(u.hash_contrasena, datos.actual):
        raise error(422, "contrasena_actual", "La contraseña actual no coincide.")
    u.hash_contrasena = hash_contrasena(datos.nueva)
    registrar(db, u.id, "cambiar_contrasena", "usuario", str(u.id), ip=ip_cliente(request))
    db.commit()
