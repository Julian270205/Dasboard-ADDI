#!/usr/bin/env python3
"""Extrae los tres diagnósticos COBIT de Addi (Excel) a diagnosticos.json.

Uso: python3 extraer_diagnosticos.py <carpeta con los Excel> [salida.json]
Los Excel quedan como evidencia; desde aquí todo el flujo lee el JSON y la BD.
"""
import io, json, re, sys, zipfile
from pathlib import Path
import openpyxl

# Equivalencia: código en el Diagnóstico de Control -> código oficial COBIT 2019
EQUIV_CONTROL = {"APO09": "APO10", "APO10": "APO11", "APO11": "APO12", "APO12": "APO13",
                 "MEA02": "MEA03", "MEA03": "MEA02"}

def abrir(ruta):
    data = Path(ruta).read_bytes()
    if str(ruta).endswith(".xltx"):  # plantilla -> libro, para que openpyxl la acepte
        zin = zipfile.ZipFile(io.BytesIO(data)); out = io.BytesIO(); zout = zipfile.ZipFile(out, "w")
        for it in zin.infolist():
            b = zin.read(it.filename)
            if it.filename == "[Content_Types].xml":
                b = b.replace(b"spreadsheetml.template.main+xml", b"spreadsheetml.sheet.main+xml")
            zout.writestr(it, b)
        zout.close(); data = out.getvalue()
    return openpyxl.load_workbook(io.BytesIO(data), data_only=False)

def etiqueta(txt):
    m = re.search(r"\[(V|I|NV)\]", txt or "")
    return m.group(1) if m else None

def main(carpeta, salida):
    carpeta = Path(carpeta)
    # 1. Awareness (40 objetivos, códigos oficiales)
    ws = abrir(next(carpeta.glob("COBIT_2019_Management_Awareness*"))).worksheets[0]
    awareness = []
    for r in ws.iter_rows(min_row=4, values_only=True):
        c = r[2]
        if not (isinstance(c, str) and re.match(r"(EDM|APO|BAI|DSS|MEA)\d\d", c)): continue
        cod, nombre = c[:5], c[5:].strip()
        quien = "TI" if r[3] else "Otra área" if r[4] else "Tercero" if r[5] else "No se sabe"
        awareness.append(dict(objetivo=cod, nombre_en=nombre, importancia=int(r[0]), desempeno=int(r[1]),
                              quien=quien, auditado=(r[7] == "Yes"), formal=(r[8] == "Yes"),
                              responsable=(r[9] or "").strip(), etiqueta=etiqueta(r[10]), justificacion=(r[10] or "").strip()))
    # 2. Control (37 procesos, códigos de la plantilla docente)
    ws = abrir(next(carpeta.glob("Diagnostico_Control_TI*"))).worksheets[0]
    control = []
    for r in ws.iter_rows(min_row=11, values_only=True):
        if not (isinstance(r[0], str) and re.match(r"(EDM|APO|BAI|DSS|MEA)\d\d$", r[0])): continue
        control.append(dict(codigo_control=r[0], objetivo=EQUIV_CONTROL.get(r[0], r[0]), nombre_control=r[1],
                            nivel=int(r[2]), etiqueta=etiqueta(r[3]), observacion=(r[3] or "").strip()))
    # 3. Autoevaluación (31 preguntas)
    ws = abrir(next(carpeta.glob("Addi_IT_Governance_Self-Assessment*")))["Assessment"]
    auto, seccion, n = [], None, 0
    for r in ws.iter_rows(min_row=6, values_only=True):
        b, d, e = r[1], r[3], r[4]
        if isinstance(b, str) and re.match(r"\d\. [A-Z ]+$", b.strip()):
            seccion, n = int(b[0]), 0; nombre_sec = b[3:].strip().title(); continue
        if d in ("Yes", "Partial", "No"):
            n += 1
            auto.append(dict(seccion=seccion, seccion_nombre=nombre_sec, n=n, pregunta=b.strip(), respuesta=d,
                             puntos={"Yes": 2, "Partial": 1, "No": 0}[d], etiqueta=etiqueta(e), comentario=(e or "").strip()))
    json.dump(dict(awareness=awareness, control=control, autoevaluacion=auto), open(salida, "w"), ensure_ascii=False, indent=1)
    print(f"awareness={len(awareness)} control={len(control)} autoevaluacion={len(auto)} "
          f"promedio_control={sum(c['nivel'] for c in control)/len(control):.2f} puntos_auto={sum(a['puntos'] for a in auto)}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).with_name("diagnosticos.json")))
