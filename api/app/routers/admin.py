"""Administración: reloj de la demo, usuarios, aprobadores por dominio y auditoría. Solo rol admin."""

import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auditoria import registrar
from app.avisos import disparar_envio
from app.db import get_db
from app.models import DOMINIOS, ROLES, Aprobador, Auditoria, Rol, Usuario
from app.security import error, hash_contrasena, ip_cliente, requiere_rol
from app.servicios import avanzar, estado_reloj, hay_datos, poner_cfg, reiniciar, sincronizar_responsables

router = APIRouter(prefix="/admin", tags=["administración"])
solo_admin = requiere_rol("admin")


class PausaIn(BaseModel):
    pausado: bool


class UsuarioIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    cargo: str | None = Field(default=None, max_length=120)
    correo: EmailStr
    roles: list[str]


class UsuarioPatch(BaseModel):
    roles: list[str] | None = None
    activo: bool | None = None
    cargo: str | None = Field(default=None, max_length=120)


class AprobadorIn(BaseModel):
    titular_id: int | None
    suplente_id: int | None


def _usuario(u: Usuario) -> dict:
    return {"id": u.id, "nombre": u.nombre, "cargo": u.cargo, "correo": u.correo, "activo": u.activo,
            "roles": sorted(u.codigos_rol), "ultimo_acceso": u.ultimo_acceso}


def _roles(db: Session, roles: list[str]) -> list[Rol]:
    if not roles or set(roles) - set(ROLES):
        raise error(422, "rol_invalido", f"Roles válidos: {', '.join(ROLES)}.")
    return [db.get(Rol, r) for r in roles]


# ---------------------------------------------------------------- reloj
@router.get("/reloj")
def ver_reloj(_: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    return estado_reloj(db)


@router.post("/reloj/avanzar")
def avanzar_reloj(request: Request, tareas: BackgroundTasks, admin: Usuario = Depends(solo_admin),
                  db: Session = Depends(get_db)):
    if not hay_datos(db):
        raise error(503, "sin_datos", "Faltan los datos: corre `python -m app.cli cargar-datos`.")
    r = avanzar(db, f"admin:{admin.id}")
    registrar(db, admin.id, "avanzar_reloj", "reloj", None, despues=r, ip=ip_cliente(request))
    db.commit()
    if r.get("ok") and not r.get("ya_hecho"):
        tareas.add_task(disparar_envio)            # n8n envía los correos del corte nuevo
    return r


@router.post("/reloj/reiniciar")
def reiniciar_reloj(request: Request, admin: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    r = reiniciar(db, f"admin:{admin.id}")
    registrar(db, admin.id, "reiniciar_demo", "reloj", None, despues=r, ip=ip_cliente(request))
    db.commit()
    return r


@router.post("/reloj/pausa")
def pausar_reloj(datos: PausaIn, request: Request, admin: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    poner_cfg(db, "pausado", "si" if datos.pausado else "no")
    registrar(db, admin.id, "pausar_reloj" if datos.pausado else "reanudar_reloj", "reloj", None, ip=ip_cliente(request))
    db.commit()
    return {"pausado": datos.pausado}


# ---------------------------------------------------------------- usuarios
@router.get("/usuarios")
def usuarios(_: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    return [_usuario(u) for u in db.scalars(select(Usuario).order_by(Usuario.nombre))]


@router.post("/usuarios", status_code=201)
def crear_usuario(datos: UsuarioIn, request: Request, admin: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    correo = datos.correo.lower()
    if db.scalar(select(Usuario).where(Usuario.correo == correo)):
        raise error(409, "correo_existe", "Ya hay un usuario con ese correo.")
    clave = secrets.token_urlsafe(12)
    u = Usuario(nombre=datos.nombre, cargo=datos.cargo, correo=correo, hash_contrasena=hash_contrasena(clave))
    u.roles = _roles(db, datos.roles)
    db.add(u)
    db.flush()
    registrar(db, admin.id, "crear_usuario", "usuario", str(u.id), despues={"correo": correo, "roles": datos.roles},
              ip=ip_cliente(request))
    db.commit()
    return {**_usuario(u), "contrasena_temporal": clave}


@router.patch("/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, datos: UsuarioPatch, request: Request, admin: Usuario = Depends(solo_admin),
                   db: Session = Depends(get_db)):
    u = db.get(Usuario, usuario_id)
    if not u:
        raise error(404, "no_existe", "Usuario no encontrado.")
    antes = _usuario(u)
    if datos.roles is not None:
        if u.id == admin.id and "admin" not in datos.roles:
            raise error(422, "auto_degradar", "No puedes quitarte el rol admin a ti mismo.")
        u.roles = _roles(db, datos.roles)
    if datos.activo is not None:
        u.activo = datos.activo
    if datos.cargo is not None:
        u.cargo = datos.cargo or None
    sincronizar_responsables(db)
    registrar(db, admin.id, "editar_usuario", "usuario", str(u.id), antes={"roles": antes["roles"], "activo": antes["activo"]},
              despues=datos.model_dump(exclude_none=True), ip=ip_cliente(request))
    db.commit()
    return _usuario(u)


@router.post("/usuarios/{usuario_id}/restablecer")
def restablecer(usuario_id: int, request: Request, admin: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    u = db.get(Usuario, usuario_id)
    if not u:
        raise error(404, "no_existe", "Usuario no encontrado.")
    clave = secrets.token_urlsafe(12)
    u.hash_contrasena = hash_contrasena(clave)
    registrar(db, admin.id, "restablecer_contrasena", "usuario", str(u.id), ip=ip_cliente(request))
    db.commit()
    return {"contrasena_temporal": clave}


# ---------------------------------------------------------------- aprobadores por dominio
@router.get("/aprobadores")
def aprobadores(_: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    return [{"dominio": a.dominio, "titular_id": a.titular_id, "suplente_id": a.suplente_id}
            for a in db.scalars(select(Aprobador).order_by(Aprobador.dominio))]


@router.put("/aprobadores/{dominio}")
def fijar_aprobador(dominio: str, datos: AprobadorIn, request: Request, admin: Usuario = Depends(solo_admin),
                    db: Session = Depends(get_db)):
    if dominio not in DOMINIOS:
        raise error(404, "dominio", "Dominio desconocido.")
    for uid in (datos.titular_id, datos.suplente_id):
        if uid is not None:
            u = db.get(Usuario, uid)
            if not u or not u.activo or "aprobador" not in u.codigos_rol:
                raise error(422, "no_aprobador", "Titular y suplente deben estar activos y tener rol aprobador.")
    if datos.titular_id is not None and datos.titular_id == datos.suplente_id:
        raise error(422, "misma_persona", "Titular y suplente deben ser personas distintas.")
    a = db.get(Aprobador, dominio) or Aprobador(dominio=dominio)
    antes = {"titular_id": a.titular_id, "suplente_id": a.suplente_id}
    a.titular_id, a.suplente_id = datos.titular_id, datos.suplente_id
    db.add(a)
    db.flush()
    sincronizar_responsables(db)
    registrar(db, admin.id, "fijar_aprobador", "aprobador", dominio, antes=antes, despues=datos.model_dump(),
              ip=ip_cliente(request))
    db.commit()
    return {"dominio": dominio, **datos.model_dump()}


# ---------------------------------------------------------------- auditoría
@router.get("/auditoria")
def auditoria(limite: int = 100, _: Usuario = Depends(solo_admin), db: Session = Depends(get_db)):
    nombres = {u.id: u.nombre for u in db.scalars(select(Usuario))}
    filas = db.scalars(select(Auditoria).order_by(Auditoria.id.desc()).limit(min(limite, 500)))
    return [{"id": a.id, "usuario": nombres.get(a.usuario_id), "accion": a.accion, "entidad": a.entidad,
             "entidad_id": a.entidad_id, "fecha": a.fecha, "ip": a.ip} for a in filas]
