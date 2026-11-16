import ReactECharts from 'echarts-for-react'
import { mes, num } from '../lib/formato'
import type { Indicador } from '../lib/tipos'

const EJE = { color: '#4a5a6e', fontSize: 11, fontFamily: 'IBM Plex Sans' }
const REJILLA = { lineStyle: { color: '#eef1f5' } }
const TOOLTIP = { backgroundColor: '#102033', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12, fontFamily: 'IBM Plex Sans' }, padding: [8, 10] }

// Paleta categórica validada (orden fijo, nunca cíclico): para series que no son estado.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
export const LINEA_PRINCIPAL = '#2a78d6'

/** Mini serie de 24 meses con la meta a la fecha punteada. */
export function Mini({ i, alto = 40 }: { i: Indicador; alto?: number }) {
  const s = (i.serie ?? []).slice(-24)
  if (s.length < 2) return <div style={{ height: alto }} />
  const w = 220, vs = s.map((x) => +x[1]), m = i.estado?.meta
  const conMeta = m != null && i.sentido !== 'Rango'
  const todos = conMeta ? [...vs, +m] : vs
  let lo = Math.min(...todos), hi = Math.max(...todos)
  if (hi === lo) { hi += 1; lo -= 1 }
  const X = (k: number) => 2 + (k * (w - 6)) / (s.length - 1)
  const Y = (v: number) => alto - 4 - ((v - lo) * (alto - 8)) / (hi - lo)
  const puntos = vs.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${alto}`} width="100%" height={alto} preserveAspectRatio="none" aria-hidden="true">
      {conMeta && <line x1="2" x2={w - 2} y1={Y(+m)} y2={Y(+m)} stroke="#7a8798" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <polyline points={puntos} fill="none" stroke={LINEA_PRINCIPAL} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={X(s.length - 1)} cy={Y(vs[vs.length - 1])} r="3" fill={LINEA_PRINCIPAL} />
    </svg>
  )
}

export interface SerieLinea { nombre: string; color: string; puntos: [string, number][]; discontinua?: boolean }

/** Línea con meta (constante), rango sano sombreado y tooltip. Un solo eje. */
export function Linea({ series, meta, rango, unidad = '', alto = 240, etiquetasFinales = false, titulo }: {
  series: SerieLinea[]; meta?: number | null; rango?: [number, number] | null; unidad?: string; alto?: number; etiquetasFinales?: boolean; titulo: string
}) {
  const periodos = series[0]?.puntos.map((p) => p[0]) ?? []
  const opcion = {
    aria: { enabled: true, label: { description: titulo } },
    grid: { left: 8, right: etiquetasFinales ? 52 : 16, top: series.length > 1 && !etiquetasFinales ? 30 : 14, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', ...TOOLTIP, valueFormatter: (v: number) => `${num(v)}${unidad ? ' ' + unidad : ''}` },
    legend: series.length > 1 && !etiquetasFinales ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: EJE } : undefined,
    xAxis: { type: 'category', data: periodos, boundaryGap: false, axisLabel: { ...EJE, formatter: (v: string) => mes(v), hideOverlap: true },
             axisLine: { lineStyle: { color: '#dde3ea' } }, axisTick: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { ...EJE, formatter: (v: number) => num(v, 2) }, splitLine: REJILLA },
    series: series.map((s, k) => ({
      type: 'line', name: s.nombre, data: s.puntos.map((p) => p[1]), showSymbol: false, symbolSize: 7, smooth: false,
      lineStyle: { width: 2, color: s.color, type: s.discontinua ? 'dashed' : 'solid' }, itemStyle: { color: s.color },
      endLabel: etiquetasFinales ? { show: true, formatter: s.nombre, color: '#102033', fontSize: 11, fontFamily: 'IBM Plex Sans', fontWeight: 600 } : undefined,
      markLine: k === 0 && meta != null ? { symbol: 'none', silent: true, lineStyle: { color: '#102033', type: 'dashed', width: 1 },
        label: { formatter: `Meta ${num(meta)}`, position: 'insideEndTop', color: '#102033', fontSize: 11 }, data: [{ yAxis: meta }] } : undefined,
      markArea: k === 0 && rango ? { silent: true, itemStyle: { color: 'rgba(30,125,79,0.08)' }, data: [[{ yAxis: rango[0] }, { yAxis: rango[1] }]] } : undefined,
    })),
  }
  return <ReactECharts option={opcion} style={{ height: alto }} notMerge opts={{ renderer: 'svg' }} />
}

/** Radar de madurez por dominio: nivel actual contra nivel objetivo (escala 0 a 5). */
export function Radar({ ejes, actual, objetivo }: { ejes: string[]; actual: number[]; objetivo: number[] }) {
  const opcion = {
    aria: { enabled: true, label: { description: `Madurez por dominio: ${ejes.map((e, k) => `${e} ${num(actual[k], 2)}`).join(', ')}` } },
    tooltip: { ...TOOLTIP, trigger: 'item' },
    legend: { bottom: 0, data: ['Nivel actual', 'Nivel objetivo'], icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: EJE },
    radar: {
      indicator: ejes.map((e, k) => ({ name: `${e}\n${num(actual[k], 2)}`, max: 5 })), radius: '64%', center: ['50%', '48%'], splitNumber: 5,
      axisName: { color: '#102033', fontSize: 12, fontFamily: 'IBM Plex Sans', fontWeight: 600 },
      splitLine: { lineStyle: { color: '#dde3ea' } }, splitArea: { show: false }, axisLine: { lineStyle: { color: '#dde3ea' } },
    },
    series: [{ type: 'radar', symbolSize: 6, data: [
      { name: 'Nivel actual', value: actual, lineStyle: { width: 2, color: LINEA_PRINCIPAL }, itemStyle: { color: LINEA_PRINCIPAL }, areaStyle: { color: 'rgba(42,120,214,0.14)' } },
      { name: 'Nivel objetivo', value: objetivo, lineStyle: { width: 1.5, type: 'dashed', color: '#102033' }, itemStyle: { color: '#102033' }, symbol: 'none' },
    ] }],
  }
  return <ReactECharts option={opcion} style={{ height: 290 }} notMerge opts={{ renderer: 'svg' }} />
}

/** Cuadrante importancia contra desempeño (escala ISACA: 1 = muy bien). Una burbuja por combinación. */
export function Cuadrante({ celdas, alSeleccionar }: { celdas: { desempeno: number; importancia: number; codigos: string[] }[]; alSeleccionar: (c: string) => void }) {
  const W = 460, H = 320, gx = (v: number) => 64 + ((v - 1) / 3) * (W - 110), gy = (v: number) => H - 54 - ((v - 3) / 2) * (H - 110)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Importancia contra desempeño de los objetivos COBIT">
      <rect x={gx(2.5)} y={gy(5) - 32} width={gx(4) - gx(2.5) + 30} height={gy(4.5) - gy(5) + 32} rx="10" fill="#c23b2e" opacity=".07" />
      <text x={gx(4) + 24} y={gy(5) - 18} textAnchor="end" fontSize="11" fill="#c23b2e" fontWeight="600">Muy importante y se hace regular</text>
      {[3, 4, 5].map((v) => <g key={v}><line x1="52" x2={W - 12} y1={gy(v)} y2={gy(v)} stroke="#eef1f5" /><text x="44" y={gy(v) + 4} textAnchor="end" fontSize="11" fill="#4a5a6e">{v}</text></g>)}
      {[1, 2, 3, 4].map((v) => <text key={v} x={gx(v)} y={H - 26} textAnchor="middle" fontSize="11" fill="#4a5a6e">{v}{v === 1 ? ' muy bien' : v === 4 ? ' mal' : ''}</text>)}
      <text x="14" y={H / 2 - 20} fontSize="11" fill="#4a5a6e" transform={`rotate(-90 14 ${H / 2 - 20})`} textAnchor="middle">Importancia</text>
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#4a5a6e">Desempeño percibido</text>
      {celdas.map((c) => {
        const alerta = c.importancia === 5 && c.desempeno >= 3, r = 10 + c.codigos.length * 1.8
        return (
          <g key={`${c.desempeno}-${c.importancia}`} className="cursor-pointer" onClick={() => alSeleccionar(c.codigos[0])}>
            <title>{`Importancia ${c.importancia}, desempeño ${c.desempeno}: ${c.codigos.join(', ')}`}</title>
            <circle cx={gx(c.desempeno)} cy={gy(c.importancia)} r={r + 2} fill="#fff" />
            <circle cx={gx(c.desempeno)} cy={gy(c.importancia)} r={r} fill={alerta ? '#c23b2e' : '#2a78d6'} />
            <text x={gx(c.desempeno)} y={gy(c.importancia) + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff">{c.codigos.length}</text>
            <text x={gx(c.desempeno)} y={gy(c.importancia) + r + 13} textAnchor="middle" fontSize="10" fill="#4a5a6e">{c.codigos.slice(0, 4).join(' ')}{c.codigos.length > 4 ? ' …' : ''}</text>
          </g>
        )
      })}
    </svg>
  )
}
