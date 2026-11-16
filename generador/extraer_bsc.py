"""Convierte la BD del BSC (BD_Dashboard_TI_Addi.xlsx) en un JSON versionado para la carga.

Uso (desde la carpeta generador/, con openpyxl instalado):
    python3 extraer_bsc.py

Entrada: datos/BD_Dashboard_TI_Addi.xlsx · Salida: generador/bsc.json

Qué se carga y qué no:
- Sí: los 15 indicadores, su línea base 2026, las metas 2027-2030, las 22 acciones del plan,
  la meta acumulada del plan y los 11 riesgos.
- No: los valores simulados anuales de la hoja Series. Los reemplaza el generador mensual
  (documento de generación de datos), que tiene semilla y versión propias.
"""

import json
import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "datos" / "BD_Dashboard_TI_Addi.xlsx"
SALIDA = RAIZ / "generador" / "bsc.json"

# Código BSC -> número de elemento del catálogo del dashboard (documento de generación de datos)
ELEMENTO = {"F1.2": 27, "F1.3": 26, "C1.1": 47, "PI1.1": 28, "PI2.2": 20, "AC1.2": 56}
# Tipo de dato de la línea base -> clase del documento de generación
CLASE = {"Real": 2, "Estimado": 2, "Hito del documento": 1, "Por levantar": 3}


def filas(hoja):
    ws = openpyxl.load_workbook(FUENTE, data_only=True)[hoja]
    datos = list(ws.iter_rows(values_only=True))
    enc = [str(c).strip() for c in datos[0]]
    return [dict(zip(enc, f, strict=False)) for f in datos[1:] if any(v is not None for v in f)]


def num(v):
    return None if v is None or v == "" else float(v)


def ent(v):
    return None if v is None or v == "" else int(v)


def main():
    series = filas("Series")
    base = {s["id_indicador"]: s for s in series if ent(s["anio"]) == 2026}

    indicadores, metas = [], []
    for i in filas("Indicadores"):
        cod = i["id_indicador"]
        indicadores.append({
            "indicador_id": cod, "codigo_bsc": cod, "elemento": ELEMENTO.get(cod), "seccion": "bsc",
            "perspectiva": i["perspectiva"], "objetivo_bsc": f'{i["id_objetivo"]} · {i["objetivo"]}',
            "nombre": i["indicador"], "unidad": i["unidad"], "sentido": i["sentido"].lower(),
            "formula": i["formula"], "rol_responsable": i["responsable"], "fuente": i["fuente"],
            "clase": CLASE[i["tipo_dato_linea_base"]], "tipo_linea_base": i["tipo_dato_linea_base"],
            "linea_base": num(base[cod]["valor_real"]) if cod in base else None,
        })
    for s in series:
        anio, meta = ent(s["anio"]), num(s["meta_plan"])
        if anio and anio >= 2027 and meta is not None:
            metas.append({"indicador_id": s["id_indicador"], "anio": anio, "meta": meta, "origen": s["origen_meta"]})

    plan = [{
        "codigo": p["codigo"], "origen": p["origen"], "accion": p["accion"], "ruta": p["ruta"],
        "objetivo_bsc": p["objetivo_bsc"], "objetivos_documento": p["objetivos_documento"],
        "responsable": p["responsable"], "inicio_anio": ent(p["inicio_anio"]), "inicio_semestre": ent(p["inicio_semestre"]),
        "fin_anio": ent(p["fin_anio"]), "fin_semestre": ent(p["fin_semestre"]), "estado": p["estado"],
        "avance": num(p["avance_pct"]), "tipo_dato_avance": p["tipo_dato_avance"],
    } for p in filas("Plan")]

    avance = [{"anio": ent(a["anio"]), "meta_acumulada": num(a["meta_acumulada"]),
               "avance_simulado": num(a["avance_simulado"]), "tipo_dato": a["tipo_dato"]} for a in filas("Avance_Plan")]

    riesgos = [{
        "riesgo_id": r["id_riesgo"], "riesgo": r["riesgo"], "origen": r["origen"], "objetivo_bsc": r["objetivo_bsc"],
        "probabilidad": ent(r["prob_num"]), "impacto": ent(r["impacto_num"]), "severidad": ent(r["severidad"]),
        "nivel": r["nivel"], "mitigacion": r["mitigacion"], "acciones_relacionadas": r["acciones_relacionadas"],
        "estado": r["estado_valoracion"],
    } for r in filas("Riesgos")]

    chequeos = {
        "15 indicadores": len(indicadores) == 15,
        "4 perspectivas": len({i["perspectiva"] for i in indicadores}) == 4,
        "22 acciones del plan (20 + 2 del BSC)": len(plan) == 22,
        "6 acciones en ejecución": sum(p["estado"] == "En ejecución" for p in plan) == 6,
        "11 riesgos R1 a R11": [r["riesgo_id"] for r in riesgos] == [f"R{n}" for n in range(1, 12)],
        "severidad = probabilidad × impacto": all(r["severidad"] == r["probabilidad"] * r["impacto"] for r in riesgos),
        "avance del plan 2026 a 2030": [a["anio"] for a in avance] == [2026, 2027, 2028, 2029, 2030],
        "todas las metas apuntan a un indicador": {m["indicador_id"] for m in metas} <= {i["indicador_id"] for i in indicadores},
    }
    for nombre, ok in chequeos.items():
        print(("OK   " if ok else "FALLA") + " " + nombre)
    if not all(chequeos.values()):
        sys.exit("No se generó el JSON: revisa la BD del BSC.")

    SALIDA.write_text(json.dumps({"fuente": FUENTE.name, "indicadores": indicadores, "metas": metas, "plan": plan,
                                  "avance_plan": avance, "riesgos": riesgos}, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"Escrito {SALIDA.relative_to(RAIZ)}: {len(indicadores)} indicadores, {len(metas)} metas, "
          f"{len(plan)} acciones, {len(riesgos)} riesgos")


if __name__ == "__main__":
    main()
