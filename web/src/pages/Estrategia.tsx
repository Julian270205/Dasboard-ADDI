import { Fragment } from 'react'
import { Indicadores } from '../components/Indicadores'
import { Barra, COLOR_SEMAFORO, EtiquetaDato, Semaforo, Seccion, Tabla, Tarjeta } from '../components/ui'
import { mes, num, tendenciaTexto } from '../lib/formato'
import { PERSPECTIVAS, useTablero } from '../lib/tablero'
import type { Accion } from '../lib/tipos'
import { Indice, useAncla } from './comun'

const FASE: Record<Accion['fase'], string> = { 'No iniciada': '#c9d1dc', 'En curso': '#2a78d6', Terminada: '#1e7d4f', 'Sin fechas': '#c9d1dc' }

export default function Estrategia() {
  useAncla()
  return (
    <>
      <Indice enlaces={[['mapa', 'Mapa estratégico'], ['bsc', 'Indicadores del BSC'], ['diagnostico', 'Diagnóstico'], ['plan', 'Plan de acción'], ['riesgos', 'Riesgos'], ['supuestos', 'Supuestos']]} />
      <Mapa />
      <TablaBsc />
      <Diagnostico />
      <Plan />
      <Riesgos />
      <Supuestos />
    </>
  )
}

function Mapa() {
  const { D, IND, filtros, abrirIndicador } = useTablero()
  return (
    <Seccion id="mapa" titulo="Mapa estratégico del BSC de TI" descripcion="Cuatro perspectivas, diez objetivos y sus relaciones causa-efecto. Cada indicador abre su detalle.">
      <div className="flex flex-col gap-3">
        {PERSPECTIVAS.filter((p) => !filtros.perspectiva || p === filtros.perspectiva).map((p, k) => (
          <div key={p} className="grid grid-cols-1 gap-3 md:grid-cols-[170px_1fr]">
            <div className="flex items-center gap-3 rounded-xl border border-linea bg-papel px-4 py-3 text-[14px] font-semibold">
              <span className="cifra flex size-6 shrink-0 items-center justify-center rounded-full bg-acento-suave text-xs text-acento">{k + 1}</span>{p}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
              {D.objetivos_bsc.filter((o) => o.perspectiva === p).map((o) => {
                const inds = D.indicadores.filter((i) => i.objetivo_bsc === o.codigo)
                const acc = D.plan.filter((a) => a.objetivo_bsc === o.codigo)
                return (
                  <div key={o.codigo} className="flex flex-col gap-2 rounded-xl border border-linea bg-papel p-4">
                    <div className="flex items-baseline justify-between gap-2 text-xs text-tinta-2">
                      <span className="font-semibold text-tinta">{o.codigo}</span>
                      {o.contribuye_a && <span>contribuye a {o.contribuye_a.split(',').join(' y ')}</span>}
                    </div>
                    <p className="m-0 text-[13.5px] font-medium leading-snug">{o.nombre}</p>
                    <div className="flex flex-col">
                      {inds.map((i) => (
                        <button key={i.id} type="button" onClick={() => abrirIndicador(i.id)} className="flex min-h-8 items-center gap-2 rounded-md px-1 text-left text-[12.5px] hover:bg-lienzo">
                          <Semaforo s={IND[i.id].estado?.semaforo} corto /><span className="flex-1">{i.nombre}</span>
                          <span className="text-tinta-3">{i.tipo === 'Leading' ? 'inductor' : 'resultado'}</span>
                        </button>
                      ))}
                    </div>
                    {acc.length > 0 && <p className="m-0 mt-auto text-xs text-tinta-2">Acciones: {acc.map((a) => a.codigo).join(', ')}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Seccion>
  )
}

function TablaBsc() {
  const { D, pasaFiltros, abrirIndicador } = useTablero()
  const bsc = D.indicadores.filter((i) => i.objetivo_bsc && pasaFiltros(i))
  return (
    <Seccion id="bsc" titulo="Indicadores del BSC" descripcion="Valor frente a la meta a la fecha del corte. La meta a la fecha interpola entre la meta del año anterior y la del año en curso, para no comparar hoy contra la meta de 2030.">
      <Tarjeta>
        <Tabla columnas={['Código', 'Indicador', 'Valor', 'Meta a la fecha', 'Cumplimiento', 'Estado', 'Tendencia', 'Tipo', 'Dato']} minimo={980}>
          {bsc.map((i) => {
            const e = i.estado
            return (
              <tr key={i.id} onClick={() => abrirIndicador(i.id)} className="cursor-pointer hover:bg-lienzo">
                <td className="font-semibold">{i.id}</td><td>{i.nombre}</td>
                <td className="whitespace-nowrap"><b className="cifra">{num(e?.valor)}</b> <span className="text-xs text-tinta-2">{i.unidad}</span></td>
                <td className="cifra">{num(e?.meta)}</td>
                <td className="min-w-32">{e?.cumplimiento != null ? <div className="flex items-center gap-2"><div className="flex-1"><Barra valor={e.cumplimiento} max={100} /></div><span className="cifra w-10 text-right text-xs">{num(e.cumplimiento, 0)} %</span></div> : '—'}</td>
                <td><Semaforo s={e?.semaforo} /></td>
                <td className="whitespace-nowrap text-xs text-tinta-2">{tendenciaTexto[e?.tendencia ?? 'estable']}</td>
                <td className="text-xs text-tinta-2">{i.tipo === 'Leading' ? 'Inductor' : 'Resultado'}</td>
                <td><EtiquetaDato e={e?.etiqueta} /></td>
              </tr>
            )
          })}
        </Tabla>
      </Tarjeta>
    </Seccion>
  )
}

function Diagnostico() {
  const { D } = useTablero()
  const el = [1, 2, 3, 4].map((k) => {
    const it = D.diagnostico_bsc.filter((d) => d.elemento === k)
    return { n: it[0]?.elemento_nombre, t: it.reduce((a, x) => a + x.valor, 0), it }
  })
  const tot = el.reduce((a, e) => a + e.t, 0)
  return (
    <Seccion id="diagnostico" titulo="Diagnóstico situacional del BSC" descripcion="Los cuatro elementos de la gestión basada en scorecards: 40 enunciados calificados de 0 a 10 por el equipo Nexus como observador externo.">
      <Tarjeta etiqueta="Estimado">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-4">
            {el.map((e) => (
              <div key={e.n} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]"><b>{e.n}</b><span className="cifra font-semibold">{e.t} de 100</span></div>
                <Barra valor={e.t} max={100} />
                <span className="text-xs text-tinta-2">Lo más débil: {e.it.slice().sort((a, b) => a.valor - b.valor).slice(0, 2).map((x) => `${x.enunciado} (${x.valor})`).join('; ')}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="cifra text-[56px] font-semibold leading-none">{tot}<span className="text-lg font-normal text-tinta-2"> de 400</span></span>
            <p className="m-0 text-[14px] leading-relaxed">La estrategia está bien definida, pero todavía no opera como sistema de gestión: lo que se resuelve pensando está avanzado; lo que exige medir, asignar recursos y sostener rutinas aún no existe.</p>
            <p className="m-0 text-[13px] text-tinta-2">Coincide con los tres diagnósticos COBIT: la brecha no es de visión sino de institucionalización (medición, presupuesto, cascada y seguimiento).</p>
          </div>
        </div>
      </Tarjeta>
    </Seccion>
  )
}

function Plan() {
  const { D } = useTablero()
  const corte = D.config.corte_plan.slice(0, 7)
  const desde = 2026, meses = 60
  const pos = (s: string) => { const [y, m] = s.split('-').map(Number); return (((y - desde) * 12 + m - 1) / meses) * 100 }
  const rutas = [...new Set(D.plan.map((a) => a.ruta))]
  const fases = (['Terminada', 'En curso', 'No iniciada', 'Sin fechas'] as const).map((f) => [f, D.plan.filter((a) => a.fase === f).length] as const)
  return (
    <Seccion id="plan" titulo="Plan de acción" elementos="#39 a 42" descripcion={<>Las 22 acciones de la BD del BSC. Las fases se calculan con el corte del plan ({mes(corte, true)}); el avance y el gasto son simulados.</>}>
      <Indicadores ids={['39', '40']} />
      <Tarjeta titulo="Línea de tiempo por ruta" descripcion="Barra = duración de la acción; relleno = avance al corte; línea vertical = corte del plan" etiqueta="Simulado" elementos="#41, #42">
        <div className="flex flex-wrap gap-4 text-xs text-tinta-2">
          {fases.map(([f, n]) => <span key={f} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded" style={{ background: FASE[f], outline: f === 'Sin fechas' ? '1px dashed #7a8798' : undefined }} />{f}: <b className="cifra text-tinta">{n}</b></span>)}
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="min-w-[860px]">
            <div className="ml-[280px] grid grid-cols-5 text-[11px] text-tinta-2">{[2026, 2027, 2028, 2029, 2030].map((a) => <span key={a} className="border-l border-linea pl-1">{a}</span>)}</div>
            {rutas.map((r) => (
              <Fragment key={r}>
                <div className="mt-3 text-xs font-semibold text-tinta-2">{r}</div>
                {D.plan.filter((a) => a.ruta === r).map((a) => (
                  <div key={a.codigo} className="grid grid-cols-[280px_1fr] items-center gap-0 py-1 text-[12.5px]">
                    <span className="truncate pr-3" title={`${a.accion} · ${a.responsable}`}><b>{a.codigo}</b> {a.accion}</span>
                    <div className="relative h-5 rounded bg-[repeating-linear-gradient(90deg,#f2f4f7_0,#f2f4f7_1px,transparent_1px,transparent_20%)]">
                      {a.inicio && a.fin ? (
                        <div title={`${a.fase}, avance ${num(a.avance, 0)} %, de ${mes(a.inicio)} a ${mes(a.fin)}`} className="absolute top-1 h-3 overflow-hidden rounded-full bg-linea"
                          style={{ left: `${pos(a.inicio)}%`, width: `${pos(a.fin) - pos(a.inicio) + 100 / meses}%` }}>
                          <div className="h-3" style={{ width: `${a.avance}%`, background: FASE[a.fase] }} />
                        </div>
                      ) : <span className="absolute inset-y-0 left-1 flex items-center text-[11px] text-tinta-3">Sin fechas en la BD del BSC</span>}
                      <div className="absolute inset-y-0 border-l-2 border-tinta" style={{ left: `${pos(corte) + 100 / meses}%` }} aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Avance frente a presupuesto por acción" descripcion="Índice, sin cifras en pesos. Alerta si el desvío supera 10 % o la razón avance / gasto baja de 0,85" etiqueta="Simulado" elementos="#39, #40"
        pie="Peso en el presupuesto proporcional a la duración (por confirmar). Objetivo COBIT e indicador de cada acción: propuesta del equipo, por confirmar.">
        <Tabla columnas={['Acción', 'Responsable', 'Objetivo COBIT', 'Fase', 'Avance', 'Gasto real vs plan', 'Avance / gasto', 'Peso']} minimo={980}>
          {D.plan.filter((a) => a.fase === 'En curso' || a.fase === 'Terminada').map((a) => {
            const r = a.gasto_real ? a.avance / a.gasto_real : null, dv = a.gasto_plan ? (a.gasto_real / a.gasto_plan - 1) * 100 : 0
            return (
              <tr key={a.codigo}>
                <td className="max-w-sm"><b>{a.codigo}</b> {a.accion}</td><td className="text-tinta-2">{a.responsable}</td><td>{a.objetivo_cobit ?? '—'}</td><td>{a.fase}</td>
                <td className="min-w-28"><div className="flex items-center gap-2"><div className="flex-1"><Barra valor={a.avance} max={100} /></div><span className="cifra text-xs">{num(a.avance, 0)} %</span></div></td>
                <td className={`cifra ${dv > 10 ? 'font-semibold text-rojo' : ''}`}>{dv >= 0 ? '+' : ''}{num(dv, 1)} %</td>
                <td className={`cifra ${r != null && r < 0.85 ? 'font-semibold text-rojo' : ''}`}>{num(r, 2)}</td>
                <td className="cifra">{num(a.peso, 1)}</td>
              </tr>
            )
          })}
        </Tabla>
      </Tarjeta>
    </Seccion>
  )
}

function Riesgos() {
  const { D, IND, abrirIndicador } = useTablero()
  const R = D.riesgos
  return (
    <Seccion id="riesgos" titulo="Riesgos de TI" elementos="#43 a 46" descripcion="Los 11 riesgos de la BD del BSC. Residual = inherente × (1 − eficacia), con la eficacia según el nivel COBIT del proceso que lo mitiga.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <Tarjeta titulo="Matriz de riesgo inherente" descripcion="Probabilidad × impacto, de 1 a 3" etiqueta="Real" elementos="#46"
          pie={<><b className="cifra">{R.filter((r) => r.fuera_apetito).length}</b> de {R.length} quedan fuera del apetito después de controles.</>}>
          <div className="grid grid-cols-[28px_repeat(3,1fr)] gap-1 text-center text-xs">
            {[3, 2, 1].map((im) => (
              <Fragment key={im}>
                <span className="flex items-center justify-center text-tinta-2">{im}</span>
                {[1, 2, 3].map((pr) => {
                  const s = pr * im, l = R.filter((r) => r.probabilidad === pr && r.impacto === im)
                  return (
                    <div key={pr} className="flex min-h-16 flex-wrap content-center items-center justify-center gap-1 rounded-lg p-1"
                      style={{ background: s >= 6 ? '#f7dcd8' : s >= 3 ? '#f6ead0' : '#dcefe4' }} title={`Probabilidad ${pr}, impacto ${im}: severidad ${s}`}>
                      {l.map((r) => <span key={r.id} title={r.riesgo} className="rounded bg-papel px-1.5 py-0.5 font-semibold">{r.id}</span>)}
                    </div>
                  )
                })}
              </Fragment>
            ))}
            <span />{[1, 2, 3].map((p) => <span key={p} className="text-tinta-2">{p}</span>)}
          </div>
          <div className="flex justify-between text-xs text-tinta-2"><span>↑ Impacto</span><span>Probabilidad →</span></div>
        </Tarjeta>
        <Tarjeta titulo="Registro de riesgos" descripcion="Antes y después de controles, dueño y señal de alerta" etiqueta="Real" elementos="#43 a 45"
          pie="Riesgos, probabilidad, impacto, mitigación y acciones: BD del BSC. Categoría, proceso COBIT, dueño y señal: propuesta del equipo, por confirmar.">
          <Tabla columnas={['Riesgo', 'Proceso COBIT', 'Antes → después', 'Apetito', 'Señal', 'Dueño']} minimo={900}>
            {R.map((r) => (
              <tr key={r.id}>
                <td className="max-w-sm"><b>{r.id}</b> {r.riesgo}<span className="block text-xs text-tinta-2">{r.categoria}{r.acciones ? `, acciones ${r.acciones}` : ', sin acción asociada'}</span></td>
                <td>{r.proceso}<span className="block text-xs text-tinta-2">{r.nivel_proceso != null ? `nivel ${r.nivel_proceso}` : 'sin nivel evaluado'}</span></td>
                <td className="min-w-40">
                  <div className="flex flex-col gap-1">
                    <div className="h-2 rounded-full bg-linea-2"><div className="h-2 rounded-full bg-tinta-3" style={{ width: `${(r.inherente / 9) * 100}%` }} /></div>
                    <div className="relative h-2 rounded-full bg-linea-2">
                      <div className={`h-2 rounded-full ${r.fuera_apetito ? 'bg-rojo' : 'bg-verde'}`} style={{ width: `${(r.residual / 9) * 100}%` }} />
                      <div className="absolute -top-1 h-4 w-0.5 bg-tinta" style={{ left: `${(r.severidad_max / 9) * 100}%` }} title={`Apetito: severidad máxima ${r.severidad_max}`} />
                    </div>
                    <span className="cifra text-xs text-tinta-2">{r.inherente} → {num(r.residual, 1)} (eficacia {num(r.eficacia * 100, 0)} %)</span>
                  </div>
                </td>
                <td>{r.apetito}<span className={`block text-xs font-semibold ${r.fuera_apetito ? 'text-rojo' : 'text-verde'}`}>{r.fuera_apetito ? '■ Fuera' : '● Dentro'}</span></td>
                <td>{r.senal && <button type="button" onClick={() => abrirIndicador(r.senal!)} className="flex items-center gap-1.5 text-left hover:underline">
                  <span aria-hidden="true" style={{ color: COLOR_SEMAFORO[r.senal_semaforo ?? 'gris'] }}>●</span>{IND[r.senal]?.nombre ?? r.senal}</button>}</td>
                <td>{r.dueno ?? <b className="text-rojo">Sin dueño</b>}</td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Supuestos() {
  const { D } = useTablero()
  return (
    <Seccion id="supuestos" titulo="Supuestos del modelo" descripcion="Registro S1 a S12 del proceso de generación de datos. Los parámetros se aprueban antes de ver el tablero.">
      <Tarjeta>
        <Tabla columnas={['', 'Supuesto', 'Valor', 'Estado']} minimo={700} compacta>
          {D.supuestos.map((s) => <tr key={s.id}><td className="font-semibold">{s.id}</td><td>{s.supuesto}</td><td className="text-tinta-2">{s.valor}</td><td className="whitespace-nowrap text-xs">{s.estado}</td></tr>)}
        </Tabla>
      </Tarjeta>
    </Seccion>
  )
}
