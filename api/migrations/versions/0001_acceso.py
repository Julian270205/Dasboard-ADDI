"""Esquema acceso: usuarios, roles, aprobadores por dominio, sesiones, auditoría e idempotencia.

Revision ID: 0001
Revises:
"""

from alembic import op

from app.models import ESQUEMA, ROLES, Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {ESQUEMA}")
    Base.metadata.create_all(op.get_bind())
    valores = ", ".join(f"('{r}')" for r in ROLES)
    op.execute(f"INSERT INTO {ESQUEMA}.roles (codigo) VALUES {valores} ON CONFLICT DO NOTHING")
    dominios = ", ".join(f"('{d}')" for d in ("EDM", "APO", "BAI", "DSS", "MEA"))
    op.execute(f"INSERT INTO {ESQUEMA}.aprobadores (dominio) VALUES {dominios} ON CONFLICT DO NOTHING")


def downgrade() -> None:
    op.execute(f"DROP SCHEMA IF EXISTS {ESQUEMA} CASCADE")
