// Formato colombiano: coma decimal, punto de miles.

export function num(v: number | string | null | undefined, decimales?: number): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  const d = decimales ?? (Math.abs(n) < 2 ? 3 : Math.abs(n) < 100 ? 2 : 1)
  return n.toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** '2026-11' o '2026-11-01' → 'nov 2026' */
export function mes(iso: string | null | undefined, largo = false): string {
  if (!iso) return '—'
  const [a, m] = iso.split('-')
  return `${(largo ? MESES_LARGOS : MESES)[Number(m) - 1]} ${a}`
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const sentidoTexto = (s: string) =>
  s === 'Max' ? 'mayor es mejor' : s === 'Min' ? 'menor es mejor' : 'debe quedar dentro del rango sano'

export const tendenciaTexto = { sube: '↑ sube', baja: '↓ baja', estable: '→ estable' } as const

export const promedio = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
