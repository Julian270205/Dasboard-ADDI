import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Etiqueta, Evidencia, Semaforo as TSemaforo } from '../lib/tipos'

/** Etiqueta del dato: se distingue por forma, no solo por color (sólido, borde, punteado). */
export function EtiquetaDato({ e }: { e: Etiqueta | null | undefined }) {
  if (!e) return null
  const estilo: Record<Etiqueta, string> = {
    Real: 'bg-tinta text-white border border-tinta',
    Estimado: 'bg-papel text-tinta border border-tinta/70',
    Simulado: 'bg-papel text-tinta-2 border border-dashed border-tinta-3',
    'Por levantar': 'bg-lienzo text-tinta-3 border border-dotted border-tinta-3',
  }
  const ayuda: Record<Etiqueta, string> = {
    Real: 'Hecho público o dato de la BD del BSC',
    Estimado: 'Derivado por el equipo con una regla escrita (sin azar)',
    Simulado: 'Calculado con el motor de negocio y semilla fija: no es un dato de Addi',
    'Por levantar': 'Falta la medición real',
  }
  return <span title={ayuda[e]} className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-medium ${estilo[e]}`}>{e}</span>
}

const EVIDENCIA: Record<Evidencia, string> = { V: 'Verificado en fuente pública u oficial', I: 'Inferido de vacantes, prensa o prácticas del sector', NV: 'No verificable desde afuera' }
export function EvidenciaChip({ e }: { e: Evidencia | null | undefined }) {
  if (!e) return null
  return <span title={EVIDENCIA[e]} className="inline-flex shrink-0 rounded border border-linea px-1.5 py-px text-[11px] text-tinta-2">[{e}]</span>
}

export const SEMAFORO: Record<TSemaforo, { forma: string; texto: string; color: string; fondo: string }> = {
  verde: { forma: '●', texto: 'En meta', color: 'text-verde', fondo: 'bg-verde' },
  amarillo: { forma: '▲', texto: 'En riesgo', color: 'text-ambar', fondo: 'bg-ambar' },
  rojo: { forma: '■', texto: 'Fuera de meta', color: 'text-rojo', fondo: 'bg-rojo' },
  gris: { forma: '○', texto: 'Sin dato', color: 'text-gris', fondo: 'bg-gris' },
}
export const COLOR_SEMAFORO: Record<TSemaforo, string> = { verde: '#1e7d4f', amarillo: '#b7791f', rojo: '#c23b2e', gris: '#8a94a3' }

/** Semáforo con forma y texto: nunca solo color. */
export function Semaforo({ s, corto = false }: { s: TSemaforo | null | undefined; corto?: boolean }) {
  const x = SEMAFORO[s ?? 'gris']
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${x.color}`} title={x.texto}>
      <span aria-hidden="true">{x.forma}</span>{corto ? <span className="sr-only">{x.texto}</span> : x.texto}
    </span>
  )
}

export function Elementos({ n }: { n?: string }) {
  if (!n) return null
  return <span title="Número del elemento en el catálogo del dashboard" className="tnum shrink-0 text-xs text-tinta-3">{n}</span>
}

export function Seccion({ titulo, descripcion, elementos, acciones, children, id }: {
  titulo: string; descripcion?: ReactNode; elementos?: string; acciones?: ReactNode; children: ReactNode; id?: string
}) {
  return (
    <section id={id} className="flex flex-col gap-4 scroll-mt-48">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 max-w-3xl flex-col gap-1">
          <h2 className="m-0 text-[19px] font-semibold tracking-tight">{titulo} <Elementos n={elementos} /></h2>
          {descripcion && <p className="m-0 text-[13.5px] text-tinta-2">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  )
}

export function Tarjeta({ titulo, descripcion, etiqueta, elementos, children, className = '', pie }: {
  titulo?: ReactNode; descripcion?: ReactNode; etiqueta?: Etiqueta | null; elementos?: string; children: ReactNode; className?: string; pie?: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-xl border border-linea bg-papel p-5 ${className}`}>
      {(titulo || etiqueta || elementos) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {titulo && <h3 className="m-0 text-[15px] font-semibold">{titulo}</h3>}
            {descripcion && <p className="m-0 text-[13px] text-tinta-2">{descripcion}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2"><EtiquetaDato e={etiqueta} /><Elementos n={elementos} /></div>
        </div>
      )}
      {children}
      {pie && <div className="mt-auto border-t border-linea-2 pt-3 text-xs text-tinta-2">{pie}</div>}
    </div>
  )
}

/** Barra horizontal con marca de meta opcional. */
export function Barra({ valor, max, meta, color = 'bg-acento', etiqueta }: { valor: number; max: number; meta?: number | null; color?: string; etiqueta?: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (100 * v) / max))}%`
  return (
    <div role="img" aria-label={etiqueta ?? `${valor} de ${max}`} className="relative h-2.5 min-w-16 rounded-full bg-linea-2">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: pct(valor) }} />
      {meta != null && <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-tinta" style={{ left: pct(meta) }} title={`Meta ${meta}`} />}
    </div>
  )
}

export function Tabla({ columnas, children, minimo = 640, compacta = false }: { columnas: ReactNode[]; children: ReactNode; minimo?: number; compacta?: boolean }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth: minimo }}>
        <thead>
          <tr className="text-left text-xs text-tinta-2">
            {columnas.map((c, k) => <th key={k} className="whitespace-nowrap border-b border-linea px-2.5 py-2 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody className={`[&_td]:border-b [&_td]:border-linea-2 [&_td]:px-2.5 [&_td]:align-top [&_tr:last-child_td]:border-0 ${compacta ? '[&_td]:py-1.5' : '[&_td]:py-2.5'}`}>
          {children}
        </tbody>
      </table>
    </div>
  )
}

export function Boton({ variante = 'normal', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'normal' | 'primario' | 'peligro' | 'fantasma' }) {
  const v = {
    normal: 'border border-linea bg-papel text-tinta hover:border-tinta-3',
    primario: 'border border-acento bg-acento text-white hover:bg-[#244bb8]',
    peligro: 'border border-rojo bg-papel text-rojo hover:bg-rojo/5',
    fantasma: 'border border-transparent bg-transparent text-tinta-2 hover:text-tinta',
  }[variante]
  return <button type="button" {...p} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'ok' | 'error' | 'atencion'; children: ReactNode }) {
  const e = {
    info: 'border-linea bg-papel text-tinta-2',
    ok: 'border-verde/30 bg-verde/5 text-verde',
    error: 'border-rojo/30 bg-rojo/5 text-rojo',
    atencion: 'border-ambar/40 bg-ambar/5 text-[#7a4f10]',
  }[tipo]
  return <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-[13.5px] ${e}`}>{children}</div>
}

export function Dato({ nombre, valor, nota }: { nombre: ReactNode; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-tinta-2">{nombre}</span>
      <span className="cifra text-[22px] font-semibold leading-tight">{valor}</span>
      {nota && <span className="text-xs text-tinta-3">{nota}</span>}
    </div>
  )
}

export function Cargando({ texto = 'Cargando el tablero…' }: { texto?: string }) {
  return <div role="status" className="py-16 text-center text-tinta-2">{texto}</div>
}
