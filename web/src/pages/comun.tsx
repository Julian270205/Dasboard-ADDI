import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Lleva a la sección del #ancla (los enlaces del resumen apuntan, por ejemplo, a /estrategia#plan). */
export function useAncla() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return }
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [hash])
}

/** Índice de la pestaña: atajos a sus secciones, para no recorrer una página larga. */
export function Indice({ enlaces }: { enlaces: [string, string][] }) {
  return (
    <nav aria-label="Secciones de esta pestaña" className="-mb-4 flex flex-wrap gap-1.5">
      {enlaces.map(([id, texto]) => (
        <a key={id} href={`#${id}`} className="rounded-full border border-linea bg-papel px-3 py-1 text-[13px] text-tinta-2 no-underline hover:border-tinta-3 hover:text-tinta">{texto}</a>
      ))}
    </nav>
  )
}
