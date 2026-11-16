import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from './api'
import { promedio } from './formato'
import type { Indicador, ObjetivoCobit, Semaforo, Tablero } from './tipos'

export const PERSPECTIVAS = ['Financiera', 'Cliente', 'Procesos internos', 'Aprendizaje y crecimiento'] as const
export const DOMINIOS = { EDM: 'Evaluar, dirigir y monitorear', APO: 'Alinear, planificar y organizar', BAI: 'Construir, adquirir e implementar', DSS: 'Entregar, dar servicio y soporte', MEA: 'Monitorear, evaluar y valorar' } as const
export type Dominio = keyof typeof DOMINIOS
export const LISTA_DOMINIOS = Object.keys(DOMINIOS) as Dominio[]
export const NIVELES = ['Incompleto', 'Realizado', 'Gestionado', 'Establecido', 'Predecible', 'Optimizado']

export function useTableroQuery() {
  return useQuery({ queryKey: ['tablero'], queryFn: () => api<Tablero>('/tablero'), staleTime: 30_000, refetchInterval: 120_000 })
}

interface Filtros { perspectiva: string; etiqueta: string }

interface Ctx {
  D: Tablero
  IND: Record<string, Indicador>
  COB: Record<string, ObjetivoCobit>
  filtros: Filtros
  setFiltros: (f: Filtros) => void
  pasaFiltros: (i: Indicador) => boolean
  abrirIndicador: (id: string) => void
}

const TableroCtx = createContext<Ctx | null>(null)

export function ProveedorTablero({ D, children }: { D: Tablero; children: ReactNode }) {
  const [filtros, setFiltros] = useState<Filtros>({ perspectiva: '', etiqueta: '' })
  const [, setParams] = useSearchParams()
  const IND = useMemo(() => Object.fromEntries(D.indicadores.map((i) => [i.id, i])), [D])
  const COB = useMemo(() => Object.fromEntries(D.cobit.map((c) => [c.codigo, c])), [D])
  const pasaFiltros = useCallback((i: Indicador) => {
    if (filtros.etiqueta && i.estado?.etiqueta !== filtros.etiqueta) return false
    if (filtros.perspectiva) {
      const o = D.objetivos_bsc.find((x) => x.codigo === i.objetivo_bsc)
      if (!o || o.perspectiva !== filtros.perspectiva) return false
    }
    return true
  }, [filtros, D])
  const abrirIndicador = useCallback((id: string) => setParams((p) => { p.set('ind', id); return p }), [setParams])
  return <TableroCtx.Provider value={{ D, IND, COB, filtros, setFiltros, pasaFiltros, abrirIndicador }}>{children}</TableroCtx.Provider>
}

export function useTablero(): Ctx {
  const c = useContext(TableroCtx)
  if (!c) throw new Error('useTablero fuera del proveedor')
  return c
}

// ---------- cálculos compartidos (los mismos de la v1) ----------
export const principales = (D: Tablero) => D.indicadores.filter((i) => i.principal && i.estado)
export const cuenta = (l: Indicador[], s: Semaforo) => l.filter((i) => i.estado?.semaforo === s).length
export const pendientes = (D: Tablero) => D.propuestas.filter((p) => p.estado === 'pendiente')
export const evaluados = (D: Tablero) => D.cobit.filter((c) => c.nivel != null)
export const nivelDominio = (D: Tablero, d: string) => promedio(evaluados(D).filter((c) => c.dominio === d).map((c) => c.nivel as number))
export const objetivoDominio = (D: Tablero, d: string) => promedio(evaluados(D).filter((c) => c.dominio === d).map((c) => c.nivel_objetivo))

/** Autoevaluación: Sí = 2, Parcial = 1, No = 0. Nivel n si el porcentaje llega a (n + 1) / 7. */
export function autoevaluacion(D: Tablero) {
  const pts = D.autoevaluacion.reduce((a, x) => a + x.puntos, 0), max = D.autoevaluacion.length * 2, pct = pts / max
  let n = 0
  for (let l = 5; l >= 1; l--) if (pct >= (l + 1) / 7 && !n) n = l
  return { pts, max, pct, n, siguiente: ((n + 2) / 7) * max }
}

export function perspectivaDe(D: Tablero, i: Indicador) {
  return D.objetivos_bsc.find((o) => o.codigo === i.objetivo_bsc)?.perspectiva
}
