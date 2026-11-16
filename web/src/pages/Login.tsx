import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, enviar } from '../lib/api'

export default function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const volver = params.get('volver') ?? '/'
  const desdeCorreo = volver.startsWith('/aprobaciones/')

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      await enviar('/auth/login', { correo, contrasena: clave })
      await qc.invalidateQueries()
      navegar(volver.startsWith('/') ? volver : '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.25fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-linea bg-lienzo p-12 lg:flex">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2e5bda" />
            <rect x="8" y="17" width="4" height="7" rx="1" fill="#fff" fillOpacity=".55" /><rect x="14" y="12" width="4" height="12" rx="1" fill="#fff" fillOpacity=".8" /><rect x="20" y="8" width="4" height="16" rx="1" fill="#fff" /></svg>
          <span className="text-lg font-semibold">Addi <span className="font-normal text-tinta-2">Dashboard estratégico de TI</span></span>
        </div>
        <div className="flex max-w-xl flex-col gap-5">
          <p className="m-0 text-[44px] font-semibold leading-[1.08] tracking-tight">Gobierno de TI que se mide, se decide y queda escrito.</p>
          <p className="m-0 text-[15px] leading-relaxed text-tinta-2">Balanced Scorecard 2027–2030 y COBIT 2019 en un solo tablero. El flujo mensual propone; una persona con nombre aprueba.</p>
        </div>
        <span className="text-xs text-tinta-3">Equipo Nexus, Gobernanza y Servicios de TI. Los datos simulados no son datos de Addi.</span>
      </div>
      <main className="flex items-center justify-center bg-papel p-8">
        <form onSubmit={entrar} className="flex w-full max-w-md flex-col gap-4" aria-describedby={error ? 'error-login' : undefined}>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[26px] font-semibold tracking-tight">Inicia sesión</h1>
            <p className="m-0 text-[14px] text-tinta-2">{desdeCorreo ? 'Vienes del correo de aprobación: entra para revisar la evidencia y confirmar tu decisión.' : 'Usa el correo y la contraseña que te dio el administrador del tablero.'}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Correo
            <input type="email" required autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)}
              className="min-h-11 rounded-lg border border-linea px-3 text-[15px] font-normal focus:border-acento" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Contraseña
            <input type="password" required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)}
              className="min-h-11 rounded-lg border border-linea px-3 text-[15px] font-normal focus:border-acento" />
          </label>
          {error && <p id="error-login" role="alert" className="m-0 text-[13px] text-rojo">{error}</p>}
          <button type="submit" disabled={enviando} className="min-h-11 rounded-lg bg-acento text-[15px] font-semibold text-white hover:bg-[#244bb8] disabled:opacity-60">
            {enviando ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>
      </main>
    </div>
  )
}
