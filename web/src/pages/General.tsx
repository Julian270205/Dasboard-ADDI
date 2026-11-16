import { useNavigate } from 'react-router-dom'
import { FilaIndicador } from '../components/Indicadores'
import { Radar } from '../components/Graficas'
import { Barra, EtiquetaDato, SEMAFORO, Seccion, Tabla, Tarjeta } from '../components/ui'
import { fecha, num, promedio } from '../lib/formato'
import {
  LISTA_DOMINIOS, PERSPECTIVAS, autoevaluacion, cuenta, evaluados, nivelDominio, objetivoDominio, pendientes, perspectivaDe, principales, useTablero,
} from '../lib/tablero'

const RESUMENES = [
  { titulo: 'Datos', desc: 'Madurez, dueños y calidad', a: '/datos', ids: ['19', 'PI2.2', '21', '22'], n: '#19 a 22' },
  { titulo: 'Seguridad y privacidad', desc: 'Cifrado, incidentes y certificaciones', a: '/seguridad', ids: ['23', '27a', 'PI1.1', '25b'], n: '#23 a 28' },
  { titulo: 'Inteligencia artificial', desc: 'Crédito, antifraude y asistente', a: '/ia', ids: ['31', '32', '34', '38'], n: '#29 a 38' },
  { titulo: 'Plan de acción y riesgos', desc: 'Presupuesto, avance y entrega de valor', a: '/estrategia#plan', ids: ['39', '40', 'C2.1', 'AC3.2'], n: '#39 a 46' },
  { titulo: 'Operación y costo', desc: 'Plataforma, entrega y presupuesto', a: '/operacion', ids: ['47', '51', '52', '53'], n: '#47 a 57' },
]

export default function General() {
  const { D, abrirIndicador } = useTablero()
  const navegar = useNavigate()
  const P = principales(D), ev = evaluados(D), au = autoevaluacion(D)
  const global = promedio(ev.map((c) => c.nivel as number)), objetivo = promedio(ev.map((c) => c.nivel_objetivo))
  const n1 = ev.filter((c) => c.nivel === 1).length

  return (
    <>
      <Seccion titulo="Resumen ejecutivo" elementos="#7, #8 y #11"
        descripcion="Qué tan preparada está TI para sostener a Addi como compañía de financiamiento, y dónde está el problema hoy.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
          <Tarjeta titulo="Madurez global de TI" descripcion="Diagnóstico de Control (COBIT 2019) y autoevaluación" etiqueta="Estimado" elementos="#7"
            pie="Los niveles bajos en procesos no verificables son un piso, no un veredicto: el análisis se hizo como observador externo.">
            <div className="flex items-end gap-3">
              <span className="cifra text-[64px] font-semibold leading-[0.9]">{num(global, 2)}</span>
              <span className="pb-1.5 text-[13px] text-tinta-2">de 5, promedio de {ev.length} procesos evaluados</span>
            </div>
            <Barra valor={global} max={5} meta={objetivo} etiqueta={`Madurez ${num(global, 2)} de 5; nivel objetivo ${num(objetivo, 2)}`} />
            <div className="flex justify-between text-xs text-tinta-2"><span>0</span><span>Nivel objetivo {num(objetivo, 2)} (S5)</span><span>5</span></div>
            <div className="grid grid-cols-2 gap-3 border-t border-linea-2 pt-3 text-[13px]">
              <div><span className="block text-xs text-tinta-2">Autoevaluación</span><b className="cifra text-lg">Nivel {au.n}</b> <span className="text-tinta-2">{au.pts} de {au.max} puntos</span></div>
              <div><span className="block text-xs text-tinta-2">Procesos en nivel 1</span><b className="cifra text-lg">{n1}</b> <span className="text-tinta-2">de {ev.length}</span></div>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Madurez por dominio COBIT" descripcion="Nivel actual frente al nivel objetivo" etiqueta="Estimado" elementos="#8">
            <Radar ejes={LISTA_DOMINIOS} actual={LISTA_DOMINIOS.map((d) => nivelDominio(D, d))} objetivo={LISTA_DOMINIOS.map((d) => objetivoDominio(D, d))} />
          </Tarjeta>
          <Tarjeta titulo="Semáforos por perspectiva del BSC" descripcion="Indicadores del BSC en el corte de su reloj" elementos="#11"
            pie={<>Todo el tablero: {cuenta(P, 'verde')} en meta, {cuenta(P, 'amarillo')} en riesgo y {cuenta(P, 'rojo')} fuera de meta, de {P.length} indicadores.</>}>
            <div className="flex flex-col gap-3.5">
              {PERSPECTIVAS.map((p) => {
                const l = P.filter((i) => perspectivaDe(D, i) === p)
                const c = { verde: cuenta(l, 'verde'), amarillo: cuenta(l, 'amarillo'), rojo: cuenta(l, 'rojo') }
                return (
                  <div key={p} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-medium">{p}</span>
                      <span className="tnum flex gap-2.5 text-xs">
                        {(['verde', 'amarillo', 'rojo'] as const).map((s) => <span key={s} className={SEMAFORO[s].color}><span aria-hidden="true">{SEMAFORO[s].forma}</span> {c[s]}<span className="sr-only"> {SEMAFORO[s].texto}</span></span>)}
                      </span>
                    </div>
                    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-linea-2" aria-hidden="true">
                      {(['verde', 'amarillo', 'rojo'] as const).filter((s) => c[s] > 0).map((s) => <div key={s} className={SEMAFORO[s].fondo} style={{ flex: c[s] }} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion titulo="Qué requiere una decisión" elementos="#9 y #10"
        descripcion="Una decisión por alerta, con responsable y fecha límite (corte + 15 días). Haz clic en una fila para abrir el indicador.">
        <Tarjeta>
          {D.alertas.length === 0 ? <p className="m-0 text-sm text-tinta-2">Sin alertas en este corte.</p> : (
            <Tabla columnas={['Qué pasa', 'Impacto', 'Qué decidir', 'Responsable', 'Fecha límite', 'Dato']} minimo={900}>
              {D.alertas.map((a) => (
                <tr key={a.indicador + a.corte} onClick={() => abrirIndicador(a.indicador)} className="cursor-pointer hover:bg-lienzo">
                  <td className="max-w-md"><span className="mr-1 font-semibold text-rojo" aria-hidden="true">■</span>{a.que_pasa}</td>
                  <td className="text-tinta-2">{a.impacto}</td>
                  <td>{a.que_decidir}</td>
                  <td className="whitespace-nowrap">{a.responsable}</td>
                  <td className="tnum whitespace-nowrap">{fecha(a.fecha_limite)}</td>
                  <td><EtiquetaDato e={a.etiqueta} /></td>
                </tr>
              ))}
            </Tabla>
          )}
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Lo más importante por tema" descripcion="Un resumen de cada pestaña; el detalle vive dentro de cada una.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {RESUMENES.map((r) => (
            <Tarjeta key={r.titulo} titulo={r.titulo} descripcion={r.desc} elementos={r.n}
              pie={<button type="button" onClick={() => navegar(r.a)} className="font-medium text-acento hover:underline">Abrir {r.titulo.toLowerCase()}</button>}>
              <div className="flex flex-col">{r.ids.map((id) => <FilaIndicador key={id} id={id} />)}</div>
            </Tarjeta>
          ))}
          <Tarjeta titulo="Gobierno de TI con COBIT 2019" descripcion="Resumen de la pestaña COBIT" etiqueta="Estimado" elementos="#58 a 71"
            pie={<button type="button" onClick={() => navegar('/cobit')} className="font-medium text-acento hover:underline">Abrir COBIT</button>}>
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
              <dt>Nivel medio de capacidad</dt><dd className="cifra m-0 font-semibold">{num(global, 2)}</dd>
              <dt>Objetivos en nivel 1</dt><dd className="cifra m-0 font-semibold">{n1} de {ev.length}</dd>
              <dt>Objetivos sin nivel evaluado</dt><dd className="cifra m-0 font-semibold">{D.cobit.length - ev.length} de {D.cobit.length}</dd>
              <dt>Cambios de nivel por aprobar</dt><dd className="cifra m-0 font-semibold">{pendientes(D).length}</dd>
            </dl>
          </Tarjeta>
        </div>
      </Seccion>
    </>
  )
}
