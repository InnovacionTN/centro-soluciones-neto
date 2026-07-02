"""
Migración v1.1
- CSAT en tickets
- fecha_resolucion en tickets
- Tabla plantillas_respuesta

Ejecutar: python -m scripts.migrar_v1_1
"""

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Nuevas columnas en tickets
    conn.execute(
        text(
            """
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS csat_score       INTEGER,
        ADD COLUMN IF NOT EXISTS csat_comentario  TEXT,
        ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMP
    """
        )
    )

    # Nueva tabla plantillas
    conn.execute(
        text(
            """
        CREATE TABLE IF NOT EXISTS plantillas_respuesta (
            id            SERIAL PRIMARY KEY,
            titulo        VARCHAR(150) NOT NULL,
            contenido     TEXT NOT NULL,
            area_tecnica  VARCHAR(50),
            creado_por    INTEGER NOT NULL REFERENCES usuarios(id),
            activo        BOOLEAN DEFAULT TRUE,
            created_at    TIMESTAMP DEFAULT NOW()
        )
    """
        )
    )

    conn.commit()
    print("OK — tickets: csat_score, csat_comentario, fecha_resolucion")
    print("OK — tabla plantillas_respuesta creada")

print("Migración v1.1 completada")

# Agregar evidencia_id a bitacora_eventos (v1.1 patch)
with engine.connect() as conn:
    conn.execute(
        text(
            """
        ALTER TABLE bitacora_eventos
        ADD COLUMN IF NOT EXISTS evidencia_id INTEGER REFERENCES ticket_evidencias(id)
    """
        )
    )
    conn.commit()
    print("OK — bitacora_eventos: evidencia_id agregado")
