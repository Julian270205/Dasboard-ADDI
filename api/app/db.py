from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# Pool pequeño: la EC2 tiene 1 GB y PostgreSQL acepta 30 conexiones en total.
engine = create_engine(get_settings().database_url, pool_size=5, max_overflow=2, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
