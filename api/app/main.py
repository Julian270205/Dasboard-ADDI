from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import admin, aprobaciones, auth, internal, tablero

settings = get_settings()
PREFIJO = "/api/v1"

app = FastAPI(title="Dashboard estratégico de TI de Addi", version="2.0.0",
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=2000)   # el JSON del tablero pesa ~200 KB sin comprimir

if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])


# Formato único de error: {"error": {"codigo": "...", "mensaje": "..."}}
@app.exception_handler(HTTPException)
async def _http_error(_: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "codigo" in exc.detail:
        cuerpo = exc.detail
    else:
        cuerpo = {"codigo": f"http_{exc.status_code}", "mensaje": str(exc.detail)}
    return JSONResponse({"error": cuerpo}, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def _validacion(_: Request, exc: RequestValidationError):
    campos = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
    return JSONResponse({"error": {"codigo": "datos_invalidos", "mensaje": "Revisa: " + ", ".join(campos)}}, status_code=422)


@app.get(f"{PREFIJO}/salud", tags=["salud"])
def salud():
    return {"ok": True, "version": app.version}


for r in (auth.router, tablero.router, aprobaciones.router, admin.router, internal.router):
    app.include_router(r, prefix=PREFIJO)
