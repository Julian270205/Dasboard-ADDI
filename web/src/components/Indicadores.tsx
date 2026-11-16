import { num, tendenciaTexto } from '../lib/formato'
import { useTablero } from '../lib/tablero'
import { Mini } from './Graficas'
import { EtiquetaDato, Semaforo } from './ui'

/** Tarjeta de indicador (elementos 12 y 13): valor, tendencia, mini serie con la meta y semáforo. */
export function TarjetaIndicador({ id }: { id: string }) {
  const { IND, pasaFiltros, abrirIndicador } = useTablero()
  const i = IND[id]
  if (!i || !pasaFiltros(i)) return null
  const e = i.estado
  const meta = i.sentido === 'Rango' ? `Rango sano ${num(i.rango_min)} a ${num(i.rango_max)}` : `Meta ${num(e?.meta)}`
  return (
    <button type="button" onClick={() => abrirIndicador(id)}
      className="group flex min-w-0 flex-col gap-2 rounded-xl border border-linea bg-papel p-4 text-left hover:border-tinta-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug">{i.nombre}</span>
        <EtiquetaDato e={e?.etiqueta} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="cifra text-[30px] font-semibold leading-none">{num(e?.valor)}</span>
        <span className="text-xs text-tinta-2">{i.unidad}</span>
      </div>
      <Mini i={i} />
      <div className="flex items-center justify-between gap-2 text-xs text-tinta-2">
        <span>{meta}</span><Semaforo s={e?.semaforo} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-tinta-3">
        <span>{tendenciaTexto[e?.tendencia ?? 'estable']}</span>
        <span>{i.elemento ? `#${i.elemento}` : ''}{i.objetivo_bsc ? ` ${i.id}` : ''} · {i.tipo === 'Leading' ? 'inductor' : 'resultado'}</span>
      </div>
    </button>
  )
}

export function Indicadores({ ids }: { ids: string[] }) {
  const { IND, pasaFiltros } = useTablero()
  const visibles = ids.filter((id) => IND[id] && pasaFiltros(IND[id]))
  if (!visibles.length) return <p className="m-0 text-sm text-tinta-2">Ningún indicador coincide con los filtros de arriba.</p>
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">{visibles.map((id) => <TarjetaIndicador key={id} id={id} />)}</div>
}

/** Fila compacta: punto de semáforo, nombre y valor. Abre el detalle. */
export function FilaIndicador({ id }: { id: string }) {
  const { IND, abrirIndicador } = useTablero()
  const i = IND[id]
  if (!i) return null
  return (
    <button type="button" onClick={() => abrirIndicador(id)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-lienzo">
      <Semaforo s={i.estado?.semaforo} corto />
      <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{i.nombre}</span>
      <span className="cifra font-semibold">{num(i.estado?.valor)}</span>
      <span className="w-14 truncate text-xs text-tinta-3">{i.unidad}</span>
    </button>
  )
}
