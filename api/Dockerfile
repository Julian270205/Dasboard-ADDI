# Se construye en GitHub Actions (contexto = raíz del repo), nunca en la EC2.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONPATH=/app
WORKDIR /app

COPY api/requirements.txt .
RUN pip install -r requirements.txt

COPY api/alembic.ini .
COPY api/migrations ./migrations
COPY api/app ./app
# Scripts del esquema addi que escribe generador/generar.py (los carga `python -m app.cli cargar-datos`)
COPY db ./db

RUN useradd --create-home --uid 1000 api
USER api

EXPOSE 8000
# Un solo worker: la EC2 tiene 1 GB de RAM.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
