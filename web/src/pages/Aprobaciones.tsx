import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Aviso, Boton, Dato, EtiquetaDato, EvidenciaChip, Seccion, Semaforo, Tarjeta } from '../components/ui'
import { ApiError, api, enviar } from '../lib/api'
import { fecha, mes, num } from '../lib/formato'
import { NIVELES } from '../lib/tablero'
import type { PropuestaDetalle } from '../lib/tipos'

/**
 * Pasos 4 y 5 de la Propuesta COBIT. Aquí aterrizan los botones del correo (/aprobaciones/:id?decision=aprobar).
 * Abrir el enlace no decide nada: hay que confirmar con la sesión iniciada, y la API verifica el rol en el dominio.
 */
export default function Aprobaciones() {
  const { id } = useParams()
  const navegar = useNavigate()
  const lista = useQuery({ queryKey: ['aprobaciones'], queryFn: () => api<{ pendientes: PropuestaDetalle[]; decididas: PropuestaDetalle[] }>('/aprobaciones') })
  const elegida = id ?? (lista.data?.pendientes[0] ? String(lista.data.pendientes[0].id) : undefined)
  const pendientes = lista.data?.pendientes ?? []

  return (
    <Seccion titulo="Mis aprobaciones" elementos="#70 y #71"
      descripcion="Cambios de nivel de los dominios donde eres titular o suplente. Un cambio aprobado crea una versión nueva; la anterior no se borra.">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[340px_1fr]">
        <nav aria-label="Propuestas" className="flex flex-col gap-2">
          {lista.isLoading && <p className="text-sm text-tinta-2">Cargando…</p>}
          {!lista.isLoading && pendientes.length === 0 && <Aviso>No tienes cambios pendientes. Cuando el flujo mensual proponga uno en tus dominios, te llegará un correo.</Aviso>}
          {pendientes.map((p) => <Item key={p.id} p={p} activo={String(p.id) === elegida} ir={() => navegar(`/aprobaciones/${p.id}`)} />)}
          {(lista.data?.decididas.length ?? 0) > 0 && <span className="mt-3 text-xs font-medium text-tinta-2">Decididas recientemente</span>}
          {lista.data?.decididas.map((p) => <Item key={p.id} p={p} activo={String(p.id) === elegida} ir={() => navegar(`/aprobaciones/${p.id}`)} />)}
        </nav>
        {elegida ? <Confirmacion key={elegida} id={elegida} /> : <Tarjeta><p className="m-0 text-sm text-tinta-2">Elige una propuesta de la lista.</p></Tarjeta>}
      </div>
    </Seccion>
  )
}

function Item({ p, activo, ir }: { p: PropuestaDetalle; activo: boolean; ir: () => void }) {
  const sube = (p.nivel_propuesto ?? 0) > (p.nivel_actual ?? 0)
  return (
    <button type="button" onClick={ir} aria-current={activo}
      className={`flex flex-col gap-0.5 rounded-xl bg-papel p-3.5 text-left ${activo ? 'border-2 border-tinta' : 'border border-linea hover:border-tinta-3'}`}>
      <span className="flex items-center justify-between gap-2 text-[14px] font-semibold">{p.objetivo}<span className={`cifra ${sube ? 'text-verde' : 'text-rojo'}`}>{p.nivel_actual} → {p.nivel_propuesto}</span></span>
      <span className="truncate text-[13px] text-tinta-2">{p.nombre}</span>
      <span className="text-xs text-tinta-3">{p.estado === 'pendiente' ? (p.puede_decidir ? `Corte ${mes(p.corte)}, decides como ${p.rol}` : p.explicacion) : `${p.estado[0].toUpperCase()}${p.estado.slice(1)}`}</span>
    </button>
  )
}

function Confirmacion({ id }: { id: string }) {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const intencion = params.get('decision') === 'rechazar' ? 'rechazar' : params.get('decision') === 'aprobar' ? 'aprobar' : null
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const motivoRef = useRef<HTMLTextAreaElement>(null)
  const aprobarRef = useRef<HTMLButtonElement>(null)
  const q = useQuery({ queryKey: ['aprobacion', id], queryFn: () => api<PropuestaDetalle>(`/aprobaciones/${id}`), retry: false })
  const decidir = useMutation({
    mutationFn: (accion: 'aprobar' | 'rechazar') => enviar<{ mensaje: string }>(`/aprobaciones/${id}/${accion}`, { motivo: motivo || null }),
    onSuccess: (r) => { setHecho(r.mensaje); setError(''); setParams((x) => { x.delete('decision'); return x }, { replace: true }); qc.invalidateQueries() },
    onError: (e) => { setError(e instanceof ApiError ? e.message : 'No se pudo guardar la decisión.'); qc.invalidateQueries({ queryKey: ['aprobacion', id] }) },
  })
  useEffect(() => {
    if (!q.data?.puede_decidir) return
    if (intencion === 'rechazar') motivoRef.current?.focus()
    if (intencion === 'aprobar') aprobarRef.current?.focus()
  }, [q.data, intencion])

  if (q.isLoading) return <Tarjeta><p className="m-0 text-sm text-tinta-2">Cargando la propuesta…</p></Tarjeta>
  if (q.isError || !q.data) return <Aviso tipo="error">{q.error instanceof ApiError ? q.error.message : 'No se pudo abrir la propuesta.'}</Aviso>
  const p = q.data
  const sube = (p.nivel_propuesto ?? 0) > (p.nivel_actual ?? 0)

  return (
    <article aria-labelledby="titulo-propuesta" className="flex flex-col gap-5 rounded-xl border border-linea bg-papel p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-tinta-2">Dominio {p.dominio}, corte del plan {mes(p.corte, true)}</span>
          <h3 id="titulo-propuesta" className="m-0 text-[22px] font-semibold leading-tight">{p.objetivo} {p.nombre}</h3>
        </div>
        <div className="flex items-center gap-2"><EvidenciaChip e={p.etiqueta_evidencia} /><EtiquetaDato e={p.etiqueta} /></div>
      </header>

      <div className="flex flex-wrap items-center gap-6">
        <Nivel titulo="Nivel actual" n={p.nivel_actual} />
        <span aria-hidden="true" className="text-3xl text-tinta-3">→</span>
        <Nivel titulo="Nivel propuesto" n={p.nivel_propuesto} resaltado={sube ? 'verde' : 'rojo'} />
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato nombre="Regla" valor={<span className="text-[15px]">{p.regla}</span>} />
          <Dato nombre="Nivel objetivo (S5)" valor={p.nivel_objetivo ?? '—'} />
          <Dato nombre="Importancia y desempeño" valor={`${p.importancia ?? '—'} y ${p.desempeno ?? '—'}`} nota="desempeño 1 = muy bien" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h4 className="m-0 text-sm font-semibold">Evidencia del flujo</h4>
        <p className="m-0 text-[14px] leading-relaxed">{p.evidencia}</p>
      </div>

      {p.vinculos && (
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-lienzo p-4 text-[13px] md:grid-cols-3">
          <div className="flex flex-col gap-1"><b>Indicadores ligados</b>{p.vinculos.indicadores.map((i) => <span key={i.id} className="flex items-center gap-2"><Semaforo s={i.semaforo} corto />{i.nombre} <span className="cifra text-tinta-2">{num(i.valor)}</span></span>)}{!p.vinculos.indicadores.length && <span className="text-tinta-2">Ninguno</span>}</div>
          <div className="flex flex-col gap-1"><b>Acciones del plan</b>{p.vinculos.acciones.map((a) => <span key={a.codigo}><b>{a.codigo}</b> {a.accion} <span className="text-tinta-2">({mes(a.inicio)} a {mes(a.fin)})</span></span>)}{!p.vinculos.acciones.length && <span className="text-tinta-2">Ninguna</span>}</div>
          <div className="flex flex-col gap-1"><b>Riesgos</b>{p.vinculos.riesgos.map((r) => <span key={r.id}><b>{r.id}</b> {r.riesgo}</span>)}{!p.vinculos.riesgos.length && <span className="text-tinta-2">Ninguno</span>}</div>
        </div>
      )}

      {p.etiqueta === 'Simulado' && <Aviso tipo="atencion"><b>Etiqueta heredada: simulado.</b> La propuesta nace de mediciones simuladas; aprobada, no cuenta como evidencia verificada [V].</Aviso>}

      {hecho && <Aviso tipo="ok">{hecho} <Link to="/cobit#cambios" className="font-medium">Ver el historial en COBIT</Link></Aviso>}

      {p.estado !== 'pendiente' ? (
        <Aviso>Esta propuesta está <b>{p.estado}</b>{p.aprobador ? ` por ${p.aprobador}` : ''}{p.fecha_decision ? ` el ${fecha(p.fecha_decision)}` : ''}.{p.motivo_rechazo ? ` Motivo: ${p.motivo_rechazo}` : ''}</Aviso>
      ) : !p.puede_decidir ? (
        <Aviso tipo="atencion">{p.explicacion}</Aviso>
      ) : (
        <div className="flex flex-col gap-3 border-t border-linea pt-5">
          <span className="text-[13px] text-tinta-2">{p.explicacion} Tu nombre quedará en el historial.</span>
          <label htmlFor="motivo" className="text-sm font-semibold">Comentario o motivo <span className="font-normal text-tinta-2">(obligatorio para rechazar)</span></label>
          <textarea id="motivo" ref={motivoRef} rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); setError('') }}
            className="rounded-lg border border-linea px-3 py-2.5 text-[14px] focus:border-acento" />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="flex flex-wrap justify-end gap-3">
            <Boton variante="peligro" disabled={decidir.isPending}
              onClick={() => (motivo.trim() ? decidir.mutate('rechazar') : (setError('Escribe el motivo antes de rechazar.'), motivoRef.current?.focus()))}>
              {intencion === 'rechazar' ? 'Confirmar rechazo' : 'Rechazar'}
            </Boton>
            <button ref={aprobarRef} type="button" disabled={decidir.isPending} onClick={() => decidir.mutate('aprobar')}
              className="inline-flex min-h-10 items-center rounded-lg bg-verde px-5 text-[14px] font-semibold text-white hover:bg-[#186a43] disabled:opacity-50">
              {intencion === 'aprobar' ? 'Confirmar aprobación' : 'Aprobar cambio'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function Nivel({ titulo, n, resaltado }: { titulo: string; n: number | null; resaltado?: 'verde' | 'rojo' }) {
  const color = resaltado === 'verde' ? 'border-verde bg-verde/5 text-verde' : resaltado === 'rojo' ? 'border-rojo bg-rojo/5 text-rojo' : 'border-linea bg-lienzo'
  return (
    <div className={`flex min-w-28 flex-col items-center rounded-xl border px-5 py-3 ${color}`}>
      <span className="text-xs">{titulo}</span>
      <span className="cifra text-[40px] font-semibold leading-none">{n ?? '—'}</span>
      <span className="text-xs">{n != null ? NIVELES[n] : ''}</span>
    </div>
  )
}
