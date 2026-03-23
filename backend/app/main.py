from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import engine
from app.models.models import Base
from app.api.v1.endpoints.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crea tablas si no existen (en producción usar Alembic migrations)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Centro de Soluciones API",
    description="Portal de gestión de tickets impulsado por IA · MVP",
    version="1.0.0-mvp",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0-mvp"}
