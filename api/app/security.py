"""Contraseñas, sesiones (JWT en cookie httpOnly), CSRF, roles y token interno de n8n."""

import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Sesion, Usuario

COOKIE_SESION = "sesion"
COOKIE_CSRF = "csrf"
_ph = PasswordHasher()


def error(codigo_http: int, codigo: str, mensaje: str) -> HTTPException:
    """Formato único de error del contrato: {"error": {"codigo", "mensaje"}}."""
    return HTTPException(status_code=codigo_http, detail={"codigo": codigo, "mensaje": mensaje})


# ---------- Contraseñas ----------
def hash_contrasena(clave: str) -> str:
    return _ph.hash(clave)


def verificar_contrasena(hash_guardado: str, clave: str) -> bool:
    try:
        return _ph.verify(hash_guardado, clave)
    except VerificationError:
        return False


# ---------- Tokens ----------
def crear_token(usuario_id: int, jti: str, expira: datetime) -> str:
    payload = {"sub": str(usuario_id), "jti": jti, "exp": expira, "iat": datetime.now(UTC)}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def leer_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])


def nueva_sesion(db: Session, usuario: Usuario) -> tuple[str, str, datetime]:
    """Crea la fila de sesión y devuelve (jwt, csrf, expira)."""
    expira = datetime.now(UTC) + timedelta(hours=get_settings().session_hours)
    jti = secrets.token_urlsafe(24)
    db.add(Sesion(id=jti, usuario_id=usuario.id, expira_en=expira))
    return crear_token(usuario.id, jti, expira), secrets.token_urlsafe(24), expira


# ---------- Límite de intentos de login (en memoria: hay un solo worker) ----------
_intentos: dict[str, deque] = defaultdict(deque)


def limitar_login(ip: str, maximo: int = 5, ventana_s: int = 60) -> None:
    ahora = time.monotonic()
    cola = _intentos[ip]
    while cola and ahora - cola[0] > ventana_s:
        cola.popleft()
    if len(cola) >= maximo:
        raise error(429, "demasiados_intentos", "Demasiados intentos. Espera un minuto.")
    cola.append(ahora)


# ---------- Dependencias ----------
def usuario_actual(request: Request, db: Session = Depends(get_db)) -> Usuario:
    token = request.cookies.get(COOKIE_SESION)
    if not token:
        raise error(401, "sin_sesion", "Inicia sesión.")
    try:
        datos = leer_token(token)
    except jwt.PyJWTError:
        raise error(401, "sesion_invalida", "Tu sesión venció. Inicia sesión de nuevo.") from None
    sesion = db.get(Sesion, datos["jti"])
    if not sesion or sesion.revocada:
        raise error(401, "sesion_revocada", "Tu sesión se cerró. Inicia sesión de nuevo.")
    usuario = db.get(Usuario, int(datos["sub"]))
    if not usuario or not usuario.activo:
        raise error(401, "usuario_inactivo", "Tu usuario está desactivado.")
    request.state.jti = datos["jti"]

    # CSRF de doble envío: toda petición que cambia algo trae la cabecera igual a la cookie.
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        cookie = request.cookies.get(COOKIE_CSRF, "")
        cabecera = request.headers.get("X-CSRF-Token", "")
        if not cookie or not hmac.compare_digest(cookie, cabecera):
            raise error(403, "csrf", "Falta o no coincide el token CSRF.")
    return usuario


def requiere_rol(*roles: str):
    def _dep(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if not usuario.codigos_rol.intersection(roles):
            raise error(403, "sin_permiso", "Tu rol no permite esta acción.")
        return usuario

    return _dep


def token_interno(x_internal_token: str = Header(default="")) -> None:
    """Solo n8n conoce este token. Además Caddy no publica /api/v1/internal."""
    if not hmac.compare_digest(x_internal_token, get_settings().api_internal_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"codigo": "token_interno", "mensaje": "No."})


def ip_cliente(request: Request) -> str:
    return request.client.host if request.client else "desconocida"
