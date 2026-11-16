import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, enviar } from './api'
import type { Perfil } from './tipos'

export function usePerfil() {
  return useQuery({ queryKey: ['yo'], queryFn: () => api<Perfil>('/auth/me'), retry: false, staleTime: 60_000 })
}

export function useSalir() {
  const qc = useQueryClient()
  return async () => {
    await enviar('/auth/logout').catch(() => undefined)
    qc.clear()
    window.location.href = '/login'
  }
}

export const tieneRol = (p: Perfil | undefined, rol: Perfil['roles'][number]) => !!p?.roles.includes(rol)

/** Protege una ruta: sin sesión manda al login y vuelve después a donde iba (incluido el ?decision= del correo). */
export function ConSesion({ children, rol }: { children: ReactNode; rol?: Perfil['roles'][number] }) {
  const { data, isLoading, isError } = usePerfil()
  const loc = useLocation()
  if (isLoading) return <div className="p-10 text-tinta-2">Cargando…</div>
  if (isError || !data) return <Navigate to={`/login?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (rol && !data.roles.includes(rol)) return <Navigate to="/" replace />
  return <>{children}</>
}
