"""Esquema `acceso`: lo único que la API agrega a la base de Julian.

El esquema `addi` (datos, reglas y funciones SQL) lo crean los scripts de db/ que escribe el generador.
Aquí viven las personas, sus roles, quién aprueba cada dominio COBIT, las sesiones, la auditoría y las
llaves de idempotencia del reloj. Lo crea la migración de Alembic 0001.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, MetaData, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ESQUEMA = "acceso"
ROLES = ("lector", "aprobador", "admin")
DOMINIOS = ("EDM", "APO", "BAI", "DSS", "MEA")

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING, schema=ESQUEMA)


def _ahora() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _en(col: str, valores: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in valores)})"


class Rol(Base):
    __tablename__ = "roles"
    __table_args__ = (CheckConstraint(_en("codigo", ROLES), name="codigo_valido"),)
    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    cargo: Mapped[str | None] = mapped_column(String(120))
    correo: Mapped[str] = mapped_column(String(200), unique=True)
    hash_contrasena: Mapped[str] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    creado_en: Mapped[datetime] = _ahora()
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    roles: Mapped[list[Rol]] = relationship(secondary=f"{ESQUEMA}.usuario_roles", lazy="selectin")

    @property
    def codigos_rol(self) -> set[str]:
        return {r.codigo for r in self.roles}


class UsuarioRol(Base):
    __tablename__ = "usuario_roles"
    usuario_id: Mapped[int] = mapped_column(ForeignKey(f"{ESQUEMA}.usuarios.id", ondelete="CASCADE"), primary_key=True)
    rol: Mapped[str] = mapped_column(ForeignKey(f"{ESQUEMA}.roles.codigo"), primary_key=True)


class Aprobador(Base):
    """Quién aprueba cada dominio COBIT (decisión pendiente 1 de la Propuesta). Se refleja en addi.responsables."""

    __tablename__ = "aprobadores"
    __table_args__ = (CheckConstraint(_en("dominio", DOMINIOS), name="dominio_valido"),
                      CheckConstraint("titular_id IS NULL OR titular_id <> suplente_id", name="personas_distintas"))
    dominio: Mapped[str] = mapped_column(String(3), primary_key=True)
    titular_id: Mapped[int | None] = mapped_column(ForeignKey(f"{ESQUEMA}.usuarios.id"))
    suplente_id: Mapped[int | None] = mapped_column(ForeignKey(f"{ESQUEMA}.usuarios.id"))


class Sesion(Base):
    """Una fila por inicio de sesión. El JWT lleva el id (jti); cerrar sesión la revoca."""

    __tablename__ = "sesiones"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey(f"{ESQUEMA}.usuarios.id", ondelete="CASCADE"), index=True)
    creada_en: Mapped[datetime] = _ahora()
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revocada: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Auditoria(Base):
    """Solo se inserta. Ningún endpoint la edita o borra."""

    __tablename__ = "auditoria"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey(f"{ESQUEMA}.usuarios.id"), index=True)
    accion: Mapped[str] = mapped_column(String(60))
    entidad: Mapped[str] = mapped_column(String(60))
    entidad_id: Mapped[str | None] = mapped_column(String(60))
    antes: Mapped[dict | None] = mapped_column(JSONB)
    despues: Mapped[dict | None] = mapped_column(JSONB)
    fecha: Mapped[datetime] = _ahora()
    ip: Mapped[str | None] = mapped_column(String(60))


class Ejecucion(Base):
    """Llaves de idempotencia del reloj: el mismo mes no avanza dos veces aunque n8n o el admin repitan."""

    __tablename__ = "ejecuciones"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    llave: Mapped[str] = mapped_column(String(120), unique=True)
    origen: Mapped[str] = mapped_column(String(60))
    resultado: Mapped[dict | None] = mapped_column(JSONB)
    creada_en: Mapped[datetime] = _ahora()
