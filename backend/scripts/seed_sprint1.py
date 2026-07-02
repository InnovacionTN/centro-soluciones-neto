"""
migrar_sprint1.py — Migración Sprint 1 para base de datos existente
====================================================================
Agrega las nuevas columnas y tabla SlaPolicy sin romper datos existentes.
Seguro para Neon.tech (sin superuser, usa ALTER TABLE normal).

Ejecutar UNA sola vez:
  python scripts/migrar_sprint1.py

Idempotente: si ya existe la columna, la omite sin error.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from sqlalchemy import text


def column_exists(conn, table: str, column: str) -> bool:
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.scalar() > 0


def table_exists(conn, table: str) -> bool:
    result = conn.execute(
        text("SELECT COUNT(*) FROM information_schema.tables " "WHERE table_name = :t"),
        {"t": table},
    )
    return result.scalar() > 0


def enum_value_exists(conn, enum_type: str, value: str) -> bool:
    result = conn.execute(
        text(
            "SELECT COUNT(*) FROM pg_enum e "
            "JOIN pg_type t ON t.oid = e.enumtypid "
            "WHERE t.typname = :type AND e.enumlabel = :val"
        ),
        {"type": enum_type, "val": value},
    )
    return result.scalar() > 0


def run():
    print("🚀 Migración Sprint 1 — Centro de Soluciones v2")
    print("=" * 55)

    with engine.connect() as conn:

        # ── 1. Nuevos valores en enums ────────────────────────────────────────
        print("\n[1/7] Actualizando enums...")

        nuevos_estados = [
            ("estatusticket", "PROGRAMADO_VISITA"),
            ("estatusticket", "EN_VISITA"),
            ("estatusticket", "ESPERANDO_PIEZA"),
        ]
        for enum_type, valor in nuevos_estados:
            if not enum_value_exists(conn, enum_type, valor):
                conn.execute(
                    text(f"ALTER TYPE {enum_type} ADD VALUE IF NOT EXISTS '{valor}'")
                )
                print(f"  ✓ EstatusTicket.{valor} agregado")
            else:
                print(f"  · EstatusTicket.{valor} ya existe")

        nuevos_roles = [("rolusuario", "COORDINADOR")]
        for enum_type, valor in nuevos_roles:
            if not enum_value_exists(conn, enum_type, valor):
                conn.execute(
                    text(f"ALTER TYPE {enum_type} ADD VALUE IF NOT EXISTS '{valor}'")
                )
                print(f"  ✓ RolUsuario.{valor} agregado")
            else:
                print(f"  · RolUsuario.{valor} ya existe")

        # Nuevo enum OrigenTicket
        result = conn.execute(
            text("SELECT COUNT(*) FROM pg_type WHERE typname = 'origenticket'")
        )
        if result.scalar() == 0:
            conn.execute(
                text("CREATE TYPE origenticket AS ENUM ('PORTAL', 'DANY', 'API')")
            )
            print("  ✓ Enum OrigenTicket creado")
        else:
            print("  · Enum OrigenTicket ya existe")

        # Nuevo valor OPERACIONES en AreaTecnica
        if not enum_value_exists(conn, "areatecnica", "OPERACIONES"):
            conn.execute(
                text("ALTER TYPE areatecnica ADD VALUE IF NOT EXISTS 'OPERACIONES'")
            )
            print("  ✓ AreaTecnica.OPERACIONES agregado")

        conn.commit()

        # ── 2. Tabla sla_policies ─────────────────────────────────────────────
        print("\n[2/7] Tabla sla_policies...")
        if not table_exists(conn, "sla_policies"):
            conn.execute(
                text(
                    """
                CREATE TABLE sla_policies (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL UNIQUE,
                    horas_limite INTEGER NOT NULL,
                    tipo_calendario VARCHAR(20) DEFAULT 'habil',
                    activo BOOLEAN DEFAULT TRUE
                )
            """
                )
            )
            conn.commit()
            print("  ✓ Tabla sla_policies creada")

            # Insertar las 7 políticas reales de Zendesk
            politicas = [
                ("6 horas hábiles", 6, "habil"),
                ("16 horas hábiles", 16, "habil"),
                ("24 horas hábiles", 24, "habil"),
                ("32 horas hábiles", 32, "habil"),
                ("48 horas hábiles", 48, "habil"),
                ("72 horas hábiles", 72, "habil"),
                ("120 horas hábiles", 120, "habil"),
            ]
            for nombre, horas, tipo in politicas:
                conn.execute(
                    text(
                        "INSERT INTO sla_policies (nombre, horas_limite, tipo_calendario) "
                        "VALUES (:n, :h, :t)"
                    ),
                    {"n": nombre, "h": horas, "t": tipo},
                )
            conn.commit()
            print(f"  ✓ {len(politicas)} políticas SLA insertadas")
        else:
            print("  · Tabla sla_policies ya existe")

        # ── 3. Columnas en cat_tipificaciones ─────────────────────────────────
        print("\n[3/7] Columnas en cat_tipificaciones...")
        nuevas_cols_tip = [
            ("subcategoria", "VARCHAR(100)"),
            ("sla_policy_id", "INTEGER REFERENCES sla_policies(id)"),
        ]
        for col, tipo in nuevas_cols_tip:
            if not column_exists(conn, "cat_tipificaciones", col):
                conn.execute(
                    text(f"ALTER TABLE cat_tipificaciones ADD COLUMN {col} {tipo}")
                )
                conn.commit()
                print(f"  ✓ cat_tipificaciones.{col} agregado")
            else:
                print(f"  · cat_tipificaciones.{col} ya existe")

        # Renombrar 'problema' si existe 'problema' pero no hay subcategoria con valor
        # (La columna problema ya existía en v1, solo agregamos subcategoria)

        # ── 4. Columnas en tickets ────────────────────────────────────────────
        print("\n[4/7] Columnas en tickets...")
        nuevas_cols_ticket = [
            ("cat_nivel1", "VARCHAR(100)"),
            ("cat_nivel2", "VARCHAR(100)"),
            ("cat_nivel3", "VARCHAR(200)"),
            ("origen", "origenticket DEFAULT 'PORTAL'"),
            ("dany_sesion_id", "VARCHAR(100)"),
            ("csat_recordatorio_enviado", "BOOLEAN DEFAULT FALSE"),
        ]
        for col, tipo in nuevas_cols_ticket:
            if not column_exists(conn, "tickets", col):
                conn.execute(text(f"ALTER TABLE tickets ADD COLUMN {col} {tipo}"))
                conn.commit()
                print(f"  ✓ tickets.{col} agregado")
            else:
                print(f"  · tickets.{col} ya existe")

        # ── 5. Columnas en usuarios ───────────────────────────────────────────
        print("\n[5/7] Columnas en usuarios...")
        if not column_exists(conn, "usuarios", "zona_id"):
            conn.execute(
                text(
                    "ALTER TABLE usuarios ADD COLUMN zona_id INTEGER REFERENCES cat_zonas(id)"
                )
            )
            conn.commit()
            print("  ✓ usuarios.zona_id agregado")
        else:
            print("  · usuarios.zona_id ya existe")

        # ── 6. Columnas en tiendas ────────────────────────────────────────────
        print("\n[6/7] Columnas en tiendas...")
        nuevas_cols_tienda = [
            ("estrategia", "VARCHAR(50) DEFAULT 'normal'"),
            ("empresa", "VARCHAR(50)"),
        ]
        for col, tipo in nuevas_cols_tienda:
            if not column_exists(conn, "tiendas", col):
                conn.execute(text(f"ALTER TABLE tiendas ADD COLUMN {col} {tipo}"))
                conn.commit()
                print(f"  ✓ tiendas.{col} agregado")
            else:
                print(f"  · tiendas.{col} ya existe")

        # ── 7. Columna tipificacion_id en plantillas ──────────────────────────
        print("\n[7/7] Columnas en plantillas_respuesta...")
        if not column_exists(conn, "plantillas_respuesta", "tipificacion_id"):
            conn.execute(
                text(
                    "ALTER TABLE plantillas_respuesta "
                    "ADD COLUMN tipificacion_id INTEGER REFERENCES cat_tipificaciones(id)"
                )
            )
            conn.commit()
            print("  ✓ plantillas_respuesta.tipificacion_id agregado")
        else:
            print("  · plantillas_respuesta.tipificacion_id ya existe")

    print("\n" + "=" * 55)
    print("✅ Migración Sprint 1 completada.")
    print("   Siguiente paso: python scripts/seed_sprint1.py")
    print("   (carga las 7 políticas SLA y el catálogo de tipificaciones v2)")


if __name__ == "__main__":
    run()
