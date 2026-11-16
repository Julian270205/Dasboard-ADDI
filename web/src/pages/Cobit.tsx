import { Link, useSearchParams } from 'react-router-dom'
import { Cuadrante, Linea, SERIES } from '../components/Graficas'
import { Barra, Dato, EtiquetaDato, EvidenciaChip, Seccion, Semaforo, Tabla, Tarjeta } from '../components/ui'
import { fecha, mes, num, promedio } from '../lib/formato'
import { DOMINIOS, LISTA_DOMINIOS, NIVELES, autoevaluacion, evaluados, nivelDominio, objetivoDominio, pendientes, useTablero } from '../lib/tablero'
import type { ObjetivoCobit } from '../lib/tipos'
import { Indice, useAncla } from './comun'

const FONDO_NIVEL = ['bg-n0 text-tinta', 'bg-n1 text-tinta', 'bg-n2 text-tinta', 'bg-n3 text-white', 'bg-n4 text-white', 'bg-n5 text-white']
const SECCIONES_AUTO = ['Estructuras de organización y gobierno', 'Apoyo ejecutivo y liderazgo', 'Planeación estratégica y operativa', 'Medición de la entrega de servicio', 'Organización de TI y gestión de riesgos']

export default function Cobit() {
  useAncla()
  const { D } = useTablero()
  const ev = evaluados(D), au = autoevaluacion(D)
  const global = promedio(ev.map((c) => c.nivel as number))
  return (
    <>
      <Seccion titulo="Gobierno de TI con COBIT 2019" elementos="#58 a 71"
        descripcion="Niveles de capacidad de 0 a 5 a partir de los tres diagnósticos. El flujo mensual propone cambios de nivel y una persona los aprueba.">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Cifra nombre="Nivel medio de capacidad" valor={num(global, 2)} nota={`${ev.length} procesos evaluados, escala 0 a 5`} n="#58" />
          <Cifra nombre="Objetivos en nivel 1" valor={`${ev.filter((c) => c.nivel === 1).length} de ${ev.length}`} nota="Prioridad de alerta" n="#61" />
          <Cifra nombre="Autoevaluación" valor={`${au.pts} de ${au.max}`} nota={`Nivel ${au.n}; el nivel ${au.n + 1} exige ${num(au.siguiente, 2)}`} n="#65" />
          <Cifra nombre="Cambios por aprobar" valor={String(pendientes(D).length)} nota="Propuestos por el flujo; una persona decide" n="#70" />
        </div>
      </Seccion>
      <Indice enlaces={[['mapa', 'Mapa de los 40 objetivos'], ['atencion', 'Dónde poner la atención'], ['evidencia', 'Calidad de la evidencia'], ['autoevaluacion', 'Autoevaluación y proyección'], ['cambios', 'Cambios de nivel'], ['flujo', 'Cómo funciona el flujo']]} />
      <Mapa />
      <Atencion />
      <Evidencia />
      <AutoProyeccion />
      <Cambios />
      <Flujo />
    </>
  )
}

function Cifra({ nombre, valor, nota, n }: { nombre: string; valor: string; nota: string; n: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-linea bg-papel p-5">
      <div className="flex justify-between gap-2 text-[13px] font-medium"><span>{nombre}</span><span className="tnum text-xs font-normal text-tinta-3">{n}</span></div>
      <span className="cifra text-[38px] font-semibold leading-none">{valor}</span>
      <span className="text-xs text-tinta-2">{nota}</span>
    </div>
  )
}

function useSeleccion(): [string | null, (c: string | null) => void] {
  const [p, setP] = useSearchParams()
  return [p.get('obj'), (c) => setP((x) => { if (c) { x.set('obj', c) } else { x.delete('obj') } return x }, { replace: true })]
}

function Celda({ c, sel, elegir }: { c: ObjetivoCobit; sel: boolean; elegir: () => void }) {
  return (
    <button type="button" onClick={elegir} aria-pressed={sel}
      title={`${c.codigo} ${c.nombre}${c.nivel == null ? ', sin nivel evaluado' : `, nivel ${c.nivel} ${NIVELES[c.nivel]}`}`}
      className={`flex min-h-12 min-w-[68px] flex-col items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold ${c.nivel == null ? 'sin-nivel border border-dashed border-tinta-3 text-tinta-2' : FONDO_NIVEL[c.nivel]} ${sel ? 'ring-2 ring-tinta ring-offset-2' : ''}`}>
      {c.codigo}
      <span className="text-[10.5px] font-normal opacity-90">{c.nivel == null ? 's/e' : `${c.nivel === 1 ? '⚠ ' : ''}N${c.nivel}`} {c.etiqueta_evidencia}</span>
    </button>
  )
}

function Mapa() {
  const { D } = useTablero()
  const [sel, elegir] = useSeleccion()
  return (
    <Seccion id="mapa" titulo="Mapa de los 40 objetivos" elementos="#58, #59 y #66 a #68" descripcion="Color = nivel de capacidad; letras = evidencia. Elige un objetivo para ver qué lo mueve.">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Tarjeta titulo="Nivel de capacidad por objetivo" etiqueta="Estimado" elementos="#58"
          pie={<div className="flex flex-wrap items-center gap-3">{NIVELES.map((n, k) => <span key={n} className="flex items-center gap-1.5"><span className={`inline-block size-3 rounded ${FONDO_NIVEL[k]} border border-linea`} />{k} {n}</span>)}<span className="flex items-center gap-1.5"><span className="sin-nivel inline-block size-3 rounded border border-dashed border-tinta-3" />s/e sin nivel evaluado</span></div>}>
          <div className="flex flex-col gap-2.5">
            {LISTA_DOMINIOS.map((d) => (
              <div key={d} className="flex items-start gap-3">
                <span className="w-11 shrink-0 pt-3 text-[13px] font-semibold" title={DOMINIOS[d]}>{d}</span>
                <div className="flex flex-1 flex-wrap gap-1.5">{D.cobit.filter((c) => c.dominio === d).map((c) => <Celda key={c.codigo} c={c} sel={sel === c.codigo} elegir={() => elegir(sel === c.codigo ? null : c.codigo)} />)}</div>
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Brecha por dominio" descripcion="Nivel actual frente al nivel objetivo (S5)" etiqueta="Estimado" elementos="#59"
          pie="Nivel objetivo entero por objetivo, fijado por importancia: los niveles de capacidad son enteros.">
          <Tabla columnas={['Dominio', 'Actual', 'Objetivo', 'Brecha', '']} minimo={360} compacta>
            {LISTA_DOMINIOS.map((d) => {
              const a = nivelDominio(D, d), o = objetivoDominio(D, d)
              return (
                <tr key={d}><td title={DOMINIOS[d]}><b>{d}</b></td><td className="cifra">{num(a, 2)}</td><td className="cifra">{num(o, 2)}</td>
                  <td className="cifra font-semibold">{num(o - a, 2)}</td><td className="w-2/5 pt-3.5"><Barra valor={a} max={5} meta={o} /></td></tr>
              )
            })}
          </Tabla>
        </Tarjeta>
      </div>
      {sel && <DetalleObjetivo codigo={sel} cerrar={() => elegir(null)} />}
    </Seccion>
  )
}

function DetalleObjetivo({ codigo, cerrar }: { codigo: string; cerrar: () => void }) {
  const { D, COB, IND, abrirIndicador } = useTablero()
  const c = COB[codigo]
  if (!c) return null
  const riesgos = (c.riesgos ?? []).map((id) => D.riesgos.find((r) => r.id === id)).filter(Boolean)
  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-tinta bg-papel p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="m-0 text-lg font-semibold">{c.codigo} {c.nombre}</h3>
          <span className="text-[13px] text-tinta-2">{DOMINIOS[c.dominio]}{c.codigo_control && c.codigo_control !== c.codigo ? `; figura como ${c.codigo_control} en el Diagnóstico de Control` : ''}</span>
        </div>
        <div className="flex items-center gap-2"><EvidenciaChip e={c.etiqueta_evidencia} /><EtiquetaDato e={c.etiqueta_dato} />
          <button type="button" onClick={cerrar} className="min-h-9 rounded-lg border border-linea px-3 text-[13px] hover:border-tinta-3">Cerrar</button></div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Dato nombre="Nivel vigente" valor={c.nivel ?? 'Sin evaluar'} nota={c.nivel != null ? `${NIVELES[c.nivel]}, versión ${c.version}` : undefined} />
        <Dato nombre="Nivel objetivo" valor={c.nivel_objetivo} nota="S5, según importancia" />
        <Dato nombre="Importancia y desempeño" valor={`${c.importancia} y ${c.desempeno}`} nota="1 a 5; desempeño 1 = muy bien" />
        <Dato nombre="Responsable" valor={<span className="text-[15px]">{c.responsable || 'No se sabe'}</span>} nota={`Lo ejecuta: ${c.quien}; ${c.formal ? 'formal' : 'sin formalizar'}, ${c.auditado ? 'auditado' : 'sin auditar'}`} />
      </div>
      <p className="m-0 max-w-4xl text-[13px] leading-relaxed text-tinta-2">{c.evidencia || c.justificacion}</p>
      <div className="grid grid-cols-1 gap-4 border-t border-linea-2 pt-4 md:grid-cols-3">
        <div className="flex flex-col gap-1"><b className="text-[13px]">Indicadores <span className="font-normal text-tinta-3">#66</span></b>
          {(c.indicadores ?? []).map((id) => <button key={id} type="button" onClick={() => abrirIndicador(id)} className="flex items-center gap-2 text-left text-[13px] hover:underline"><Semaforo s={IND[id]?.estado?.semaforo} corto />{IND[id]?.nombre ?? id}</button>)}
          {!c.indicadores?.length && <span className="text-[13px] text-tinta-2">Ninguno ligado</span>}</div>
        <div className="flex flex-col gap-1"><b className="text-[13px]">Acciones del plan <span className="font-normal text-tinta-3">#67</span></b>
          {(c.acciones ?? []).map((a) => { const x = D.plan.find((p) => p.codigo === a); return <span key={a} className="text-[13px]"><b>{a}</b> {x?.accion} <span className="text-tinta-2">({x?.fase.toLowerCase()})</span></span> })}
          {!c.acciones?.length && <span className={`text-[13px] ${c.nivel === 1 ? 'font-semibold text-rojo' : 'text-tinta-2'}`}>{c.nivel === 1 ? '■ Nivel 1 sin ninguna acción: brecha que el plan no cubre' : 'Ninguna ligada'}</span>}</div>
        <div className="flex flex-col gap-1"><b className="text-[13px]">Riesgos <span className="font-normal text-tinta-3">#68</span></b>
          {riesgos.map((r) => <span key={r!.id} className="text-[13px]"><b>{r!.id}</b> {r!.riesgo} <span className="cifra text-tinta-2">({r!.inherente} → {num(r!.residual, 1)})</span></span>)}
          {!riesgos.length && <span className="text-[13px] text-tinta-2">Ninguno ligado</span>}</div>
      </div>
    </div>
  )
}

function Atencion() {
  const { D } = useTablero()
  const [, elegir] = useSeleccion()
  const celdas: Record<string, { desempeno: number; importancia: number; codigos: string[] }> = {}
  D.cobit.filter((c) => c.desempeno < 5).forEach((c) => {
    const k = `${c.desempeno}|${c.importancia}`
    ;(celdas[k] ??= { desempeno: c.desempeno, importancia: c.importancia, codigos: [] }).codigos.push(c.codigo)
  })
  const sinVisibilidad = D.cobit.filter((c) => c.desempeno === 5)
  const alerta = D.cobit.filter((c) => (c.importancia === 5 && c.desempeno >= 3) || c.nivel === 1)
  return (
    <Seccion id="atencion" titulo="Dónde poner la atención" elementos="#60 y #61" descripcion="Diagnóstico de sensibilización gerencial: lo muy importante que se hace regular, y los procesos en nivel 1.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Importancia contra desempeño" descripcion="Cada burbuja agrupa los objetivos con la misma calificación" etiqueta="Estimado" elementos="#60"
          pie={<><b>Sin visibilidad ({sinVisibilidad.length}):</b> {sinVisibilidad.map((c) => c.codigo).join(', ')}. Tienen desempeño 5 porque no son verificables desde afuera, no porque se hagan mal; por eso van aparte.</>}>
          <Cuadrante celdas={Object.values(celdas)} alSeleccionar={(c) => { elegir(c); document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' }) }} />
        </Tarjeta>
        <Tarjeta titulo="Objetivos en alerta" descripcion="Importancia alta con desempeño regular, o proceso en nivel 1" etiqueta="Estimado" elementos="#61">
          <Tabla columnas={['Objetivo', 'Por qué', 'Nivel', 'Acciones del plan', '']} minimo={520} compacta>
            {alerta.map((c) => (
              <tr key={c.codigo} onClick={() => { elegir(c.codigo); document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' }) }} className="cursor-pointer hover:bg-lienzo">
                <td><b>{c.codigo}</b> {c.nombre}</td>
                <td className="text-tinta-2">{c.nivel === 1 ? 'Proceso en nivel 1' : `Importancia 5, desempeño ${c.desempeno}`}</td>
                <td className="cifra">{c.nivel ?? 's/e'}</td>
                <td>{c.acciones?.length ? c.acciones.join(', ') : <b className="text-rojo">Ninguna</b>}</td>
                <td><EvidenciaChip e={c.etiqueta_evidencia} /></td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Evidencia() {
  const { D } = useTablero()
  const n = (f: (c: ObjetivoCobit) => boolean) => D.cobit.filter(f).length
  const total = D.cobit.length
  const fsa = D.cobit.filter((c) => c.formal && !c.auditado)
  const ns = D.cobit.filter((c) => !c.responsable || /do not know|no se sabe/i.test(c.responsable))
  const filas = [['V', 'Verificado en fuente pública u oficial', 'bg-verde'], ['I', 'Inferido de vacantes, prensa o prácticas del sector', 'bg-ambar'], ['NV', 'No verificable desde afuera', 'bg-gris']] as const
  return (
    <Seccion id="evidencia" titulo="Calidad de la evidencia y del aseguramiento" elementos="#62 a 64">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Cobertura de evidencia" descripcion="Lo demostrable frente a lo supuesto" etiqueta="Estimado" elementos="#62"
          pie={`Los ${n((c) => c.nivel === 3)} procesos en nivel 3 son los que tienen evidencia pública verificada: el puntaje mide en parte visibilidad.`}>
          {filas.map(([e, t, col]) => (
            <div key={e} className="flex flex-col gap-1"><div className="flex justify-between text-[13px]"><span>[{e}] {t}</span><b className="cifra">{n((c) => c.etiqueta_evidencia === e)}</b></div>
              <Barra valor={n((c) => c.etiqueta_evidencia === e)} max={total} color={col} /></div>
          ))}
        </Tarjeta>
        <Tarjeta titulo="Formales frente a auditados" descripcion="Lo documentado que nadie independiente verifica" etiqueta="Estimado" elementos="#63"
          pie={<><b>{fsa.length} formales sin auditoría:</b> {fsa.map((c) => c.codigo).join(', ')}. Es una brecha de aseguramiento, no de operación.</>}>
          <div className="flex flex-col gap-1"><div className="flex justify-between text-[13px]"><span>Con contrato, ANS o procedimiento</span><b className="cifra">{n((c) => c.formal)} de {total}</b></div><Barra valor={n((c) => c.formal)} max={total} /></div>
          <div className="flex flex-col gap-1"><div className="flex justify-between text-[13px]"><span>Auditados</span><b className="cifra">{n((c) => c.auditado)} de {total}</b></div><Barra valor={n((c) => c.auditado)} max={total} color="bg-verde" /></div>
        </Tarjeta>
        <Tarjeta titulo="Responsable nombrado" descripcion="Que cada proceso tenga dueño" etiqueta="Estimado" elementos="#64"
          pie={<>{ns.map((c) => c.codigo).join(', ')}. Los cargos de seguridad (CISO) están en formación.</>}>
          <div className="flex flex-col gap-1"><div className="flex justify-between text-[13px]"><span>Con responsable</span><b className="cifra">{total - ns.length} de {total}</b></div><Barra valor={total - ns.length} max={total} color="bg-verde" /></div>
          <div className="flex flex-col gap-1"><div className="flex justify-between text-[13px]"><span>«No se sabe» quién responde</span><b className="cifra">{ns.length}</b></div><Barra valor={ns.length} max={total} color="bg-rojo" /></div>
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function AutoProyeccion() {
  const { D } = useTablero()
  const au = autoevaluacion(D)
  const secs = [1, 2, 3, 4, 5].map((s) => {
    const it = D.autoevaluacion.filter((a) => a.seccion === s)
    return { p: it.reduce((a, x) => a + x.puntos, 0), max: it.length * 2 }
  })
  const anios = [2026, 2027, 2028, 2029, 2030]
  const respuestas = (r: string) => D.autoevaluacion.filter((a) => a.respuesta === r).length
  return (
    <Seccion id="autoevaluacion" titulo="Autoevaluación y proyección" elementos="#65 y #69">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Autoevaluación de madurez por sección" descripcion={`${au.pts} de ${au.max} puntos, nivel ${au.n}, ${D.autoevaluacion.length} preguntas`} etiqueta="Estimado" elementos="#65"
          pie={`La línea vertical es el umbral del nivel 3 (57,1 %). ${respuestas('Yes')} respuestas «Sí», ${respuestas('Partial')} «Parcial» y ${respuestas('No')} «No». Resultado de frontera: con una respuesta que pase de Parcial a Sí, el nivel sube a 3.`}>
          {secs.map((s, k) => (
            <div key={k} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-[13px]"><span>{k + 1}. {SECCIONES_AUTO[k]}</span><b className="cifra whitespace-nowrap">{s.p} de {s.max} ({num((s.p / s.max) * 100, 0)} %)</b></div>
              <Barra valor={s.p} max={s.max} meta={(4 / 7) * s.max} />
            </div>
          ))}
        </Tarjeta>
        <Tarjeta titulo="Madurez proyectada 2026 a 2030" descripcion="Si el plan se cumple: cada acción terminada sube un nivel su objetivo, con tope en el nivel objetivo" etiqueta="Simulado" elementos="#69">
          <Linea titulo="Madurez proyectada por dominio" alto={260} etiquetasFinales series={LISTA_DOMINIOS.map((d, k) => ({
            nombre: d, color: SERIES[k], puntos: anios.map((a) => [`${a}-12`, D.proyeccion_madurez.find((p) => p.anio === a && p.dominio === d)?.nivel ?? 0] as [string, number]),
          }))} />
          <Tabla columnas={['Dominio', ...anios.map(String)]} minimo={360} compacta>
            {LISTA_DOMINIOS.map((d) => <tr key={d}><td><b>{d}</b></td>{anios.map((a) => <td key={a} className="cifra">{num(D.proyeccion_madurez.find((p) => p.anio === a && p.dominio === d)?.nivel, 2)}</td>)}</tr>)}
          </Tabla>
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Cambios() {
  const { D } = useTablero()
  const P = pendientes(D)
  const corte = D.config.corte_plan.slice(0, 7)
  const informativas = D.propuestas.filter((p) => p.tipo === 'alerta' && p.corte === corte)
  const rechazadas = D.propuestas.filter((p) => p.estado === 'rechazada' || p.estado === 'caducada')
  return (
    <Seccion id="cambios" titulo="Cambios de nivel" elementos="#70 y #71"
      descripcion="El flujo propone y una persona aprueba. El correo de n8n trae los botones Aprobar y Rechazar; cada uno abre la confirmación, donde se pide iniciar sesión.">
      <Tarjeta titulo="Cola de cambios propuestos" descripcion="Se muestran aparte de los niveles aprobados; mientras nadie responda, no se aplican" etiqueta="Simulado" elementos="#70">
        {P.length === 0 ? <p className="m-0 text-sm text-tinta-2">No hay cambios pendientes de aprobación.</p> : (
          <Tabla columnas={['Objetivo', 'Cambio', 'Regla y evidencia', 'Dato', 'Aprobador', '']} minimo={980}>
            {P.map((p) => {
              const sube = (p.nivel_propuesto ?? 0) > (p.nivel_actual ?? 0)
              return (
                <tr key={p.id}>
                  <td><b>{p.objetivo}</b> {p.nombre}<span className="block text-xs text-tinta-2">Corte {mes(p.corte)}{p.recordatorios ? `, ${p.recordatorios} recordatorio(s)` : ''}</span></td>
                  <td className={`cifra whitespace-nowrap text-[17px] font-semibold ${sube ? 'text-verde' : 'text-rojo'}`}>{p.nivel_actual} → {p.nivel_propuesto} {sube ? '↑' : '↓'}</td>
                  <td className="max-w-md"><b>{p.regla}</b><span className="block text-xs text-tinta-2">{p.evidencia}</span></td>
                  <td><EtiquetaDato e={p.etiqueta} /></td>
                  <td className="text-[13px]">{p.recordatorios >= 2 ? `${p.suplente} (suplente)` : p.aprobador}{p.copia_cto && <span className="block text-xs text-tinta-2">Copia al CTO: el aprobador es dueño de las acciones</span>}</td>
                  <td><Link to={`/aprobaciones/${p.id}`} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-linea px-3 text-[13px] font-medium text-tinta no-underline hover:border-tinta-3">Revisar y decidir</Link></td>
                </tr>
              )
            })}
          </Tabla>
        )}
      </Tarjeta>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Alertas del corte por objetivo" descripcion="No cambian el nivel" elementos="#61 y #67">
          {informativas.length === 0 ? <p className="m-0 text-sm text-tinta-2">Sin alertas en este corte.</p> : (
            <Tabla columnas={['Objetivo', 'Alerta', 'Evidencia', 'Dato']} minimo={560} compacta>
              {informativas.map((p) => <tr key={p.id}><td><b>{p.objetivo}</b></td><td className="whitespace-nowrap">{p.regla}</td><td className="text-tinta-2">{p.evidencia}</td><td><EtiquetaDato e={p.etiqueta} /></td></tr>)}
            </Tabla>
          )}
        </Tarjeta>
        <Tarjeta titulo="Historial de cambios de nivel" descripcion="Cuándo cambió cada objetivo, quién lo decidió y con qué evidencia" elementos="#71">
          {D.historial_madurez.length + rechazadas.length === 0 ? <p className="m-0 text-sm text-tinta-2">Aún no hay cambios decididos en esta corrida. Los niveles vigentes vienen de la carga única del Diagnóstico de Control (13 de noviembre de 2026).</p> : (
            <Tabla columnas={['Cuándo', 'Objetivo', 'Cambio', 'Quién decidió', 'Evidencia o motivo']} minimo={620} compacta>
              {D.historial_madurez.map((h) => <tr key={`${h.objetivo}-${h.version}`}><td className="tnum whitespace-nowrap">{fecha(h.fecha)}</td><td><b>{h.objetivo}</b></td><td className="cifra whitespace-nowrap">{h.nivel_anterior} → {h.nivel} (v{h.version})</td><td>{h.aprobador}</td><td className="text-xs text-tinta-2">{h.evidencia}</td></tr>)}
              {rechazadas.map((p) => <tr key={p.id}><td className="whitespace-nowrap">{mes(p.corte)}</td><td><b>{p.objetivo}</b></td><td className="whitespace-nowrap">{p.estado === 'caducada' ? 'Caducada' : 'Rechazado'}: {p.nivel_actual} → {p.nivel_propuesto}</td><td>{p.aprobador ?? '—'}</td><td className="text-xs text-tinta-2">{p.motivo_rechazo ? `Motivo: ${p.motivo_rechazo}` : 'El nivel cambió antes de decidir'}</td></tr>)}
            </Tabla>
          )}
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Flujo() {
  const { D } = useTablero()
  const pasos = [
    ['Leer datos', 'Mediciones del mes, plan y riesgos'], ['Calcular semáforos', 'Dos cortes seguidos por indicador'], ['Proponer', 'Reglas de subir, bajar y alertas'],
    ['Avisar', 'Correo al aprobador del dominio con los botones Aprobar y Rechazar', true], ['Decidir', 'Confirmación en el tablero con sesión; motivo obligatorio para rechazar', true],
    ['Versionar', 'Fila nueva en procesos_madurez; la anterior no se borra'], ['Mostrar', 'El tablero lee el nivel vigente'],
  ] as const
  return (
    <Seccion id="flujo" titulo="Cómo funciona el flujo" descripcion="Flujo mensual en n8n con siete pasos; los pasos 4 y 5 son decisiones humanas.">
      <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4 xl:grid-cols-7">
        {pasos.map(([t, d, humano], k) => (
          <li key={t} className={`flex flex-col gap-1 rounded-xl border p-3 text-[12.5px] ${humano ? 'border-acento bg-acento-suave' : 'border-linea bg-papel'}`}>
            <b className="text-[13px]">{k + 1}. {t}</b><span className="text-tinta-2">{d}</span>{humano && <span className="mt-auto text-xs font-semibold text-acento">Decisión humana</span>}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Reglas de propuesta">
          <Tabla columnas={['Regla', 'Condición', 'Resultado']} minimo={480} compacta>
            <tr><td>Subir nivel</td><td>Todas las acciones ligadas completadas e indicadores con 2 cortes seguidos en verde</td><td>Propone +1</td></tr>
            <tr><td>Bajar nivel</td><td>Un indicador ligado con 2 cortes seguidos en rojo</td><td>Propone −1</td></tr>
            <tr><td>Alerta de riesgo</td><td>Riesgo crítico sin acción asociada</td><td>Alerta</td></tr>
            <tr><td>Alerta de brecha</td><td>Importancia 5 con desempeño ≥ 3, o nivel 1</td><td>Alerta</td></tr>
            <tr><td>Alerta de plan</td><td>Acción ligada atrasada</td><td>Alerta</td></tr>
          </Tabla>
        </Tarjeta>
        <Tarjeta titulo="Aprobadores por dominio" pie="Nunca se propone un salto de más de un nivel por corte. En la demo el corte es mensual; en producción sería trimestral. El suplente decide solo si el titular no responde en 2 cortes.">
          <Tabla columnas={['Dominio', 'Titular', 'Suplente']} minimo={420} compacta>
            {D.responsables.map((r) => <tr key={r.dominio}><td title={r.cubre}><b>{r.dominio}</b></td><td>{r.nombre}</td><td className="text-tinta-2">{r.suplente ?? '—'}</td></tr>)}
          </Tabla>
        </Tarjeta>
      </div>
    </Seccion>
  )
}
