## Qué cambia

## Cómo probarlo

## Checklist
- [ ] No se compila nada en la EC2 (solo imágenes desde GitHub Actions)
- [ ] Ningún secreto en el código ni en los workflows de n8n
- [ ] Si toca el esquema `acceso`: migración de Alembic revisada a mano
- [ ] Si toca el generador: `python generador/generar.py` corrido y `db/` + `huella.txt` commiteados
- [ ] Si toca n8n: flujo exportado a `n8n/` sin credenciales
- [ ] Toda cifra nueva lleva su etiqueta (real, estimado o simulado)
