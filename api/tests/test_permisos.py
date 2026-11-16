"""Reglas de quién decide (Propuesta COBIT). No necesitan base de datos."""

from types import SimpleNamespace

import pytest

from app import servicios

TITULAR, SUPLENTE, OTRO = 1, 2, 3


@pytest.fixture(autouse=True)
def aprobadores(monkeypatch):
    monkeypatch.setattr(servicios, "aprobador_de",
                        lambda db, dom: SimpleNamespace(dominio=dom, titular_id=TITULAR, suplente_id=SUPLENTE))


def usuario(uid, *roles):
    return SimpleNamespace(id=uid, codigos_rol=set(roles))


def prop(**k):
    return {"estado": "pendiente", "dominio": "DSS", "recordatorios": 0, **k}


def test_titular_decide():
    assert servicios.permiso_decidir(None, usuario(TITULAR, "aprobador"), prop())[:2] == ("titular", True)


def test_suplente_espera_el_escalado():
    rol, puede, _ = servicios.permiso_decidir(None, usuario(SUPLENTE, "aprobador"), prop(recordatorios=1))
    assert (rol, puede) == ("suplente", False)
    assert servicios.permiso_decidir(None, usuario(SUPLENTE, "aprobador"), prop(recordatorios=2))[:2] == ("suplente", True)


def test_otro_aprobador_o_admin_no_deciden():
    assert servicios.permiso_decidir(None, usuario(OTRO, "aprobador"), prop())[1] is False
    assert servicios.permiso_decidir(None, usuario(OTRO, "admin"), prop())[1] is False


def test_lector_no_decide_aunque_sea_titular():
    assert servicios.permiso_decidir(None, usuario(TITULAR, "lector"), prop())[1] is False


def test_propuesta_decidida_no_se_vuelve_a_decidir():
    assert servicios.permiso_decidir(None, usuario(TITULAR, "aprobador"), prop(estado="aprobada"))[1] is False
