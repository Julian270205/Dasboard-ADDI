import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import Marco from './components/Marco'
import { Aviso, Seccion, Tarjeta } from './components/ui'
import { ApiError, enviar } from './lib/api'
import { ConSesion } from './lib/auth'
import Admin from './pages/Admin'
import Aprobaciones from './pages/Aprobaciones'
import Cobit from './pages/Cobit'
import Estrategia from './pages/Estrategia'
import General from './pages/General'
import Login from './pages/Login'
import { Datos, IA, Operacion, Seguridad } from './pages/Temas'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ConSesion><Marco /></ConSesion>}>
        <Route index element={<General />} />
        <Route path="estrategia" element={<Estrategia />} />
        <Route path="datos" element={<Datos />} />
        <Route path="seguridad" element={<Seguridad />} />
        <Route path="ia" element={<IA />} />
        <Route path="operacion" element={<Operacion />} />
        <Route path="cobit" element={<Cobit />} />
        <Route path="aprobaciones" element={<ConSesion rol="aprobador"><Aprobaciones /></ConSesion>} />
        <Route path="aprobaciones/:id" element={<ConSesion rol="aprobador"><Aprobaciones /></ConSesion>} />
        <Route path="admin" element={<ConSesion rol="admin"><Admin /></ConSesion>} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="*" element={<Seccion titulo="Esta página no existe"><Aviso>Revisa la dirección o vuelve al <Link to="/">resumen ejecutivo</Link>.</Aviso></Seccion>} />
      </Route>
    </Routes>
  )
}

function Cuenta() {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const cambiar = useMutation({ mutationFn: () => enviar('/auth/cambiar-contrasena', { actual, nueva }) })
  function enviarForm(e: FormEvent) { e.preventDefault(); cambiar.mutate() }
  const campo = 'min-h-11 rounded-lg border border-linea px-3 text-[15px]'
  return (
    <Seccion titulo="Cambiar contraseña" descripcion="Usa al menos 10 caracteres. Si entraste con una contraseña temporal, cámbiala ahora.">
      <Tarjeta className="max-w-md">
        <form onSubmit={enviarForm} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Contraseña actual<input type="password" required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} className={campo} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Contraseña nueva<input type="password" required minLength={10} autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} /></label>
          {cambiar.isSuccess && <Aviso tipo="ok">Contraseña cambiada.</Aviso>}
          {cambiar.isError && <Aviso tipo="error">{cambiar.error instanceof ApiError ? cambiar.error.message : 'No se pudo cambiar.'}</Aviso>}
          <button type="submit" disabled={cambiar.isPending} className="min-h-11 rounded-lg bg-acento font-semibold text-white disabled:opacity-60">Cambiar contraseña</button>
        </form>
      </Tarjeta>
    </Seccion>
  )
}
