from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_AQUI = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"
    database_url: str = "postgresql+psycopg://addi_api:addi@localhost:5432/addi"

    jwt_secret: str = "solo-para-desarrollo"
    session_hours: int = 8
    # n8n manda este token en la cabecera X-Internal-Token, y la API lo manda a n8n al avisar.
    api_internal_token: str = "solo-para-desarrollo"

    public_url: str = "http://localhost"
    cors_origins: str = ""

    # Webhook de n8n que arma y envía los correos del flujo COBIT (paso 4 de la Propuesta).
    n8n_webhook_avisos: str = "http://n8n:5678/webhook/addi-avisos"

    # Propuesta COBIT: "sin respuesta: recordatorio, luego el suplente". Cortes sin decisión para escalar.
    cortes_para_escalar: int = 2

    # Scripts SQL del esquema addi (los genera generador/generar.py): /app/db en el contenedor, ../db en el repo
    carpeta_sql: Path = next((c for c in (_AQUI.parent / "db", _AQUI.parent.parent / "db") if c.exists()), _AQUI.parent / "db")

    @property
    def es_produccion(self) -> bool:
        return self.env == "produccion"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.es_produccion and "desarrollo" in (s.jwt_secret + s.api_internal_token):
        raise RuntimeError("En producción JWT_SECRET y API_INTERNAL_TOKEN deben venir del .env")
    return s
