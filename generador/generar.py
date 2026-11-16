#!/usr/bin/env python3
"""Generador replicable de datos del dashboard de TI de Addi (pasos 5 a 7 del proceso).

Misma semilla + mismos parámetros + misma versión del script = mismos datos.
Uso:  python3 generar.py            -> escribe ../db/02_datos_base.sql y ../db/03_mediciones.sql
Los datos simulados NO son datos de Addi: demuestran la lógica del tablero.
"""
import hashlib, json, math, sys
from datetime import date
from pathlib import Path
import numpy as np
import catalogo as C

AQUI = Path(__file__).parent
P = json.loads((AQUI / "parametros.json").read_text())
D = json.loads((AQUI / "diagnosticos.json").read_text())
PI = P["indicadores"]
VERSION, MAESTRA = P["version"], P["semilla_maestra"]

# ---------------------------------------------------------------- tiempo
def ym(s):
    y, m = map(int, s.split("-")); return date(y, m, 1)
def sig(d):
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)
def meses_entre(a, b):
    return (b.year - a.year) * 12 + b.month - a.month
MESES, _d = [], ym(P["inicio_historia"])
while _d <= ym(P["fin_horizonte"]):
    MESES.append(_d); _d = sig(_d)
CORTE_OP, CORTE_PLAN = ym(P["corte_operativo"]), ym(P["corte_plan"])

# ---------------------------------------------------------------- semillas y ruido
def semilla(ind, periodo, extra=""):
    """Semilla derivada de (maestra, indicador, mes): agregar un indicador no cambia los demás."""
    clave = f"{MAESTRA}|{ind}|{periodo:%Y-%m}|{extra}".encode()
    return int.from_bytes(hashlib.sha256(clave).digest()[:6], "big")
def z(ind, periodo, extra=""):
    return float(np.random.default_rng(semilla(ind, periodo, extra)).standard_normal())

# ---------------------------------------------------------------- impulsores
def construir_volumen():
    g, est = P["volumen"]["crecimiento_mensual"], P["volumen"]["estacional"]
    tend, v = {}, 1.0
    for m in MESES:
        if m != MESES[0]: v *= 1 + g[str(m.year)]
        tend[m] = v
    crudo = {m: tend[m] * est.get(str(m.month), 1.0) for m in MESES}
    norm = np.mean([crudo[m] for m in MESES if m.year == 2026])       # promedio de 2026 = 1
    return {m: crudo[m] / norm for m in MESES}, {m: tend[m] / norm for m in MESES}
V, VT = construir_volumen()
CARGA = {m: V[m] / VT[m] for m in MESES}                               # exceso estacional
E = {m: P["equipo"]["plantilla_nov_2026"] * (VT[m] / VT[date(2026, 11, 1)]) ** P["equipo"]["elasticidad"] for m in MESES}
campana = lambda m: m.month in P["calendario"]["campana"]
cierre = lambda m: m.month in P["calendario"]["cierres_sfc"]

NIVEL = {c["objetivo"]: c["nivel"] for c in D["control"]}
def M(*procesos):
    """Factor de madurez M = 1,6 − 0,3 × nivel promedio de los procesos."""
    return P["madurez"]["a"] - P["madurez"]["b"] * float(np.mean([NIVEL[p] for p in procesos]))
M_SEG, M_OP, M_CONT, M_CAMB = M("APO13", "DSS05"), M("DSS01", "DSS03", "BAI06"), M("DSS04"), M("BAI06")

# Plan real del BSC: las acciones sin fechas (N-01, N-03) no mueven ningún indicador hasta que el equipo las fije.
ACC = {a[0]: dict(inicio=ym(a[6]), fin=ym(a[7]), peso=a[9]) for a in C.INICIATIVAS if a[6] and a[7]}
def activa(cod, m):
    return cod in ACC and ACC[cod]["inicio"] <= m <= ACC[cod]["fin"]
def meses_activa(cod, m):
    """Meses transcurridos de la acción hasta m (0 antes de empezar o sin fechas; se congela al terminar)."""
    a = ACC.get(cod)
    if a is None or m < a["inicio"]: return 0
    return meses_entre(a["inicio"], min(m, a["fin"])) + 1
def curva_s(cod, m):
    """Avance planeado en curva S (logística normalizada) entre inicio y fin."""
    a = ACC[cod]; dur = meses_entre(a["inicio"], a["fin"]) + 1
    x = min(max(meses_activa(cod, m) / dur, 0), 1)
    f = lambda t: 1 / (1 + math.exp(-8 * (t - 0.5)))
    return (f(x) - f(0)) / (f(1) - f(0))
def hitos(m, puntos):
    """Interpolación lineal entre hitos [(fecha, valor), ...]."""
    if m <= puntos[0][0]: return puntos[0][1]
    for (a, va), (b, vb) in zip(puntos, puntos[1:]):
        if m <= b: return va + (vb - va) * meses_entre(a, m) / meses_entre(a, b)
    return puntos[-1][1]
clamp = lambda x, a, b: max(a, min(b, x))

# ---------------------------------------------------------------- series
S = {}            # indicador -> {mes: valor}
ETQ = {}          # (indicador, mes) -> etiqueta distinta a la de su clase
SEG = []          # plan_seguimiento

def generar():
    S.clear(); ETQ.clear(); SEG.clear()
    def serie(ind, f):
        S[ind] = {m: f(m) for m in MESES}
    p = PI
    # --- D. Datos
    trimestres = lambda m: meses_activa("S-04", m) // 3
    for k, base in zip("abcd", (3, 2, 3, 2)):
        serie("19" + k, lambda m, base=base: min(4.0, round(base + 0.1 * trimestres(m), 1)))
    serie("19", lambda m: round(np.mean([S["19" + k][m] for k in "abcd"]), 2))
    q = p["PI2.2"]
    serie("PI2.2", lambda m: q["base"] if meses_activa("S-04", m) == 0 else
          clamp(q["base"] + q["ritmo"] * meses_activa("S-04", m) + q["sigma"] * z("PI2.2", m), 0, q["techo"]))
    serie("21", lambda m: clamp(p["21"]["base"] + p["21"]["coef_pi22"] * S["PI2.2"][m] + p["21"]["sigma"] * z("21", m), 0, 100))
    serie("22", lambda m: clamp(p["22"]["base"] - (p["22"]["caida_cierre"] if cierre(m) else 0) + p["22"]["sigma"] * z("22", m), 0, 100))
    # --- E. Seguridad
    q = p["23"]; previo = [0.0]
    def cifrado(m):
        v = q["base"] if meses_activa("S-03", m) == 0 else clamp(q["base"] + q["ritmo"] * meses_activa("S-03", m) + q["sigma"] * z("23", m), 0, q["techo"])
        previo[0] = max(previo[0], v); return previo[0]                # nunca decrece
    serie("23", cifrado)
    serie("24a", lambda m: round(p["24a"]["base"] * V[m] ** p["24a"]["e"] * (1 + p["24a"]["sigma"] * z("24a", m))))
    serie("24b", lambda m: 100 - p["24b"]["caida_mensual"] * (m.month % 3))
    serie("25a", lambda m: round(p["25a"]["base"] * V[m]))
    serie("25b", lambda m: clamp(p["25b"]["base"] - (p["25b"]["caida_campana"] if campana(m) else 0) + p["25b"]["sigma"] * z("25b", m), 0, 100))
    serie("26", lambda m: round(p["26"]["base"] * V[m] ** p["26"]["e"] * (1 + p["26"]["sigma"] * z("26", m))))
    serie("F1.3", lambda m: 0.0 if P["escenarios_estres"]["multa_sic"] and m == date(2027, 8, 1) else 100.0)
    INCIDENTE = date(2026, 3, 1)                                         # incidente real del 25-mar-2026
    serie("27a", lambda m: max(1 if m == INCIDENTE else 0, round(p["27a"]["base"] * V[m] ** p["27a"]["e"] * M_SEG * (1 + p["27a"]["sigma"] * z("27a", m)))))
    serie("27b", lambda m: p["27b"]["base_h"] * M_SEG * (1 + p["27b"]["sigma"] * z("27b", m)))
    serie("F1.2", lambda m: 1 if 0 <= meses_entre(INCIDENTE, m) < 12 else 0)
    iso, pci = ym("2028-07"), ACC["S-03"]["fin"]
    serie("PI1.1", lambda m: (m >= iso) + (m >= pci))
    # --- F. IA
    serie("32", lambda m: p["32"]["base"] * (p["32"]["factor_campana"] if campana(m) else 1) * (1 + p["32"]["sigma"] * z("32", m)))
    estado = {"auc": p["31"]["base"], "reentrenar": False}
    def auc(m):
        if estado["reentrenar"]: estado["auc"], estado["reentrenar"] = p["31"]["base"], False
        elif S["32"][m] > 0.10: estado["auc"] -= p["31"]["degradacion"]
        if S["32"][m] > 0.25: estado["reentrenar"] = True
        return clamp(estado["auc"] + p["31"]["sigma"] * z("31", m), 0.5, 1)
    S["32"] = {m: S["32"][m] for m in MESES}; serie("31", auc)
    serie("33", lambda m: max(0, p["33"]["base"] + (p["33"]["extra_psi"] if S["32"][m] > 0.10 else 0) + p["33"]["sigma"] * z("33", m)))
    serie("34", lambda m: clamp(p["34"]["base"] - (p["34"]["caida_psi"] if S["32"][m] > 0.25 else 0) + p["34"]["sigma"] * z("34", m), 0, 1))
    q = p["35"]
    serie("35", lambda m: clamp(q["base"] + q["ritmo"] * meses_activa("S-06", m) + q["sigma"] * z("35", m), 0, q["techo"]))
    estres_ia = lambda m: 3 if P["escenarios_estres"]["chatbot_manipulado"] and m == date(2027, 5, 1) else 0
    serie("36", lambda m: round(p["36"]["base"] * V[m] * (1 + p["36"]["sigma"] * z("36", m))) + estres_ia(m))
    fin_s06 = ACC["S-06"]["fin"]
    for k, base, sube in (("a", 2, 1), ("b", 2, 0), ("c", 3, 0), ("d", 2, 1)):
        serie("38" + k, lambda m, base=base, sube=sube: base + (sube if m > fin_s06 else 0))
    serie("38", lambda m: round(np.mean([S["38" + k][m] for k in "abcd"]), 2))
    serie("PI2.1", lambda m: clamp(hitos(m, [(ym("2026-12"), 0), (ym("2027-12"), 20), (ym("2028-12"), 80), (ym("2029-12"), 100)])
                                   + (2 * z("PI2.1", m) if ym("2027-01") <= m < ym("2029-12") else 0), 0, 100))
    # --- I. Operación
    fest = P["calendario"]["factor_festivo_despliegues"]
    q = p["50"]
    serie("50", lambda m: round(q["base"] * E[m] / 100 * fest.get(str(m.month), 1) * (1 + q["sigma"] * z("50", m))))
    dep_rel = lambda m: S["50"][m] / (p["50"]["base"] * E[m] / 100 * fest.get(str(m.month), 1))
    q47 = p["47"]; minutos, sev = {}, {}
    for m in MESES:
        n = round(q47["base_incidentes"] * V[m] ** q47["e"] * dep_rel(m) ** q47["e_despliegues"] * M_OP)
        dur = [q47["duracion_min"] * M_CONT * (1 + q47["sigma"] * z("47", m, i)) for i in range(n)]
        minutos[m] = sum(dur)
        sev[m] = (n, sum(d > 60 for d in dur), sum(20 <= d <= 60 for d in dur), sum(d < 20 for d in dur))
    dias = lambda m: (sig(m) - m).days
    serie("47", lambda m: 100 * (1 - minutos[m] / (dias(m) * 1440)))
    for i, k in enumerate(("48", "48p1", "48p2", "48p3")):
        serie(k, lambda m, i=i: sev[m][i])
    base_min = np.mean([minutos[m] for m in MESES if m.year == 2026])
    serie("C1.1", lambda m: 100 * minutos[m] / base_min)
    q = p["PI3.1"]
    parte = lambda m: q["parte_con_plan"] if m >= ACC["S-08"]["inicio"] else q["parte"]
    serie("PI3.1", lambda m: 100 * parte(m) * minutos[m] / (q["parte"] * base_min))
    q = p["49"]; ultima = [q["base_h"] * M_CONT]
    def prueba(m):
        if m.month in q["meses"]: ultima[0] = q["base_h"] * M_CONT * (1 + q["sigma"] * z("49", m))
        return ultima[0]
    serie("49", prueba)
    q = p["51"]
    serie("51", lambda m: max(0, q["base"] * M_CAMB * (1 + q["sens_exceso"] * max(0, dep_rel(m) - 1)) + q["sigma"] * z("51", m)))
    q = p["52"]
    serie("52", lambda m: q["base_dias"] * M_CAMB * (1 + max(0, CARGA[m] - 1)) * (1 + q["sigma"] * z("52", m)))
    q = p["53"]
    crudo = lambda m, v: q["fijo"] + q["variable"] * v
    norm = np.mean([crudo(m, V[m]) * (1 + q["extra_campana"] * campana(m)) for m in MESES if m.year == 2026])
    serie("53r", lambda m: 100 * crudo(m, V[m]) * (1 + q["extra_campana"] * campana(m)) * (1 + q["sigma"] * z("53", m)) / norm)
    plan_anual = {y: np.mean([100 * crudo(m, V[m]) / norm for m in MESES if m.year == y]) for y in {m.year for m in MESES}}
    serie("53p", lambda m: plan_anual[m.year])
    serie("53", lambda m: 100 * (S["53r"][m] / S["53p"][m] - 1))
    norm54 = np.mean([S["53r"][m] / V[m] for m in MESES if m.year == 2026])
    serie("54", lambda m: 100 * S["53r"][m] / V[m] / norm54)
    serie("55a", lambda m: clamp(p["55a"]["base"] + (p["55a"]["extra_campana"] if campana(m) else 0) + p["55a"]["sigma"] * z("55a", m), 0, 100))
    serie("55b", lambda m: clamp(p["55b"]["base"] + p["55b"]["sigma"] * z("55b", m), 0, 100))
    serie("56p", lambda m: round(E[m]))
    rot = P["equipo"]["rotacion_mensual"]
    def vacantes(m):
        i = MESES.index(m); ant = MESES[max(i - 1, 0)]; ant2 = MESES[max(i - 2, 0)]
        return max(0, round(rot * (E[m] + E[ant]) + (E[m] - E[ant2])))
    serie("AC1.2", vacantes)
    for m in (date(2026, 10, 1), date(2026, 11, 1)):                    # hecho real: 3 vacantes al 27-oct-2026
        S["AC1.2"][m] = 3; ETQ[("AC1.2", m)] = "Real"
    q = p["57"]
    serie("57", lambda m: clamp(q["base"] + q["sigma"] * z("57", m), 0, q["techo"]))   # plano: el plan real no tiene acción de capacitación
    # --- J. BSC sin equivalente
    m06 = ACC["M-06"]
    serie("C2.1", lambda m: min(4, meses_activa("M-06", m) // 3) if m >= m06["inicio"] else 0)
    q = p["C3.1"]; o_ini, o_fin = ACC["O-01"]["inicio"], ACC["O-03"]["fin"]
    serie("C3.1", lambda m: 100.0 if m < o_ini else hitos(m, [(o_ini, 100), (o_fin, q["meta_final"])]) * CARGA[m] ** q["e"] * (1 + q["sigma"] * z("C3.1", m)))
    q = p["PI1.2"]
    def hallazgos(m):
        k = sum(1 for x in MESES if x <= m and (activa("S-02", x) or activa("S-03", x)))
        return clamp(q["base"] + q["ritmo"] * k + (q["sigma"] * z("PI1.2", m) if k else 0), 0, 100)
    serie("PI1.2", hallazgos)
    serie("PI3.2", lambda m: clamp(hitos(m, [(ym("2026-12"), 0), (ym("2027-12"), 20), (ym("2028-12"), 80), (ym("2029-12"), 100)])
                                   + (2 * z("PI3.2", m) if ym("2027-01") <= m < ym("2029-12") else 0), 0, 100))
    q = p["AC1.1"]
    serie("AC1.1", lambda m: q["base"] if meses_activa("N-01", m) == 0 else clamp(q["base"] + q["ritmo"] * meses_activa("N-01", m) + q["sigma"] * z("AC1.1", m), 0, 100))
    q = p["AC2.1"]; sims = [m for m in MESES if m.year >= 2027 and m.month in q["meses"]]; act = [q["base"]]
    def phishing(m):
        if m in sims:
            falta = len(sims) - sims.index(m)
            act[0] = clamp(act[0] + (q["meta_final"] - act[0]) / falta + q["sigma"] * z("AC2.1", m), 0, 100)
        return act[0]
    serie("AC2.1", phishing)
    q = p["AC3.2"]; enc = [q["base"]]
    def encuesta(m):
        if activa("N-03", m) and m.month in q["meses"]:
            enc[0] = clamp(enc[0] + q["paso"] + q["sigma"] * z("AC3.2", m), 1, q["techo"])
        return enc[0]
    serie("AC3.2", encuesta)
    # --- G. Plan de acción (reloj del plan, desde 2027)
    guion = p["39"]["desvio_guionado"]; s39, s40 = {}, {}
    for m in [x for x in MESES if x.year >= 2027]:
        plan = real = av = 0.0
        for cod, a in ACC.items():
            if m < a["inicio"]: continue
            gp = 100 * curva_s(cod, m)
            gr = gp * (1 + guion.get(cod, 0) + p["39"]["sigma"] * z("39", m, cod))
            avn = clamp(gp * (1 + p["40"]["sigma"] * z("40", m, cod)), 0, 100) if m < a["fin"] else 100.0
            SEG.append((cod, m, round(avn, 2), round(gp, 2), round(gr, 2)))
            plan += a["peso"] * gp; real += a["peso"] * gr; av += a["peso"] * avn
        s39[m] = 100 * (real / plan - 1); s40[m] = av / real
    S["39"], S["40"] = s39, s40
    # Etiquetas de hechos anclados: reales hasta el corte operativo
    for ind in ("PI1.1", "C2.1", "F1.2"):
        for m in MESES:
            if m <= CORTE_OP: ETQ[(ind, m)] = "Real"
    for m in MESES:
        if m <= ym("2027-05"): ETQ[("AC2.1", m)] = "Estimado"
        if m <= ym("2027-05"): ETQ[("AC3.2", m)] = "Estimado"

IND = {i["id"]: i for i in C.INDICADORES}
ETQ_CLASE = {1: "Estimado", 2: "Simulado", 3: "Simulado"}   # clase 2: solo el hecho anclado es Real (ver ETQ)

def filas():
    out = []
    for ind, serie in S.items():
        for m, v in serie.items():
            out.append((ind, m, round(float(v), 4), IND[ind]["clase"], ETQ.get((ind, m), ETQ_CLASE[IND[ind]["clase"]]),
                        "motor_negocio_v1", VERSION, semilla(ind, m)))
    return sorted(out, key=lambda f: (f[0], f[1]))

def huella(fs):
    txt = "\n".join(f"{f[0]}|{f[1]:%Y-%m}|{f[2]:.4f}|{f[4]}" for f in fs)
    return hashlib.sha256(txt.encode()).hexdigest()

# ---------------------------------------------------------------- validación (paso 6)
def validar(fs):
    fallas = []
    por = {}
    for f in fs: por.setdefault(f[0], {})[f[1]] = f[2]
    for ind, serie in por.items():
        lo, hi = IND[ind]["validos"]
        esperados = [m for m in MESES if m.year >= 2027] if ind in ("39", "40") else MESES
        if set(esperados) - set(serie): fallas.append(f"{ind}: huecos mensuales")
        for m, v in serie.items():
            if (lo is not None and v < lo - 1e-9) or (hi is not None and v > hi + 1e-9):
                fallas.append(f"{ind} {m:%Y-%m}: {v} fuera de [{lo}, {hi}]"); break
    for m in MESES:
        if por["48"][m] != por["48p1"][m] + por["48p2"][m] + por["48p3"][m]: fallas.append(f"48 {m}: gravedades no suman")
    if any(a > b + 1e-9 for a, b in zip(list(por["23"].values()), list(por["23"].values())[1:])): fallas.append("23: decrece")
    if any(a > b for a, b in zip(list(por["C2.1"].values()), list(por["C2.1"].values())[1:])): fallas.append("C2.1: decrece")
    if por["PI1.1"][CORTE_OP] != 0: fallas.append("PI1.1: afirma certificaciones antes de S-03")
    if abs(np.mean([v for m, v in por["53r"].items() if m.year == 2026]) - 100) > 3: fallas.append("53r: el promedio de 2026 se aleja de 100")
    if por["AC1.2"][date(2026, 10, 1)] != 3: fallas.append("AC1.2: no respeta el ancla real")
    return fallas

# ---------------------------------------------------------------- SQL
def q(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, date): return f"'{v:%Y-%m-%d}'"
    return "'" + str(v).replace("'", "''") + "'"
def insert(tabla, cols, rows, lote=400):
    out = []
    for i in range(0, len(rows), lote):
        vals = ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in rows[i:i + lote])
        out.append(f"INSERT INTO {tabla} ({', '.join(cols)}) VALUES\n{vals};")
    return "\n".join(out) + "\n"

def sql_base():
    o = ["-- 02_datos_base.sql · generado por generador/generar.py · NO editar a mano\nSET search_path TO addi;\n"]
    o.append(insert("config_global", ["clave", "valor", "version", "descripcion"], [
        ("empresa", "Addi", VERSION, "Nombre en el encabezado"), ("periodo_plan", "BSC de TI 2027–2030", VERSION, "Periodo del plan"),
        ("corte_operativo", f"{CORTE_OP:%Y-%m-%d}", VERSION, "Reloj operativo (S1): indicadores D a F e I"),
        ("corte_plan", f"{CORTE_PLAN:%Y-%m-%d}", VERSION, "Reloj del plan (S1): sección G, BSC ligado a hitos y riesgos residuales"),
        ("corte_inicial_operativo", f"{CORTE_OP:%Y-%m-%d}", VERSION, "Para volver al corte inicial en la presentación"),
        ("corte_inicial_plan", f"{CORTE_PLAN:%Y-%m-%d}", VERSION, "Para volver al corte inicial en la presentación"),
        ("fin_horizonte", f"{MESES[-1]:%Y-%m-%d}", VERSION, "El reloj se detiene aquí"),
        ("semilla_maestra", str(MAESTRA), VERSION, "Semilla maestra del generador"), ("version_parametros", VERSION, VERSION, "Versión vigente de parámetros"),
        ("unidad_indices", "Índice base 2026 = 100", VERSION, "Costos y tiempos sin cifras absolutas"),
        ("documento_fuente", "Diagnósticos COBIT 2019 (13-nov-2026), BD del BSC (BD_Dashboard_TI_Addi.xlsx) y catálogo de generación", VERSION, "Elemento 2 del encabezado"),
        ("dias_vigencia", "45", VERSION, "Elemento 3: días tras los cuales el dato se marca desactualizado"),
        ("pausado", "no", VERSION, "El equipo puede pausar el reloj simulado")]))
    o.append(insert("supuestos", ["id", "supuesto", "valor"], C.SUPUESTOS))
    ev = [(date(2026, 3, 25), "Incidente de seguridad", "incidente real", 1, "Hecho público verificado por el equipo (BSC)")]
    for y in range(2023, 2031):
        ev.append((date(y, 11, 1 + (3 - date(y, 11, 1).weekday()) % 7 + 22), "Black Friday (por confirmar)", "campaña", 1.4, "Calendario"))
        for mm, dd in ((3, 31), (6, 30), (9, 30), (12, 31)): ev.append((date(y, mm, dd), "Cierre trimestral de reporte a la SFC", "cierre SFC", 1, "Calendario regulatorio"))
        ev.append((date(y, 12, 25), "Semana festiva de fin de año", "festivo", 0.75, "Calendario"))
    o.append(insert("calendario_eventos", ["fecha", "evento", "tipo", "factor_carga", "fuente"], [e for e in ev if MESES[0] <= e[0]]))
    inv = {c["objetivo"]: c["codigo_control"] for c in D["control"]}
    o.append(insert("objetivos_cobit", ["codigo", "codigo_control", "nombre", "dominio"], [(c, inv.get(c), n, c[:3]) for c, n in C.NOMBRES_COBIT.items()]))
    aw = {a["objetivo"]: a for a in D["awareness"]}
    o.append(insert("diagnostico_awareness", ["objetivo", "importancia", "desempeno", "quien", "auditado", "formal", "responsable", "etiqueta_evidencia", "justificacion"],
                    [(a["objetivo"], a["importancia"], a["desempeno"], a["quien"], a["auditado"], a["formal"], a["responsable"], a["etiqueta"], a["justificacion"]) for a in D["awareness"]]))
    o.append(insert("procesos_madurez", ["objetivo", "version", "nivel", "etiqueta_evidencia", "etiqueta_dato", "fecha", "aprobador", "evidencia"],
                    [(c["objetivo"], 1, c["nivel"], c["etiqueta"], "Estimado", date(2026, 11, 13), "Carga única · Diagnóstico de Control v4", c["observacion"]) for c in D["control"]]))
    def objetivo_nivel(cod):
        base = 3 if aw[cod]["importancia"] >= 4 else 2
        return max(base, NIVEL.get(cod, 0))
    o.append(insert("metas_madurez", ["objetivo", "nivel_objetivo", "criterio"],
                    [(c, objetivo_nivel(c), f"S5 (por aprobar): importancia {aw[c]['importancia']}") for c in C.NOMBRES_COBIT]))
    o.append(insert("responsables", ["dominio", "cubre", "nombre", "correo", "suplente"], C.RESPONSABLES))
    o.append(insert("autoevaluacion", ["seccion", "seccion_nombre", "n", "pregunta", "respuesta", "puntos", "etiqueta_evidencia", "comentario"],
                    [(a["seccion"], a["seccion_nombre"], a["n"], a["pregunta"], a["respuesta"], a["puntos"], a["etiqueta"], a["comentario"]) for a in D["autoevaluacion"]]))
    o.append(insert("diagnostico_bsc", ["elemento", "elemento_nombre", "item", "enunciado", "valor"],
                    [(e, n, i + 1, t, v) for (e, n), items in C.DIAG_BSC.items() for i, (t, v) in enumerate(items)]))
    o.append(insert("objetivos_bsc", ["codigo", "perspectiva", "nombre", "contribuye_a"], C.OBJETIVOS_BSC))
    o.append(insert("indicadores", ["indicador_id", "elemento", "seccion", "pestana", "objetivo_bsc", "nombre", "unidad", "sentido", "tipo", "reloj", "clase", "ancla",
                                    "formula", "sigma", "rango_min", "rango_max", "umbral_rojo", "responsable", "fuente", "que_mide", "impacto", "decision", "principal"],
                    [(i["id"], i["elemento"], i["seccion"], i["pestana"], i["objetivo_bsc"], i["nombre"], i["unidad"], i["sentido"], i["tipo"], i["reloj"], i["clase"], i["ancla"],
                      i["formula"], i["sigma"], i["rango"][0], i["rango"][1], i["rojo"], i["responsable"], i["fuente"], i["que_mide"], i["impacto"], i["decision"], i["principal"])
                     for i in C.INDICADORES]))
    metas = []
    for i in C.INDICADORES:
        if not i["principal"]: continue
        if isinstance(i["metas"], dict):
            for y, v in i["metas"].items():
                if (i["id"], y) in C.METAS_BSC:                    # S2: mandan las metas reales de la BD del BSC
                    v, origen = C.METAS_BSC[(i["id"], y)]
                    metas.append((i["id"], y, v, f"BD del BSC · {origen}"))
                else:
                    metas.append((i["id"], y, v, "Línea base" if y == 2026 else "Hito del documento"))
            metas += [(i["id"], y, v, f"BD del BSC · {o}") for (ind, y), (v, o) in C.METAS_BSC.items()
                      if ind == i["id"] and y not in i["metas"]]
        else:
            metas += [(i["id"], y, *((C.METAS_BSC[(i["id"], y)][0], "BD del BSC · " + C.METAS_BSC[(i["id"], y)][1])
                                     if (i["id"], y) in C.METAS_BSC else (i["metas"], "Catálogo de generación")))
                      for y in range(2027, 2031)]
    o.append(insert("metas", ["indicador_id", "anio", "meta", "origen"], metas))
    fecha = lambda s: ym(s) if s else None
    o.append(insert("iniciativas_plan", ["codigo", "accion", "ruta", "objetivo_bsc", "objetivo_cobit", "responsable", "inicio", "fin", "indicador_objetivo", "peso_presupuesto", "origen", "estado_bsc"],
                    [(a[0], a[1], a[2], a[3], a[4], a[5], fecha(a[6]), fecha(a[7]), a[8], a[9], a[10], a[11]) for a in C.INICIATIVAS]))
    o.append(insert("riesgos", ["riesgo_id", "riesgo", "categoria", "objetivo_bsc", "probabilidad", "impacto", "proceso_cobit", "dueno", "indicador_senal", "mitigacion", "acciones", "estado", "origen"],
                    C.RIESGOS))
    o.append(insert("apetito_riesgo", ["categoria", "apetito", "severidad_max"], C.APETITO))
    o.append(insert("modelos_ia", ["modelo_id", "nombre", "riesgo", "dueno", "estado", "proxima_revision", "apagado_rapido", "usos_no_permitidos", "ancla"], C.MODELOS_IA))
    v = [(i["cobit"], i["id"], None, None) for i in C.INDICADORES if i["cobit"] and i["principal"]]
    v += [(a[4], None, a[0], None) for a in C.INICIATIVAS] + [("APO09", "PI3.2", None, None)]
    v += [(r[6], None, None, r[0]) for r in C.RIESGOS]
    o.append(insert("vinculos_objetivo", ["objetivo", "indicador_id", "accion", "riesgo_id"], v))
    o.append(insert("plan_seguimiento", ["codigo", "periodo", "avance", "gasto_plan", "gasto_real"], SEG))
    return "\n".join(o)

def main():
    generar(); a = filas(); h1 = huella(a)
    generar(); b = filas(); h2 = huella(b)                               # prueba de replicabilidad
    if h1 != h2: sys.exit("NO REPLICABLE: las dos generaciones difieren. Versión no aprobada.")
    fallas = validar(a)
    print(f"Indicadores: {len(S)} · filas: {len(a)} · meses: {len(MESES)} · M seg={M_SEG:.2f} op={M_OP:.2f} cont={M_CONT:.2f} camb={M_CAMB:.2f}")
    print("Validación:", "0 reglas críticas falladas" if not fallas else fallas)
    print("Huella SHA-256:", h1)
    if fallas: sys.exit(1)
    db = AQUI.parent / "db"
    (db / "02_datos_base.sql").write_text(sql_base())
    cab = (f"-- 03_mediciones.sql · generado por generador/generar.py · NO editar a mano\n-- version_parametros={VERSION} · semilla_maestra={MAESTRA} · huella={h1}\n"
           "SET search_path TO addi;\n")
    (db / "03_mediciones.sql").write_text(cab + insert("mediciones", ["indicador_id", "periodo", "valor", "clase", "etiqueta", "metodo_id", "version_parametros", "semilla"], a))
    (AQUI / "huella.txt").write_text(f"{VERSION} {MAESTRA} {h1}\n")

if __name__ == "__main__":
    main()
