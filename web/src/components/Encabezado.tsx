import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ApiError, api, enviar } from '../lib/api'
import { tieneRol, usePerfil, useSalir } from '../lib/auth'
import { mes } from '../lib/formato'
import { PERSPECTIVAS, cuenta, pendientes, principales, useTablero } from '../lib/tablero'
import type { PropuestaDetalle } from '../lib/tipos'
import { SEMAFORO } from './ui'

const PESTANAS = [
  { a: '/', texto: 'General' }, { a: '/estrategia', texto: 'Estrategia de TI' }, { a: '/datos', texto: 'Datos' },
  { a: '/seguridad', texto: 'Seguridad' }, { a: '/ia', texto: 'IA' }, { a: '/operacion', texto: 'Operación' }, { a: '/cobit', texto: 'COBIT' },
]

/**
 * La barra superior: lo primero que ve el CIO. Arriba la identidad y los controles; en medio los dos relojes,
 * la vigencia del dato y los contadores; abajo las pestañas. El borde inferior es el "pulso": la proporción de
 * indicadores en rojo, ámbar, verde y sin dato, de un vistazo y en cualquier pestaña.
 */
export default function Encabezado({ aviso }: { aviso: (t: { ok: boolean; texto: string }) => void }) {
  const { D, filtros, setFiltros } = useTablero()
  const { data: yo } = usePerfil()
  const salir = useSalir()
  const qc = useQueryClient()
  const esAdmin = tieneRol(yo, 'admin'), esAprobador = tieneRol(yo, 'aprobador')
  const P = principales(D)
  const c = D.config
  const n = { rojo: cuenta(P, 'rojo'), amarillo: cuenta(P, 'amarillo'), verde: cuenta(P, 'verde'), gris: cuenta(P, 'gris') }
  const total = P.length || 1
  const dias = Math.floor((new Date(D.consultado).getTime() - new Date(D.generado).getTime()) / 864e5)
  const viejo = dias > Number(c.dias_vigencia ?? 45)
  const mias = useQuery({ queryKey: ['aprobaciones'], queryFn: () => api<{ pendientes: PropuestaDetalle[] }>('/aprobaciones'), enabled: esAprobador })
  const porDecidir = mias.data?.pendientes.filter((p) => p.puede_decidir).length ?? 0

  const reloj = useMutation({
    mutationFn: (accion: 'avanzar' | 'reiniciar') => enviar<{ ok: boolean; mensaje: string; ya_hecho?: boolean }>(`/admin/reloj/${accion}`),
    onSuccess: (r) => { aviso({ ok: r.ok, texto: r.ya_hecho ? 'Ese mes ya se había avanzado.' : r.mensaje }); qc.invalidateQueries() },
    onError: (e) => aviso({ ok: false, texto: e instanceof ApiError ? e.message : 'No se pudo mover el reloj.' }),
  })

  const pestana = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-[14px] no-underline transition-colors ${
      isActive ? 'font-semibold text-white after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t after:bg-white' : 'text-white/65 hover:text-white'}`

  return (
    <header className="sticky top-0 z-30 bg-tinta text-white">
      <div className="mx-auto flex max-w-[1440px] flex-col px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4">
          <div className="flex items-center gap-3">
            <Marca />
            <div className="flex flex-col leading-tight">
              <span className="text-[17px] font-semibold tracking-tight">{c.empresa ?? 'Addi'} <span className="font-normal text-white/70">Dashboard estratégico de TI</span></span>
              <span className="text-xs text-white/60">{c.periodo_plan}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Buscador />
            <Selector etiqueta="Perspectiva" valor={filtros.perspectiva} opciones={[...PERSPECTIVAS]} todos="Todas las perspectivas"
              cambiar={(v) => setFiltros({ ...filtros, perspectiva: v })} />
            <Selector etiqueta="Tipo de dato" valor={filtros.etiqueta} opciones={['Real', 'Estimado', 'Simulado']} todos="Todo tipo de dato"
              cambiar={(v) => setFiltros({ ...filtros, etiqueta: v })} />
            {esAdmin && (
              <div className="flex items-center gap-1 rounded-lg bg-white/8 p-1">
                <button type="button" disabled={reloj.isPending} onClick={() => reloj.mutate('avanzar')} title="Avanza un mes el reloj simulado: alertas, propuestas y correos del corte nuevo"
                  className="min-h-8 rounded-md bg-white px-3 text-[13px] font-semibold text-tinta hover:bg-white/90 disabled:opacity-60">Avanzar un mes</button>
                <button type="button" disabled={reloj.isPending} onClick={() => window.confirm('¿Volver al corte inicial? Los niveles aprobados quedan en el histórico.') && reloj.mutate('reiniciar')}
                  className="min-h-8 rounded-md px-2.5 text-[13px] text-white/80 hover:text-white disabled:opacity-60">Reiniciar</button>
              </div>
            )}
            <Usuario nombre={yo?.nombre} roles={yo?.roles ?? []} salir={salir} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-[13px] text-white/75">
          <Reloj nombre="Corte operativo" valor={mes(c.corte_operativo, true)} ayuda="Datos, Seguridad, IA y Operación" />
          <Reloj nombre="Corte del plan" valor={mes(c.corte_plan, true)} ayuda="BSC ligado a hitos, plan y riesgos residuales" />
          <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
          <span className={viejo ? 'text-[#ffb4aa]' : 'text-[#9fe0bd]'} title={c.documento_fuente}>
            {viejo ? '■ Datos desactualizados' : '● Datos al día'} <span className="text-white/55">· generados hace {dias} {dias === 1 ? 'día' : 'días'}, parámetros {c.version_parametros}</span>
          </span>
          {c.pausado === 'si' && <span className="rounded bg-[#b7791f] px-2 py-0.5 text-xs font-semibold text-white">Reloj en pausa</span>}
          <span className="ml-auto flex items-center gap-3" aria-label="Indicadores por estado">
            {(['rojo', 'amarillo', 'verde'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5" title={`${n[s]} ${SEMAFORO[s].texto.toLowerCase()}`}>
                <span aria-hidden="true" className={{ rojo: 'text-[#ff8a7d]', amarillo: 'text-[#f2c46b]', verde: 'text-[#7fd6a8]' }[s]}>{SEMAFORO[s].forma}</span>
                <span className="cifra text-[15px] font-semibold text-white">{n[s]}</span>
                <span className="sr-only">{SEMAFORO[s].texto}</span>
              </span>
            ))}
          </span>
        </div>

        <nav aria-label="Pestañas del tablero" className="-mx-3 flex items-end overflow-x-auto">
          {PESTANAS.map((p) => (
            <NavLink key={p.a} to={p.a} end={p.a === '/'} className={pestana}>
              {p.texto}
              {p.a === '/cobit' && pendientes(D).length > 0 && <Insignia n={pendientes(D).length} titulo="cambios de nivel por aprobar" />}
            </NavLink>
          ))}
          <span className="flex-1" />
          {esAprobador && (
            <NavLink to="/aprobaciones" className={pestana}>Mis aprobaciones{porDecidir > 0 && <Insignia n={porDecidir} titulo="esperan tu decisión" fuerte />}</NavLink>
          )}
          {esAdmin && <NavLink to="/admin" className={pestana}>Administración</NavLink>}
        </nav>
      </div>
      {/* Pulso del tablero */}
      <div className="flex h-1.5 w-full" role="img" aria-label={`${n.rojo} fuera de meta, ${n.amarillo} en riesgo, ${n.verde} en meta, ${n.gris} sin dato`}>
        <div className="bg-[#e05a4b]" style={{ flex: n.rojo / total }} />
        <div className="bg-[#e3a43a]" style={{ flex: n.amarillo / total }} />
        <div className="bg-[#3fae74]" style={{ flex: n.verde / total }} />
        <div className="bg-white/25" style={{ flex: n.gris / total }} />
      </div>
    </header>
  )
}

function Marca() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#fff" fillOpacity=".08" />
      <rect x="7" y="19" width="4" height="6" rx="1" fill="#e05a4b" /><rect x="14" y="13" width="4" height="12" rx="1" fill="#e3a43a" /><rect x="21" y="7" width="4" height="18" rx="1" fill="#3fae74" />
    </svg>
  )
}

function Reloj({ nombre, valor, ayuda }: { nombre: string; valor: string; ayuda: string }) {
  return (
    <span className="flex items-baseline gap-2" title={ayuda}>
      <span>{nombre}</span>
      <span className="cifra text-[15px] font-semibold capitalize text-white">{valor}</span>
    </span>
  )
}

function Insignia({ n, titulo, fuerte = false }: { n: number; titulo: string; fuerte?: boolean }) {
  return <span title={`${n} ${titulo}`} className={`cifra rounded-full px-2 text-xs font-semibold ${fuerte ? 'bg-[#e3a43a] text-tinta' : 'bg-white/15 text-white'}`}>{n}</span>
}

function Selector({ etiqueta, valor, opciones, todos, cambiar }: { etiqueta: string; valor: string; opciones: string[]; todos: string; cambiar: (v: string) => void }) {
  return (
    <label className="relative">
      <span className="sr-only">{etiqueta}</span>
      <select value={valor} onChange={(e) => cambiar(e.target.value)}
        className={`min-h-9 rounded-lg border px-2.5 text-[13px] ${valor ? 'border-white bg-white text-tinta' : 'border-white/20 bg-transparent text-white/85'} [&>option]:text-tinta`}>
        <option value="">{todos}</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function Buscador() {
  const { D, abrirIndicador } = useTablero()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLInputElement>(null)
  const resultados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return D.indicadores.filter((i) => i.principal && (i.nombre.toLowerCase().includes(s) || i.responsable.toLowerCase().includes(s) || i.id.toLowerCase() === s)).slice(0, 10)
  }, [q, D])
  return (
    <div className="relative">
      <label className="sr-only" htmlFor="buscar">Buscar indicador o responsable</label>
      <input id="buscar" ref={caja} type="search" value={q} placeholder="Buscar indicador o responsable" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="min-h-9 w-60 rounded-lg border border-white/20 bg-white/8 px-3 text-[13px] text-white placeholder:text-white/50 focus:bg-white focus:text-tinta focus:placeholder:text-tinta-3" />
      {abierto && q.trim().length >= 2 && (
        <div className="absolute right-0 top-11 z-40 max-h-80 w-80 overflow-y-auto rounded-xl border border-linea bg-papel p-1 text-tinta shadow-[0_12px_32px_rgba(16,32,51,0.18)]">
          {resultados.length === 0 && <p className="m-0 px-3 py-2 text-sm text-tinta-2">Ningún indicador con «{q}».</p>}
          {resultados.map((i) => (
            <button key={i.id} type="button" onMouseDown={() => { abrirIndicador(i.id); setQ(''); setAbierto(false) }}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-lienzo">
              <span className="text-[13px] font-medium">{i.nombre}</span>
              <span className="text-xs text-tinta-2">{i.responsable}, pestaña {i.pestana === 'Estrategia' ? 'Estrategia de TI' : i.pestana}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Usuario({ nombre, roles, salir }: { nombre?: string; roles: string[]; salir: () => void }) {
  const navegar = useNavigate()
  const ROL: Record<string, string> = { lector: 'Lector', aprobador: 'Aprobador', admin: 'Administrador' }
  const principal = roles.includes('admin') ? 'admin' : roles.includes('aprobador') ? 'aprobador' : 'lector'
  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-[13px] text-white/85 hover:text-white">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">{(nombre ?? '?').slice(0, 1)}</span>
        <span className="hidden max-w-36 truncate md:inline">{nombre}</span>
      </summary>
      <div className="absolute right-0 top-11 z-40 flex w-56 flex-col gap-1 rounded-xl border border-linea bg-papel p-2 text-tinta shadow-[0_12px_32px_rgba(16,32,51,0.18)]">
        <span className="px-2 pt-1 text-[13px] font-medium">{nombre}</span>
        <span className="px-2 pb-1 text-xs text-tinta-2">{ROL[principal]}</span>
        <button type="button" onClick={() => navegar('/cuenta')} className="rounded-lg px-2 py-2 text-left text-[13px] hover:bg-lienzo">Cambiar contraseña</button>
        <button type="button" onClick={salir} className="rounded-lg px-2 py-2 text-left text-[13px] hover:bg-lienzo">Cerrar sesión</button>
      </div>
    </details>
  )
}
