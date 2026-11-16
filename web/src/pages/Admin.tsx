import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Aviso, Boton, Seccion, Tabla, Tarjeta } from '../components/ui'
import { ApiError, api, enviar } from '../lib/api'
import { fecha, mes } from '../lib/formato'
import { DOMINIOS, LISTA_DOMINIOS } from '../lib/tablero'
import { textoN8n, type EstadoN8n } from '../lib/tipos'
import { useAncla } from './comun'

interface Reloj { configurado: boolean; corte_operativo: string; corte_plan: string; pausado: boolean; corrida: string; version_parametros: string; fin_horizonte: string; ejecuciones: { fecha: string; resultado: string }[] }
interface Usuario { id: number; nombre: string; cargo: string | null; correo: string; activo: boolean; roles: string[]; ultimo_acceso: string | null }
interface Aprobador { dominio: string; titular_id: number | null; suplente_id: number | null }
interface Evento { id: number; usuario: string | null; accion: string; entidad: string; entidad_id: string | null; fecha: string; ip: string | null }

export default function Admin() {
  useAncla()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  return (
    <>
      {aviso && <Aviso tipo={aviso.ok ? 'ok' : 'error'}>{aviso.texto}</Aviso>}
      <Reloj avisar={setAviso} />
      <N8n />
      <Aprobadores avisar={setAviso} />
      <Usuarios avisar={setAviso} />
      <Auditoria />
    </>
  )
}

type Avisar = (a: { ok: boolean; texto: string }) => void
const fallo = (e: unknown) => (e instanceof ApiError ? e.message : 'No se pudo completar la acción.')

function Reloj({ avisar }: { avisar: Avisar }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'reloj'], queryFn: () => api<Reloj>('/admin/reloj') })
  const pausa = useMutation({
    mutationFn: (p: boolean) => enviar('/admin/reloj/pausa', { pausado: p }),
    onSuccess: () => { qc.invalidateQueries(); avisar({ ok: true, texto: 'Listo.' }) }, onError: (e) => avisar({ ok: false, texto: fallo(e) }),
  })
  const r = q.data
  return (
    <Seccion titulo="Reloj de la demo" descripcion="Avanzar un mes solo destapa el mes siguiente de las series ya generadas y corre alertas y propuestas. Los botones están en la barra superior; n8n hace lo mismo con su cron mensual.">
      <Tarjeta pie="Cada avance tiene una llave única: si n8n y un administrador lo piden al mismo tiempo, el mes avanza una sola vez.">
        {r?.configurado ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Caja n="Corte operativo" v={mes(r.corte_operativo, true)} />
            <Caja n="Corte del plan" v={mes(r.corte_plan, true)} />
            <Caja n="Corrida de la demo" v={r.corrida} />
            <Caja n="Parámetros" v={r.version_parametros} />
            <div className="flex flex-col gap-1.5"><span className="text-xs text-tinta-2">Cron de n8n</span>
              <Boton onClick={() => pausa.mutate(!r.pausado)} disabled={pausa.isPending}>{r.pausado ? 'Reanudar' : 'Pausar'}</Boton></div>
          </div>
        ) : <Aviso tipo="atencion">Aún no hay datos: corre <code>python -m app.cli cargar-datos</code>.</Aviso>}
        {r?.ejecuciones?.length ? (
          <Tabla columnas={['Cuándo', 'Resultado']} minimo={520} compacta>
            {r.ejecuciones.map((e, k) => <tr key={k}><td className="tnum whitespace-nowrap">{new Date(e.fecha).toLocaleString('es-CO')}</td><td className="text-tinta-2">{e.resultado}</td></tr>)}
          </Tabla>
        ) : null}
      </Tarjeta>
    </Seccion>
  )
}

function N8n() {
  const q = useQuery({ queryKey: ['admin', 'n8n'], queryFn: () => api<EstadoN8n>('/admin/n8n') })
  const e = q.data, t = textoN8n(e)
  const cuando = (f?: string) => (f ? new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca')
  return (
    <Seccion id="n8n" titulo="Conexión con n8n" descripcion="n8n corre el corte del día 1 de cada mes y envía los correos con los botones Aprobar y Rechazar. Se revisa cada minuto.">
      <Tarjeta pie={e?.flujo === 'inactivo' ? 'El flujo está importado pero apagado: ábrelo en n8n (http://localhost:5678 o por túnel SSH en la EC2) y actívalo o publícalo.'
        : e?.servicio !== 'en_linea' ? 'La API no alcanza a n8n por la red de Docker. Revisa `docker compose ps` y `docker compose logs n8n`.'
        : 'Si el flujo no aparece activo, impórtalo desde n8n/corte_y_avisos_cobit.json y asígnale la credencial SMTP.'}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-0.5"><span className="text-xs text-tinta-2">Estado</span>
            <span className={`text-[15px] font-semibold ${t.ok ? 'text-verde' : 'text-rojo'}`}><span aria-hidden="true">{t.ok ? '● ' : '■ '}</span>{t.texto}</span></div>
          <Caja n="Servicio" v={{ en_linea: 'En línea', con_error: 'Con error', sin_respuesta: 'Sin respuesta' }[e?.servicio ?? 'sin_respuesta']} />
          <Caja n="Último corte del cron" v={cuando(e?.ultimo_corte?.fecha)} />
          <Caja n="Últimos correos pedidos" v={e?.ultimos_avisos ? `${cuando(e.ultimos_avisos.fecha)} (${e.ultimos_avisos.resultado.correos})` : 'Nunca'} />
        </div>
      </Tarjeta>
    </Seccion>
  )
}

function Caja({ n, v }: { n: string; v: string }) {
  return <div className="flex flex-col gap-0.5"><span className="text-xs text-tinta-2">{n}</span><span className="cifra text-lg font-semibold first-letter:uppercase">{v}</span></div>
}

function Aprobadores({ avisar }: { avisar: Avisar }) {
  const qc = useQueryClient()
  const usuarios = useQuery({ queryKey: ['admin', 'usuarios'], queryFn: () => api<Usuario[]>('/admin/usuarios') })
  const aprob = useQuery({ queryKey: ['admin', 'aprobadores'], queryFn: () => api<Aprobador[]>('/admin/aprobadores') })
  const fijar = useMutation({
    mutationFn: (a: Aprobador) => enviar(`/admin/aprobadores/${a.dominio}`, { titular_id: a.titular_id, suplente_id: a.suplente_id }, 'PUT'),
    onSuccess: () => { qc.invalidateQueries(); avisar({ ok: true, texto: 'Aprobador actualizado.' }) }, onError: (e) => avisar({ ok: false, texto: fallo(e) }),
  })
  const candidatos = (usuarios.data ?? []).filter((u) => u.activo && u.roles.includes('aprobador'))
  return (
    <Seccion titulo="Quién aprueba cada dominio" descripcion="Decisión pendiente 1 de la Propuesta COBIT. El titular decide; el suplente entra si el titular no responde en 2 cortes. Deben ser personas distintas con rol aprobador.">
      <Tarjeta>
        <Tabla columnas={['Dominio', 'Titular', 'Suplente']} minimo={620}>
          {aprob.data?.map((a) => (
            <tr key={a.dominio}>
              <td><b>{a.dominio}</b><span className="block text-xs text-tinta-2">{DOMINIOS[a.dominio as keyof typeof DOMINIOS]}</span></td>
              {(['titular_id', 'suplente_id'] as const).map((campo) => (
                <td key={campo}>
                  <label className="sr-only" htmlFor={`${a.dominio}-${campo}`}>{campo === 'titular_id' ? 'Titular' : 'Suplente'} de {a.dominio}</label>
                  <select id={`${a.dominio}-${campo}`} value={a[campo] ?? ''} disabled={fijar.isPending}
                    onChange={(e) => fijar.mutate({ ...a, [campo]: e.target.value ? Number(e.target.value) : null })}
                    className="min-h-10 w-full rounded-lg border border-linea bg-papel px-2.5 text-[13px]">
                    <option value="">Sin asignar</option>
                    {candidatos.map((u) => <option key={u.id} value={u.id}>{u.nombre}{u.cargo ? `, ${u.cargo}` : ''}</option>)}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </Tabla>
        {aprob.data && LISTA_DOMINIOS.some((d) => !aprob.data?.find((a) => a.dominio === d)?.titular_id) &&
          <Aviso tipo="atencion">Hay dominios sin titular: sus propuestas quedan pendientes y nadie recibe el correo.</Aviso>}
      </Tarjeta>
    </Seccion>
  )
}

function Usuarios({ avisar }: { avisar: Avisar }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'usuarios'], queryFn: () => api<Usuario[]>('/admin/usuarios') })
  const [nuevo, setNuevo] = useState({ nombre: '', cargo: '', correo: '', rol: 'lector' })
  const [clave, setClave] = useState<{ correo: string; clave: string } | null>(null)
  const crear = useMutation({
    mutationFn: () => enviar<Usuario & { contrasena_temporal: string }>('/admin/usuarios', {
      nombre: nuevo.nombre, cargo: nuevo.cargo || null, correo: nuevo.correo, roles: nuevo.rol === 'lector' ? ['lector'] : [nuevo.rol, 'lector'] }),
    onSuccess: (u) => { setClave({ correo: u.correo, clave: u.contrasena_temporal }); setNuevo({ nombre: '', cargo: '', correo: '', rol: 'lector' }); qc.invalidateQueries({ queryKey: ['admin'] }) },
    onError: (e) => avisar({ ok: false, texto: fallo(e) }),
  })
  const editar = useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: object }) => enviar(`/admin/usuarios/${id}`, datos, 'PATCH'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => avisar({ ok: false, texto: fallo(e) }),
  })
  const restablecer = useMutation({
    mutationFn: (u: Usuario) => enviar<{ contrasena_temporal: string }>(`/admin/usuarios/${u.id}/restablecer`).then((r) => ({ correo: u.correo, clave: r.contrasena_temporal })),
    onSuccess: setClave, onError: (e) => avisar({ ok: false, texto: fallo(e) }),
  })
  function enviarForm(e: FormEvent) { e.preventDefault(); crear.mutate() }
  const campo = 'min-h-10 rounded-lg border border-linea bg-papel px-3 text-[13.5px]'

  return (
    <Seccion titulo="Usuarios" descripcion="Lector ve el tablero; aprobador decide en sus dominios; administrador maneja el reloj, los usuarios y los aprobadores, pero no aprueba por serlo.">
      <Tarjeta>
        {clave && <Aviso tipo="ok">Contraseña temporal de {clave.correo}: <code className="font-semibold">{clave.clave}</code>. Compártela por un canal privado; no se vuelve a mostrar.</Aviso>}
        <form onSubmit={enviarForm} className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_1fr_1.2fr_150px_auto]">
          <input required minLength={2} placeholder="Nombre" aria-label="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={campo} />
          <input placeholder="Cargo (opcional)" aria-label="Cargo" value={nuevo.cargo} onChange={(e) => setNuevo({ ...nuevo, cargo: e.target.value })} className={campo} />
          <input required type="email" placeholder="Correo" aria-label="Correo" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} className={campo} />
          <select aria-label="Rol" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} className={campo}>
            <option value="lector">Lector</option><option value="aprobador">Aprobador</option><option value="admin">Administrador</option>
          </select>
          <button type="submit" disabled={crear.isPending} className="min-h-10 rounded-lg bg-acento px-4 text-[13.5px] font-semibold text-white disabled:opacity-60">Crear usuario</button>
        </form>
        <Tabla columnas={['Nombre', 'Correo', 'Roles', 'Último acceso', '']} minimo={760}>
          {q.data?.map((u) => (
            <tr key={u.id} className={u.activo ? '' : 'opacity-55'}>
              <td><b>{u.nombre}</b><span className="block text-xs text-tinta-2">{u.cargo}</span></td>
              <td>{u.correo}</td><td>{u.roles.join(', ')}</td>
              <td className="text-xs text-tinta-2">{u.ultimo_acceso ? fecha(u.ultimo_acceso) : 'Nunca'}</td>
              <td className="whitespace-nowrap text-right">
                <Boton variante="fantasma" onClick={() => restablecer.mutate(u)}>Restablecer contraseña</Boton>
                <Boton variante="fantasma" onClick={() => editar.mutate({ id: u.id, datos: { activo: !u.activo } })}>{u.activo ? 'Desactivar' : 'Activar'}</Boton>
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </Seccion>
  )
}

function Auditoria() {
  const q = useQuery({ queryKey: ['admin', 'auditoria'], queryFn: () => api<Evento[]>('/admin/auditoria?limite=40') })
  return (
    <Seccion titulo="Auditoría" descripcion="Cada inicio de sesión, decisión, cambio de usuario y movimiento del reloj. Solo se agrega; nadie la edita.">
      <Tarjeta>
        <Tabla columnas={['Cuándo', 'Quién', 'Acción', 'Sobre qué', 'IP']} minimo={640} compacta>
          {q.data?.map((a) => <tr key={a.id}><td className="tnum whitespace-nowrap">{new Date(a.fecha).toLocaleString('es-CO')}</td><td>{a.usuario ?? 'n8n'}</td><td>{a.accion.replaceAll('_', ' ')}</td><td className="text-tinta-2">{a.entidad} {a.entidad_id ?? ''}</td><td className="text-xs text-tinta-3">{a.ip}</td></tr>)}
        </Tabla>
      </Tarjeta>
    </Seccion>
  )
}
