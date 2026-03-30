from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import engine
from app.models.models import Base
from app.api.v1.endpoints.routes import router
from app.core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crea tablas si no existen (en producción usar Alembic migrations)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Centro de Soluciones API",
    description="Portal de gestión de tickets impulsado por IA",
    version="1.3.0",
    lifespan=lifespan,
    # Swagger deshabilitado en producción
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.3.0", "env": settings.ENVIRONMENT}
