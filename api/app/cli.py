"""Comandos de operación. Se corren dentro del contenedor:

    docker compose exec api python -m app.cli cargar-datos
    docker compose exec api python -m app.cli crear-admin --nombre "Ana" --correo ana@correo.com
    docker compose exec api python -m app.cli crear-usuarios-demo
"""

import argparse
import getpass
import re
import secrets
import sys

import psycopg
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Aprobador, Rol, Usuario
from app.security import hash_contrasena
from app.servicios import cfg, hay_datos, sincronizar_responsables

SCRIPTS = ("01_esquema.sql", "02_datos_base.sql", "03_mediciones.sql", "04_funciones.sql")


def _version_en_archivo() -> str | None:
    cabecera = (get_settings().carpeta_sql / "03_mediciones.sql").read_text(encoding="utf-8")[:400]
    m = re.search(r"version_parametros=(\S+)", cabecera)
    return m.group(1) if m else None


def cargar_datos(si_cambio: bool = False) -> None:
    """Corre los cuatro scripts de Julian (borran y recrean el esquema addi) y vuelve a reflejar los aprobadores.
    El esquema acceso (usuarios, aprobadores, auditoría) no se toca.
    Con si_cambio (lo usa el despliegue) solo carga si la versión de parámetros de los scripts es otra."""
    s = get_settings()
    url = s.database_url.replace("postgresql+psycopg://", "postgresql://")
    if si_cambio:
        with SessionLocal() as db:
            vigente = cfg(db, "version_parametros") if hay_datos(db) else None
        if vigente and vigente == _version_en_archivo():
            print(f"Datos al día (parámetros {vigente}): no se recargan.")
            return
    with psycopg.connect(url, autocommit=False) as cx:
        for nombre in SCRIPTS:
            ruta = s.carpeta_sql / nombre
            if not ruta.exists():
                sys.exit(f"No encuentro {ruta}. ¿Corriste generador/generar.py?")
            print(f"▸ {nombre}")
            cx.execute(ruta.read_text(encoding="utf-8"))
        cx.commit()
        n, corte = cx.execute("SELECT count(*), addi.fn_cfg('corte_operativo') FROM addi.mediciones").fetchone()
        print(f"Listo: {n} mediciones · corte operativo {corte}")
    with SessionLocal() as db:
        sincronizar_responsables(db)
        db.commit()


def _crear(db, nombre: str, correo: str, roles: list[str], cargo: str | None = None, clave: str | None = None):
    u = db.scalar(select(Usuario).where(Usuario.correo == correo.lower()))
    if u:
        return u, None
    clave = clave or secrets.token_urlsafe(10)
    u = Usuario(nombre=nombre, cargo=cargo, correo=correo.lower(), hash_contrasena=hash_contrasena(clave))
    u.roles = [db.get(Rol, r) for r in roles]
    db.add(u)
    db.flush()
    return u, clave


def crear_admin(nombre: str, correo: str) -> None:
    clave = getpass.getpass("Contraseña (mínimo 10 caracteres): ")
    if len(clave) < 10:
        sys.exit("La contraseña debe tener al menos 10 caracteres.")
    with SessionLocal() as db:
        u, nueva = _crear(db, nombre, correo, ["admin", "lector"], cargo="Administrador del tablero", clave=clave)
        db.commit()
        print("Admin creado." if nueva else f"Ya existía {u.correo}: no se cambió nada.")


# Decisión pendiente 1 de la Propuesta COBIT: EDM con el CTO; los otros cuatro con líderes de área o
# integrantes de Nexus para la demo. El cargo se usa para la regla de copia al CTO.
DEMO = [
    ("EDM", "CTO de Addi (demo)", "CTO", "cto@addi.demo"),
    ("APO", "Head of Technology Risk (demo)", "Head of Technology Risk", "apo@addi.demo"),
    ("BAI", "CPO (demo)", "CPO", "bai@addi.demo"),
    ("DSS", "Head of Ops (demo)", "Líder de Infraestructura", "dss@addi.demo"),
    ("MEA", "Oficial de Cumplimiento (demo)", "Oficial de Cumplimiento", "mea@addi.demo"),
]


def crear_usuarios_demo() -> None:
    with SessionLocal() as db:
        creados = []
        personas = {}
        for dom, nombre, cargo, correo in DEMO:
            u, clave = _crear(db, nombre, correo, ["aprobador", "lector"], cargo=cargo)
            personas[dom] = u
            if clave:
                creados.append((correo, clave))
        u, clave = _crear(db, "Lector de la demo", "lector@addi.demo", ["lector"], cargo="Profesor / jurado")
        if clave:
            creados.append(("lector@addi.demo", clave))
        cto = personas["EDM"]
        for dom, persona in personas.items():
            a = db.get(Aprobador, dom) or Aprobador(dominio=dom)
            # El CTO es suplente de los demás dominios; el de EDM es el Oficial de Cumplimiento.
            a.titular_id, a.suplente_id = persona.id, (personas["MEA"].id if dom == "EDM" else cto.id)
            db.add(a)
        db.flush()
        sincronizar_responsables(db)
        db.commit()
        if not hay_datos(db):
            print("Aviso: aún no hay datos. Corre cargar-datos para que el tablero los muestre.")
    print("Usuarios de la demo (anota las contraseñas: no se vuelven a mostrar):")
    for correo, clave in creados:
        print(f"  {correo:24} {clave}")
    if not creados:
        print("  Ya existían. Para una clave nueva usa Administración → Restablecer.")


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cargar-datos", help="Carga db/01..04 (esquema addi)")
    c.add_argument("--si-cambio", action="store_true", help="Solo si cambió la versión de parámetros")
    a = sub.add_parser("crear-admin")
    a.add_argument("--nombre", required=True)
    a.add_argument("--correo", required=True)
    sub.add_parser("crear-usuarios-demo", help="Aprobadores por dominio y un lector")
    args = p.parse_args()
    if args.cmd == "cargar-datos":
        cargar_datos(si_cambio=args.si_cambio)
    elif args.cmd == "crear-admin":
        crear_admin(args.nombre, args.correo)
    else:
        crear_usuarios_demo()


if __name__ == "__main__":
    main()
