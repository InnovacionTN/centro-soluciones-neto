"""
migrar_sprint3.py — Tabla de sesiones Dany para medir deflexión real
====================================================================
Cada sesión Dany se registra aquí.
resuelto_sin_ticket=True → deflexión exitosa.
resuelto_sin_ticket=False → se creó ticket (escaló a agente).

Ejecutar:  python scripts/migrar_sprint3.py
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from sqlalchemy import text


def table_exists(conn, tabla):
    r = conn.execute(
        text("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = :t"),
        {"t": tabla},
    )
    return r.scalar() > 0


def col_exists(conn, tabla, col):
    r = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": tabla, "c": col},
    )
    return r.scalar() > 0


def run():
    print("🚀 Migración Sprint 3 — Dany primera línea")
    print("=" * 48)

    with engine.connect() as conn:

        # ── 1. Tabla dany_sesiones ────────────────────────────────────────────
        print("\n[1/2] Tabla dany_sesiones...")
        if not table_exists(conn, "dany_sesiones"):
            conn.execute(
                text(
                    """
                CREATE TABLE dany_sesiones (
                    id                   SERIAL PRIMARY KEY,
                    sesion_id            VARCHAR(100) NOT NULL UNIQUE,
                    tienda_id            INTEGER REFERENCES tiendas(id),
                    canal                VARCHAR(20) DEFAULT 'portal',
                    mensajes_count       INTEGER DEFAULT 0,
                    resuelto_sin_ticket  BOOLEAN DEFAULT FALSE,
                    ticket_id            INTEGER REFERENCES tickets(id),
                    tipificacion_detectada VARCHAR(200),
                    motivo_escalacion    TEXT,
                    fecha_inicio         TIMESTAMP DEFAULT NOW(),
                    fecha_fin            TIMESTAMP
                )
            """
                )
            )
            conn.commit()
            print("  ✓ Tabla dany_sesiones creada")
        else:
            print("  · dany_sesiones ya existe")

        # ── 2. Índices ────────────────────────────────────────────────────────
        print("\n[2/2] Índices...")
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_dany_sesiones_tienda "
                    "ON dany_sesiones(tienda_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_dany_sesiones_fecha "
                    "ON dany_sesiones(fecha_inicio)"
                )
            )
            conn.commit()
            print("  ✓ Índices creados")
        except Exception:
            print("  · Índices ya existen")

    print("\n" + "=" * 48)
    print("✅ Migración Sprint 3 completada.")


if __name__ == "__main__":
    run()
