// Cliente HTTP: cookie de sesión httpOnly + cabecera CSRF en todo lo que modifica.

export class ApiError extends Error {
  status: number
  codigo: string
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
  }
}

function leerCookie(nombre: string): string {
  const fila = document.cookie.split('; ').find((c) => c.startsWith(nombre + '='))
  return fila ? decodeURIComponent(fila.split('=')[1]) : ''
}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const metodo = (opciones.method ?? 'GET').toUpperCase()
  const headers = new Headers(opciones.headers)
  if (opciones.body) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD'].includes(metodo)) headers.set('X-CSRF-Token', leerCookie('csrf'))

  const r = await fetch(`/api/v1${ruta}`, { ...opciones, headers, credentials: 'same-origin' })
  if (r.status === 204) return undefined as T
  const cuerpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = cuerpo?.error ?? {}
    throw new ApiError(r.status, e.codigo ?? 'error', e.mensaje ?? 'No se pudo completar la acción.')
  }
  return cuerpo as T
}

export const enviar = <T,>(ruta: string, datos?: unknown, metodo = 'POST') =>
  api<T>(ruta, { method: metodo, body: datos === undefined ? undefined : JSON.stringify(datos) })
