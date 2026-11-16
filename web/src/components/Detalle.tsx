import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mes, num, sentidoTexto, tendenciaTexto } from '../lib/formato'
import { useTablero } from '../lib/tablero'
import { LINEA_PRINCIPAL, Linea } from './Graficas'
import { Aviso, Dato, EtiquetaDato, Semaforo } from './ui'

const CLASE = { 1: 'derivado del equipo', 2: 'anclado en un hecho público', 3: 'simulado con semilla fija' } as const

/** Detalle de un indicador (sección C, elementos 12 a 18). Se abre con ?ind=ID para poder compartir el enlace. */
export default function Detalle() {
  const { IND, COB, D } = useTablero()
  const [params, setParams] = useSearchParams()
  const id = params.get('ind')
  const [anio, setAnio] = useState<string | null>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)
  const i = id ? IND[id] : undefined

  useEffect(() => { setAnio(null); if (i) cerrarRef.current?.focus() }, [id, i])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
  if (!i) return null
  function cerrar() { setParams((p) => { p.delete('ind'); return p }) }

  const e = i.estado
  const anios = Object.keys(i.metas ?? {}).filter((a) => Number(a) >= 2027)
  const meta = anio ? i.metas?.[anio] ?? null : e?.meta ?? null
  const cumplimiento = anio && i.sentido !== 'Rango' && e?.valor != null && meta != null
    ? (i.sentido === 'Max' ? (meta > 0 ? Math.min(100, (100 * e.valor) / meta) : 100) : (e.valor <= meta ? 100 : meta > 0 ? (100 * meta) / e.valor : 0))
    : e?.cumplimiento ?? null
  const serie = i.serie ?? []
  const acciones = (i.acciones ?? []).map((c) => D.plan.find((a) => a.codigo === c)).filter(Boolean)
  const riesgos = (i.riesgos ?? []).map((r) => D.riesgos.find((x) => x.id === r)).filter(Boolean)
  const objetivo = D.objetivos_bsc.find((o) => o.codigo === i.objetivo_bsc)

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="titulo-detalle">
      <button type="button" aria-label="Cerrar detalle" onClick={cerrar} className="absolute inset-0 cursor-default bg-tinta/25" />
      <aside className="panel-entra relative flex h-full w-full max-w-[600px] flex-col gap-5 overflow-y-auto bg-papel p-6 shadow-[-12px_0_32px_rgba(16,32,51,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-tinta-2">{i.elemento ? `Elemento #${i.elemento}` : 'Indicador del BSC'}{i.objetivo_bsc ? `, código ${i.id}` : ''} en la pestaña {i.pestana === 'Estrategia' ? 'Estrategia de TI' : i.pestana}</span>
            <h2 id="titulo-detalle" className="m-0 text-xl font-semibold leading-snug">{i.nombre}</h2>
          </div>
          <button ref={cerrarRef} type="button" onClick={cerrar} aria-label="Cerrar detalle" className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-linea hover:border-tinta-3">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Dato nombre="Valor" valor={<>{num(e?.valor)} <span className="text-sm font-normal text-tinta-2">{i.unidad}</span></>} nota={`${mes(e?.periodo)} · ${tendenciaTexto[e?.tendencia ?? 'estable']}`} />
          <Dato nombre={anio ? `Meta de ${anio}` : 'Meta a la fecha'} valor={i.sentido === 'Rango' ? `${num(i.rango_min)} a ${num(i.rango_max)}` : num(meta)}
            nota={anio ? 'Meta anual del BSC' : 'Interpolada entre las metas anuales'} />
          <Dato nombre="Cumplimiento" valor={cumplimiento != null ? `${num(cumplimiento, 0)} %` : '—'} nota={anio ? undefined : <Semaforo s={e?.semaforo} />} />
        </div>

        {anios.length > 0 && (
          <div role="group" aria-label="Comparar contra la meta de un año" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-tinta-2">Comparar contra:</span>
            {[null, ...anios].map((a) => (
              <button key={a ?? 'corte'} type="button" aria-pressed={anio === a} onClick={() => setAnio(a)}
                className={`min-h-8 rounded-md border px-2.5 text-xs ${anio === a ? 'border-acento bg-acento text-white' : 'border-linea bg-papel hover:border-tinta-3'}`}>
                {a ?? 'Corte'}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-tinta-2">
            <span className="font-semibold text-tinta">Serie histórica <span className="font-normal text-tinta-3">#13</span></span>
            <span>{serie.length} meses hasta el corte {i.reloj === 'plan' ? 'del plan' : 'operativo'}</span>
          </div>
          {serie.length > 1 ? (
            <Linea titulo={`Serie de ${i.nombre}`} unidad={i.unidad} series={[{ nombre: i.nombre, color: LINEA_PRINCIPAL, puntos: serie.map((p) => [p[0], +p[1]]) }]}
              meta={i.sentido === 'Rango' ? null : meta} rango={i.sentido === 'Rango' && i.rango_min != null && i.rango_max != null ? [i.rango_min, i.rango_max] : null} />
          ) : <p className="text-sm text-tinta-2">Este indicador aún no tiene serie: arranca con su acción del plan.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-2">
          <EtiquetaDato e={e?.etiqueta} /> Clase {i.clase}: {CLASE[i.clase]}. {i.sentido === 'Rango' ? `Rango sano entre ${num(i.rango_min)} y ${num(i.rango_max)} ${i.unidad}.`
            : i.umbral_rojo != null ? `Alerta si es ${i.sentido === 'Max' ? 'menor' : 'mayor'} que ${num(i.umbral_rojo)} ${i.unidad}.` : ''}
        </div>

        <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 rounded-xl bg-lienzo p-4 text-[13px]">
          <dt className="text-tinta-2">Qué mide</dt><dd className="m-0">{i.que_mide}</dd>
          <dt className="text-tinta-2">Cómo se calcula</dt><dd className="m-0">{i.formula}</dd>
          <dt className="text-tinta-2">Ancla</dt><dd className="m-0">{i.ancla}</dd>
          <dt className="text-tinta-2">Sentido</dt><dd className="m-0">{sentidoTexto(i.sentido)}, {i.tipo === 'Leading' ? 'inductor' : 'resultado'}. Ruido {i.sigma}.</dd>
          <dt className="text-tinta-2">Responsable</dt><dd className="m-0">{i.responsable}</dd>
          <dt className="text-tinta-2">Fuente</dt><dd className="m-0">{i.fuente}</dd>
          <dt className="text-tinta-2">Metas</dt><dd className="m-0 tnum">{Object.entries(i.metas ?? {}).map(([a, m]) => `${a === '2026' ? 'base' : a}: ${num(m)}`).join(' · ') || '—'}</dd>
        </dl>

        <div className="flex flex-col gap-2 text-[13px]">
          <h3 className="m-0 text-sm font-semibold">Conexiones <span className="font-normal text-tinta-3">#18</span></h3>
          <p className="m-0"><span className="text-tinta-2">Objetivo del BSC: </span>{objetivo ? `${objetivo.codigo}, ${objetivo.nombre}` : '—'}</p>
          <p className="m-0"><span className="text-tinta-2">Acciones del plan: </span>{acciones.length ? acciones.map((a) => `${a!.codigo} ${a!.accion} (${a!.fase.toLowerCase()})`).join('; ') : 'ninguna ligada'}</p>
          <p className="m-0"><span className="text-tinta-2">Riesgos: </span>{riesgos.length ? riesgos.map((r) => `${r!.id} ${r!.riesgo}`).join('; ') : 'ninguno ligado'}</p>
          <p className="m-0"><span className="text-tinta-2">Objetivos COBIT: </span>{(i.cobit ?? []).map((c) => `${c} ${COB[c]?.nombre ?? ''}`).join('; ') || '—'}</p>
        </div>

        {e?.etiqueta === 'Simulado' && <Aviso tipo="atencion">Dato simulado: no es un dato de Addi. Demuestra la lógica del tablero (semáforos, alertas, tendencias y metas).</Aviso>}
      </aside>
    </div>
  )
}
