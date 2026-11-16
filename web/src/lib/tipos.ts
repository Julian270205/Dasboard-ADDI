// Forma del JSON de addi.api_dashboard() (db/04_funciones.sql de la v1), que la API entrega en GET /tablero.

export type Etiqueta = 'Real' | 'Estimado' | 'Simulado' | 'Por levantar'
export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'gris'
export type Evidencia = 'V' | 'I' | 'NV'
export type Pestana = 'Estrategia' | 'Datos' | 'Seguridad' | 'IA' | 'Operación' | 'COBIT'

export interface Estado {
  indicador_id: string
  periodo: string | null
  valor: number | null
  etiqueta: Etiqueta | null
  meta: number | null
  cumplimiento: number | null
  semaforo: Semaforo
  tendencia: 'sube' | 'baja' | 'estable'
}

export interface Indicador {
  id: string
  elemento: number | null
  seccion: string
  pestana: Pestana
  objetivo_bsc: string | null
  nombre: string
  unidad: string
  sentido: 'Max' | 'Min' | 'Rango'
  tipo: 'Leading' | 'Lagging'
  reloj: 'operativo' | 'plan'
  clase: 1 | 2 | 3
  ancla: string
  formula: string
  sigma: string
  rango_min: number | null
  rango_max: number | null
  umbral_rojo: number | null
  responsable: string
  fuente: string
  que_mide: string
  principal: boolean
  estado: Estado | null
  metas: Record<string, number> | null
  serie: [string, number, Etiqueta][] | null
  cobit: string[] | null
  acciones: string[] | null
  riesgos: string[] | null
}

export interface ObjetivoCobit {
  codigo: string
  codigo_control: string | null
  nombre: string
  dominio: 'EDM' | 'APO' | 'BAI' | 'DSS' | 'MEA'
  nivel: number | null
  version: number | null
  etiqueta_evidencia: Evidencia
  etiqueta_dato: Etiqueta | null
  evidencia: string | null
  nivel_objetivo: number
  importancia: number
  desempeno: number
  quien: string
  auditado: boolean
  formal: boolean
  responsable: string | null
  justificacion: string | null
  indicadores: string[] | null
  acciones: string[] | null
  riesgos: string[] | null
}

export interface Propuesta {
  id: number
  corte: string
  objetivo: string
  nombre: string
  dominio: string
  tipo: 'propuesta' | 'alerta'
  regla: string
  nivel_actual: number | null
  nivel_propuesto: number | null
  evidencia: string
  etiqueta: Etiqueta
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'informativa' | 'caducada'
  aprobador: string | null
  suplente: string | null
  motivo_rechazo: string | null
  recordatorios: number
  copia_cto: boolean
}

export interface Accion {
  codigo: string
  accion: string
  ruta: string
  objetivo_bsc: string | null
  objetivo_cobit: string | null
  responsable: string
  inicio: string | null
  fin: string | null
  indicador: string | null
  peso: number
  origen: string
  estado_bsc: string | null
  avance: number
  gasto_plan: number
  gasto_real: number
  fase: 'No iniciada' | 'En curso' | 'Terminada' | 'Sin fechas'
}

export interface Riesgo {
  id: string
  riesgo: string
  categoria: string
  objetivo_bsc: string | null
  probabilidad: number
  impacto: number
  inherente: number
  proceso: string | null
  nivel_proceso: number | null
  eficacia: number
  residual: number
  dueno: string | null
  senal: string | null
  senal_semaforo: Semaforo | null
  mitigacion: string | null
  acciones: string | null
  estado: string
  apetito: string
  severidad_max: number
  fuera_apetito: boolean
  origen: string
}

export interface Alerta {
  indicador: string
  corte: string
  que_pasa: string
  impacto: string
  que_decidir: string
  responsable: string
  fecha_limite: string
  etiqueta: Etiqueta
  pestana: Pestana
}

export interface Tablero {
  config: Record<string, string>
  generado: string
  consultado: string
  supuestos: { id: string; supuesto: string; valor: string; estado: string }[]
  objetivos_bsc: { codigo: string; perspectiva: string; nombre: string; contribuye_a: string | null }[]
  indicadores: Indicador[]
  cobit: ObjetivoCobit[]
  historial_madurez: { objetivo: string; version: number; nivel: number; fecha: string; aprobador: string; evidencia: string; etiqueta: Etiqueta; nivel_anterior: number | null }[]
  propuestas: Propuesta[]
  responsables: { dominio: string; cubre: string; nombre: string; correo: string | null; suplente: string | null }[]
  autoevaluacion: { seccion: number; seccion_nombre: string; n: number; pregunta: string; respuesta: 'Yes' | 'Partial' | 'No'; puntos: number; etiqueta_evidencia: string | null; comentario: string | null }[]
  diagnostico_bsc: { elemento: number; elemento_nombre: string; item: number; enunciado: string; valor: number }[]
  plan: Accion[]
  riesgos: Riesgo[]
  alertas: Alerta[]
  modelos_ia: { modelo_id: string; nombre: string; riesgo: string; dueno: string; estado: string; proxima_revision: string | null; apagado_rapido: boolean; usos_no_permitidos: string; ancla: string }[]
  calendario: { fecha: string; evento: string; tipo: string; factor_carga: number; fuente: string | null }[] | null
  ejecuciones: { fecha: string; resultado: string }[]
  proyeccion_madurez: { anio: number; dominio: string; nivel: number }[]
}

export interface Perfil {
  id: number
  nombre: string
  cargo: string | null
  correo: string
  roles: ('lector' | 'aprobador' | 'admin')[]
  dominios: Record<string, 'titular' | 'suplente'>
}

export interface PropuestaDetalle extends Omit<Propuesta, 'suplente' | 'copia_cto'> {
  nivel_vigente: number | null
  nivel_objetivo: number | null
  importancia: number | null
  desempeno: number | null
  etiqueta_evidencia: Evidencia | null
  justificacion: string | null
  fecha_decision: string | null
  rol: 'titular' | 'suplente' | null
  puede_decidir: boolean
  explicacion: string
  vinculos?: {
    indicadores: { id: string; nombre: string; unidad: string; valor: number | null; meta: number | null; semaforo: Semaforo | null }[]
    acciones: { codigo: string; accion: string; responsable: string; inicio: string | null; fin: string | null }[]
    riesgos: { id: string; riesgo: string; inherente: number }[]
  }
}

export interface EstadoN8n {
  servicio: 'en_linea' | 'con_error' | 'sin_respuesta'
  flujo: 'activo' | 'inactivo' | 'desconocido'
  ultimo_corte: { fecha: string; resultado: Record<string, unknown> } | null
  ultimos_avisos: { fecha: string; resultado: { correos: number; propuestas: number } } | null
}

export function textoN8n(e: EstadoN8n | undefined): { texto: string; ok: boolean } {
  if (!e) return { texto: 'n8n: consultando…', ok: true }
  if (e.servicio !== 'en_linea') return { texto: 'n8n sin conexión', ok: false }
  if (e.flujo === 'inactivo') return { texto: 'n8n conectado, flujo inactivo', ok: false }
  if (e.flujo === 'activo') return { texto: 'n8n conectado, flujo activo', ok: true }
  return { texto: 'n8n conectado', ok: true }
}
