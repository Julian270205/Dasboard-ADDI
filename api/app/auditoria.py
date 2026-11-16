from sqlalchemy.orm import Session

from app.models import Auditoria


def registrar(db: Session, usuario_id: int | None, accion: str, entidad: str, entidad_id: str | None = None,
              antes: dict | None = None, despues: dict | None = None, ip: str | None = None) -> None:
    """Agrega una fila de auditoría a la transacción en curso (no hace commit)."""
    db.add(Auditoria(usuario_id=usuario_id, accion=accion, entidad=entidad, entidad_id=entidad_id,
                     antes=antes, despues=despues, ip=ip))
