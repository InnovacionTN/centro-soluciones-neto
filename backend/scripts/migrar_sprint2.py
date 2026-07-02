"""
migrar_sprint2.py — Migración Sprint 2: Mantenimiento + Coordinador
====================================================================
Agrega campos de visita técnica y pieza en la tabla tickets.
Seguro para Neon.tech. Idempotente.

Ejecutar:  python scripts/migrar_sprint2.py
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from sqlalchemy import text


def col_exists(conn, table, col):
    r = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": table, "c": col},
    )
    return r.scalar() > 0


def run():
    print("🚀 Migración Sprint 2 — Mantenimiento + Coordinador")
    print("=" * 52)

    with engine.connect() as conn:

        print("\n[1/2] Columnas de Mantenimiento en tickets...")
        cols = [
            ("fecha_visita_programada", "TIMESTAMP"),
            ("pieza_requerida", "VARCHAR(200)"),
            ("proveedor_pendiente", "VARCHAR(200)"),
        ]
        for col, tipo in cols:
            if not col_exists(conn, "tickets", col):
                conn.execute(text(f"ALTER TABLE tickets ADD COLUMN {col} {tipo}"))
                conn.commit()
                print(f"  ✓ tickets.{col}")
            else:
                print(f"  · tickets.{col} ya existe")

        print("\n[2/2] Verificando enum COORDINADOR en rolusuario...")
        r = conn.execute(
            text(
                "SELECT COUNT(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid "
                "WHERE t.typname='rolusuario' AND e.enumlabel='COORDINADOR'"
            )
        )
        if r.scalar() == 0:
            conn.execute(
                text("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'COORDINADOR'")
            )
            conn.commit()
            print("  ✓ RolUsuario.COORDINADOR agregado")
        else:
            print("  · RolUsuario.COORDINADOR ya existe")

    print("\n" + "=" * 52)
    print("✅ Migración Sprint 2 completada.")


if __name__ == "__main__":
    run()
