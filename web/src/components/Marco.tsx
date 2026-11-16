import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { ProveedorTablero, useTableroQuery } from '../lib/tablero'
import Detalle from './Detalle'
import Encabezado from './Encabezado'
import { Aviso, Cargando } from './ui'

/** Marco de todas las pantallas: barra superior, contenido y panel de detalle de indicador. */
export default function Marco() {
  const q = useTableroQuery()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 7000); return () => clearTimeout(t) }, [aviso])

  if (q.isLoading) return <Cargando />
  if (q.isError || !q.data) {
    const sinDatos = q.error instanceof ApiError && q.error.codigo === 'sin_datos'
    return (
      <div className="mx-auto max-w-xl p-10">
        <Aviso tipo="error">
          {sinDatos ? <>La base aún no tiene los datos del tablero. Corre <code>python -m app.cli cargar-datos</code> en el contenedor de la API.</>
            : 'No se pudo leer el tablero. Revisa que la API esté arriba y recarga la página.'}
        </Aviso>
      </div>
    )
  }
  return (
    <ProveedorTablero D={q.data}>
      <Encabezado aviso={setAviso} />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 pb-16 pt-7 sm:px-8">
        {aviso && <Aviso tipo={aviso.ok ? 'ok' : 'error'}>{aviso.texto}</Aviso>}
        <Outlet />
        <p className="m-0 max-w-4xl text-xs text-tinta-3">
          Regla del tablero: todo dato lleva su etiqueta (real, estimado o simulado) y una cifra calculada hereda la etiqueta menos sólida de sus insumos.
          Los valores simulados no son datos de Addi: existen para demostrar la lógica del tablero. Equipo Nexus, Gobernanza y Servicios de TI.
        </p>
      </main>
      <Detalle />
    </ProveedorTablero>
  )
}
