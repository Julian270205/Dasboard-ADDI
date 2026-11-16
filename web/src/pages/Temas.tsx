import { Indicadores } from '../components/Indicadores'
import { LINEA_PRINCIPAL, Linea, SERIES } from '../components/Graficas'
import { Barra, Seccion, Tabla, Tarjeta } from '../components/ui'
import { fecha, num } from '../lib/formato'
import { useTablero } from '../lib/tablero'
import { useAncla } from './comun'

const ultimo = (s: [string, number, unknown][] | null | undefined) => (s && s.length ? Number(s[s.length - 1][1]) : null)
const puntos = (s: [string, number, unknown][] | null | undefined) => (s ?? []).map((p) => [p[0], +p[1]] as [string, number])

function Areas({ ids, meta }: { ids: string[]; meta: number }) {
  const { IND } = useTablero()
  return (
    <div className="flex flex-col gap-3.5">
      {ids.map((id) => {
        const i = IND[id], v = ultimo(i?.serie)
        if (!i) return null
        return (
          <div key={id} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]"><span>{i.nombre.split('· ')[1] ?? i.nombre}</span><b className="cifra">{num(v, 1)}</b></div>
            <Barra valor={v ?? 0} max={5} meta={meta} etiqueta={`${i.nombre}: ${num(v, 1)} de 5, meta ${meta}`} />
          </div>
        )
      })}
    </div>
  )
}

export function Datos() {
  useAncla()
  const { IND } = useTablero()
  const i22 = IND['22']
  return (
    <>
      <Seccion titulo="Gobierno de datos" elementos="#19 a 22" descripcion="Si Addi puede confiar en los datos que alimentan el crédito y los reportes a la SFC.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Madurez en el manejo de datos por área" descripcion="Escala 1 a 5; sube 0,1 por trimestre mientras la acción S-04 está activa" etiqueta="Estimado" elementos="#19"
            pie="La línea vertical marca la meta (3). Ancla: APO14 en el diagnóstico de sensibilización; APO14 no tiene nivel en el Diagnóstico de Control.">
            <Areas ids={['19a', '19b', '19c', '19d']} meta={3} />
          </Tarjeta>
          {i22 && (
            <Tarjeta titulo="Reportes a la SFC que cuadran" descripcion="Bajan en los meses de cierre trimestral" etiqueta={i22.estado?.etiqueta} elementos="#22">
              <Linea titulo="Reportes a la SFC que cuadran" unidad="%" meta={i22.estado?.meta} series={[{ nombre: i22.nombre, color: LINEA_PRINCIPAL, puntos: puntos(i22.serie) }]} />
            </Tarjeta>
          )}
        </div>
      </Seccion>
      <Seccion titulo="Indicadores" descripcion="Haz clic en una tarjeta para ver la ficha, la serie y la meta por año.">
        <Indicadores ids={['19', 'PI2.2', '21', '22']} />
      </Seccion>
    </>
  )
}

export function Seguridad() {
  useAncla()
  const { D } = useTablero()
  return (
    <>
      <Seccion titulo="Protección de la información" elementos="#23 a 26" descripcion="Cifrado, accesos, derechos de los titulares (Ley 1581 de 2012 y Ley 1266 de 2008) y riesgo legal ante la SIC.">
        <Indicadores ids={['23', '24a', '24b', '25b', '26', 'F1.3']} />
      </Seccion>
      <Seccion titulo="Incidentes y respaldo formal" elementos="#27 y #28" descripcion="Clave por el incidente de marzo de 2026: solo entra lo público, sin cifras inventadas.">
        <Indicadores ids={['27a', '27b', 'F1.2', 'PI1.1', 'PI1.2', 'AC2.1']} />
      </Seccion>
      <Seccion titulo="Calendario de eventos" descripcion="Fechas con efecto conocido sobre la carga y los reportes (impulsor 1 del motor de negocio).">
        <Tarjeta pie="Pendiente del equipo: confirmar los plazos exactos de la Ley 1581 y el umbral de aviso a la SFC.">
          <Tabla columnas={['Fecha', 'Evento', 'Tipo', 'Fuente']} minimo={620} compacta>
            {(D.calendario ?? []).map((c) => (
              <tr key={c.fecha + c.evento}><td className="tnum whitespace-nowrap">{fecha(c.fecha)}</td><td>{c.evento}</td><td className="text-tinta-2">{c.tipo}</td><td className="text-xs text-tinta-2">{c.fuente}</td></tr>
            ))}
          </Tabla>
        </Tarjeta>
      </Seccion>
    </>
  )
}

export function IA() {
  useAncla()
  const { D, IND } = useTablero()
  const v = (id: string) => Number(IND[id]?.estado?.valor)
  const falta: string[] = []
  if (v('32') >= 0.1) falta.push('PSI ≥ 0,10')
  if (v('31') < 0.78) falta.push('AUC < 0,78')
  if (IND['33']?.estado?.semaforo !== 'verde') falta.push('correcciones fuera del rango sano')
  if (v('35') < 95) falta.push('explicación < 95 %')
  const scoring = v('32') > 0.25 || v('31') < 0.74 ? 'No' : falta.length ? 'Con condiciones' : 'Sí'
  const decision: Record<string, [string, string]> = {
    scoring: [scoring, falta.join(', ') || 'Cumple las cuatro reglas'],
    antifraude: ['Con condiciones', 'Sin métricas propias en el catálogo: falta su ficha'],
    llm: ['Con condiciones', 'En piloto: falta la política de uso aprobada (S-06)'],
  }
  const color: Record<string, string> = { 'Sí': 'text-verde', 'Con condiciones': 'text-ambar', No: 'text-rojo' }
  const forma: Record<string, string> = { 'Sí': '●', 'Con condiciones': '▲', No: '■' }
  return (
    <>
      <Seccion titulo="Modelos de IA" elementos="#29, #30 y #37" descripcion="Qué IA usa Addi, si puede salir a producción, qué le falta y qué no tiene permitido hacer.">
        <Tarjeta etiqueta="Simulado" pie="Regla (#30): Sí si PSI < 0,10, AUC ≥ 0,78, correcciones en rango y explicación ≥ 95 %. No si PSI > 0,25 o AUC < 0,74. En otro caso, con condiciones. Hereda la etiqueta simulado.">
          <Tabla columnas={['Modelo', 'Riesgo', 'Estado', '¿Puede salir a producción?', 'Qué le falta', 'Apagado rápido', 'Lo que no tiene permitido', 'Dueño']} minimo={1100}>
            {D.modelos_ia.map((m) => {
              const [d, q] = decision[m.modelo_id] ?? ['Con condiciones', '—']
              return (
                <tr key={m.modelo_id}>
                  <td><b>{m.nombre}</b><span className="block text-xs text-tinta-2">{m.ancla}</span></td>
                  <td>{m.riesgo}</td><td>{m.estado}</td>
                  <td><b className={color[d]}><span aria-hidden="true">{forma[d]}</span> {d}</b></td>
                  <td className="text-tinta-2">{q}</td><td>{m.apagado_rapido ? 'Sí' : 'No'}</td>
                  <td><ul className="m-0 list-disc pl-4 text-xs">{m.usos_no_permitidos.split(' · ').map((u) => <li key={u}>{u}</li>)}</ul></td>
                  <td>{m.dueno}<span className="block text-xs text-tinta-2">Revisión {fecha(m.proxima_revision)}</span></td>
                </tr>
              )
            })}
          </Tabla>
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Modelo de crédito" elementos="#31 a 36" descripcion="Las relaciones entre indicadores (un PSI alto baja el AUC) son reglas del simulador, no hallazgos.">
        <Indicadores ids={['31', '32', '33', '34', '35', '36']} />
      </Seccion>
      <Seccion titulo="Gobierno de la IA" elementos="#38 y PI2.1">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Tarjeta titulo="Madurez de IA por dimensión" descripcion="Escala 1 a 5; cambia solo cuando cambia una acción del plan" etiqueta="Estimado" elementos="#38">
            <Areas ids={['38a', '38b', '38c', '38d']} meta={3} />
          </Tarjeta>
          <Indicadores ids={['38', 'PI2.1']} />
        </div>
      </Seccion>
    </>
  )
}

export function Operacion() {
  useAncla()
  const { IND } = useTablero()
  const i47 = IND['47'], i48 = IND['48'], sev = ['48p1', '48p2', '48p3'].map((k) => ultimo(IND[k]?.serie))
  return (
    <>
      <Seccion titulo="Plataforma y continuidad" elementos="#47 a 49" descripcion="Más carga y más cambios traen más incidentes; procesos más maduros los hacen menos y más cortos.">
        <Indicadores ids={['47', 'C1.1', '48', '49', 'PI3.1', 'PI3.2']} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {i47 && <Tarjeta titulo="Disponibilidad de la plataforma" etiqueta="Simulado" elementos="#47">
            <Linea titulo="Disponibilidad de la plataforma" unidad="%" meta={i47.estado?.meta} series={[{ nombre: i47.nombre, color: LINEA_PRINCIPAL, puntos: puntos(i47.serie) }]} />
          </Tarjeta>}
          {i48 && <Tarjeta titulo="Incidentes del mes por gravedad" descripcion="P1 más de 60 minutos, P2 de 20 a 60, P3 menos de 20" etiqueta="Simulado" elementos="#48">
            <div className="grid grid-cols-3 gap-3">{['P1', 'P2', 'P3'].map((p, k) => <div key={p}><span className="cifra block text-[30px] font-semibold leading-none">{num(sev[k], 0)}</span><span className="text-xs text-tinta-2">{p}</span></div>)}</div>
            <Linea titulo="Incidentes por mes" unidad="incidentes" alto={170} series={[{ nombre: 'Incidentes', color: LINEA_PRINCIPAL, puntos: puntos(i48.serie) }]} />
          </Tarjeta>}
        </div>
      </Seccion>
      <Seccion titulo="Entrega" elementos="#50 a 52" descripcion="Métricas DORA como referencia.">
        <Indicadores ids={['50', '51', '52']} />
      </Seccion>
      <Seccion titulo="Costo" elementos="#53 a 55" descripcion="Índice 100 = promedio de 2026, sin cifras en pesos.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Tarjeta titulo="Costo de nube y TI frente al presupuesto" descripcion="60 % fijo y 40 % variable con el volumen; la campaña de noviembre suma 10 %" etiqueta="Simulado" elementos="#53">
            <Linea titulo="Costo real frente a presupuesto" unidad="índice" etiquetasFinales series={[
              { nombre: 'Real', color: SERIES[0], puntos: puntos(IND['53r']?.serie) },
              { nombre: 'Presupuesto', color: SERIES[1], puntos: puntos(IND['53p']?.serie), discontinua: true },
            ]} />
          </Tarjeta>
          <Indicadores ids={['53', '54', '55a']} />
        </div>
      </Seccion>
      <Seccion titulo="Equipo" elementos="#56 y #57" descripcion={<>Indicadores AC1.1 y AC1.2 del BSC. Plantilla de TI simulada: {num(ultimo(IND['56p']?.serie), 0)} personas (S4: 100 en noviembre de 2026).</>}>
        <Indicadores ids={['AC1.2', 'AC1.1', '57']} />
      </Seccion>
    </>
  )
}
