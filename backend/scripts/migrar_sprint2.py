"""
Migración Sprint 2
- usuarios.disponible         — flag de disponibilidad del agente
- tickets.incidente_id        — FK opcional a incidentes_masivos
- Tabla incidentes_masivos    — Torre de Control / incidentes masivos

Ejecutar: python -m scripts.migrar_sprint2
"""

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:

    # 1. Campo disponible en usuarios
    conn.execute(text("""
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT TRUE NOT NULL
    """))
    print("OK — usuarios.disponible agregado")

    # 2. Tabla incidentes_masivos
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS incidentes_masivos (
            id               SERIAL PRIMARY KEY,
            titulo           VARCHAR(200) NOT NULL,
            descripcion      TEXT,
            tipificacion_id  INTEGER REFERENCES cat_tipificaciones(id),
            estado           VARCHAR(20)  DEFAULT 'ACTIVO',
            creado_por       INTEGER      NOT NULL REFERENCES usuarios(id),
            impacto_tiendas  INTEGER      DEFAULT 0,
            fecha_inicio     TIMESTAMP    DEFAULT NOW(),
            fecha_cierre     TIMESTAMP
        )
    """))
    print("OK — tabla incidentes_masivos creada")

    # 3. FK incidente_id en tickets
    conn.execute(text("""
        ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS incidente_id INTEGER REFERENCES incidentes_masivos(id)
    """))
    print("OK — tickets.incidente_id agregado")

    conn.commit()

print("Migración Sprint 2 completada")
