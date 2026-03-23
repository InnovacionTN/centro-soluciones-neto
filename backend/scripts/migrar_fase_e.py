from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ticket_evidencias (
            id               SERIAL PRIMARY KEY,
            ticket_id        INTEGER NOT NULL REFERENCES tickets(id),
            usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
            nombre_archivo   VARCHAR(255) NOT NULL,
            nombre_guardado  VARCHAR(255) NOT NULL,
            url              VARCHAR(500) NOT NULL,
            tipo_mime        VARCHAR(100),
            tamanio_bytes    INTEGER,
            timestamp        TIMESTAMP DEFAULT NOW()
        )
    """))
    conn.commit()
    print("Tabla ticket_evidencias creada")

print("Migracion Fase E completada")
