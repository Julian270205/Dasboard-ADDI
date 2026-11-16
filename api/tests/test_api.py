"""Pruebas de punta a punta contra PostgreSQL real, con los datos de Julian cargados.
En CI corren con un servicio postgres (ver .github/workflows/ci.yml). En local: exportar DATABASE_URL."""

import os

import pytest

pytestmark = pytest.mark.db

if not os.getenv("DATABASE_URL"):
    pytest.skip("Sin DATABASE_URL: se omiten las pruebas con base de datos", allow_module_level=True)

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import cli  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Aprobador, Rol, Usuario  # noqa: E402
from app.security import hash_contrasena  # noqa: E402

CLAVE = "clave-segura-123"


@pytest.fixture(scope="module")
def datos():
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    cli.cargar_datos()
    with SessionLocal() as db:
        def usuario(nombre, correo, roles, cargo=None):
            u = Usuario(nombre=nombre, cargo=cargo, correo=correo, hash_contrasena=hash_contrasena(CLAVE))
            u.roles = [db.get(Rol, r) for r in roles]
            db.add(u)
            db.flush()
            return u
        admin = usuario("Admin", "admin@test.co", ["admin", "lector"])
        lector = usuario("Lector", "lector@test.co", ["lector"])
        aprob = {d: usuario(f"Aprobador {d}", f"{d.lower()}@test.co", ["aprobador", "lector"], cargo=f"Líder {d}")
                 for d in ("EDM", "APO", "BAI", "DSS", "MEA")}
        for d, u in aprob.items():
            a = db.get(Aprobador, d)
            a.titular_id, a.suplente_id = u.id, (aprob["MEA"] if d == "EDM" else aprob["EDM"]).id
        db.commit()
        pendiente = db.execute(text("""SELECT p.id, o.dominio FROM addi.propuestas_cambio p
            JOIN addi.objetivos_cobit o ON o.codigo = p.objetivo WHERE p.estado = 'pendiente' ORDER BY p.id LIMIT 1""")).first()
        return {"admin": admin.id, "lector": lector.id, "propuesta": pendiente.id if pendiente else None,
                "dominio": pendiente.dominio if pendiente else None}


def entrar(correo):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"correo": correo, "contrasena": CLAVE})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = c.cookies["csrf"]
    return c


def test_salud():
    assert TestClient(app).get("/api/v1/salud").json()["ok"]


def test_tablero_exige_sesion(datos):
    assert TestClient(app).get("/api/v1/tablero").status_code == 401


def test_tablero_trae_el_json_de_julian(datos):
    d = entrar("lector@test.co").get("/api/v1/tablero").json()
    assert len(d["indicadores"]) == 60 and len(d["plan"]) == 22 and len(d["riesgos"]) == 11
    assert d["config"]["corte_operativo"] == "2026-11-01"


def test_csrf_obligatorio(datos):
    c = entrar("admin@test.co")
    del c.headers["X-CSRF-Token"]
    assert c.post("/api/v1/admin/reloj/pausa", json={"pausado": False}).status_code == 403


def test_lector_y_admin_no_aprueban(datos):
    if not datos["propuesta"]:
        pytest.skip("sin propuestas en el corte inicial")
    for correo in ("lector@test.co", "admin@test.co"):
        r = entrar(correo).post(f"/api/v1/aprobaciones/{datos['propuesta']}/aprobar", json={})
        assert r.status_code == 403


def test_rechazar_exige_motivo_y_aprobar_versiona(datos):
    if not datos["propuesta"]:
        pytest.skip("sin propuestas en el corte inicial")
    c = entrar(f"{datos['dominio'].lower()}@test.co")
    assert c.post(f"/api/v1/aprobaciones/{datos['propuesta']}/rechazar", json={"motivo": " "}).status_code == 422
    r = c.post(f"/api/v1/aprobaciones/{datos['propuesta']}/aprobar", json={})
    assert r.status_code == 200, r.text
    assert c.post(f"/api/v1/aprobaciones/{datos['propuesta']}/aprobar", json={}).status_code == 409
    hist = c.get("/api/v1/tablero").json()["historial_madurez"]
    assert hist and hist[0]["aprobador"].startswith("Aprobador")


def test_reloj_idempotente(datos):
    c = entrar("admin@test.co")
    llave = c.get("/api/v1/admin/reloj").json()["llave_siguiente"]
    r = c.post("/api/v1/admin/reloj/avanzar").json()
    assert r["ok"] and not r["ya_hecho"]
    assert c.get("/api/v1/admin/reloj").json()["llave_siguiente"] != llave


def test_internos_exigen_token():
    assert TestClient(app).post("/api/v1/internal/corte").status_code == 401
