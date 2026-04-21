"""
migrar_sprint6a.py — Catálogos racionalizados + rol ADMIN_AREA
==============================================================
Cambios:
  1. Enum rolusuario → agrega valor ADMIN_AREA
  2. cat_grupos → agrega columna region_id (FK a cat_regiones, nullable)
  3. usuarios → agrega columna area_restriccion (enum areatecnica, nullable)
  4. Seed de 27 grupos racionales (reemplaza los grupos Zendesk si la tabla está vacía
     o si se ejecuta con --force para limpiar y re-sembrar)

Uso:
  python scripts/migrar_sprint6a.py           # migración segura (no borra datos)
  python scripts/migrar_sprint6a.py --seed    # solo carga los 27 grupos si cat_grupos está vacío
  python scripts/migrar_sprint6a.py --force   # elimina grupos existentes y re-siembra
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from sqlalchemy import text

FORCE = "--force" in sys.argv
SEED_ONLY = "--seed" in sys.argv

# ── Definición de los 27 grupos racionales ────────────────────────────────────
# Formato: (nombre, area_tecnica, region_nombre_o_None)
# region_nombre = None → grupo general (todas las regiones)
# region_nombre = "CENTRO" etc → grupo regional

GRUPOS_CSN = [
    # SISTEMAS (5 grupos generales — mismos agentes atienden todas las regiones)
    ("Sistemas: Soporte", "SISTEMAS", None),
    ("Sistemas: Comunicaciones", "SISTEMAS", None),
    ("Sistemas: SION", "SISTEMAS", None),
    ("Sistemas: Abasto", "SISTEMAS", None),
    ("Sistemas: CEDIS", "SISTEMAS", None),
    # MANTENIMIENTO (6 grupos regionales — técnicos físicos)
    ("Mantenimiento: Centro", "MANTENIMIENTO", "CENTRO"),
    ("Mantenimiento: Oriente", "MANTENIMIENTO", "ORIENTE"),
    ("Mantenimiento: Poniente", "MANTENIMIENTO", "PONIENTE"),
    ("Mantenimiento: Sureste", "MANTENIMIENTO", "SURESTE"),
    ("Mantenimiento: Veracruz", "MANTENIMIENTO", "VERACRUZ"),
    ("Mantenimiento: Corporativo", "MANTENIMIENTO", None),
    # ABASTO (5 grupos regionales)
    ("Abasto: Centro", "ABASTO", "CENTRO"),
    ("Abasto: Oriente", "ABASTO", "ORIENTE"),
    ("Abasto: Poniente", "ABASTO", "PONIENTE"),
    ("Abasto: Sureste", "ABASTO", "SURESTE"),
    ("Abasto: Veracruz", "ABASTO", "VERACRUZ"),
    # FINANZAS (3 grupos generales)
    ("Finanzas: Aseguramiento de Ingresos", "FINANZAS", None),
    ("Finanzas: Inventarios y Venteks", "FINANZAS", None),
    ("Finanzas: Planeación", "FINANZAS", None),
    # COMERCIAL (2 grupos generales)
    ("Comercial: Categorías", "COMERCIAL", None),
    ("Comercial: Gerencia", "COMERCIAL", None),
    # RRHH (1 grupo general)
    ("RRHH", "RRHH", None),
    # OPERACIONES (2 grupos generales)
    ("Operaciones: Tiendas", "OPERACIONES", None),
    ("Operaciones: SION", "OPERACIONES", None),
    # CORPORATIVO (1 grupo)
    ("Corporativo", "SISTEMAS", None),
]


def col_exists(conn, tabla, col):
    r = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": tabla, "c": col},
    )
    return r.scalar() > 0


def enum_value_exists(conn, tipo, valor):
    r = conn.execute(
        text(
            "SELECT COUNT(*) FROM pg_enum pe "
            "JOIN pg_type pt ON pe.enumtypid = pt.oid "
            "WHERE pt.typname = :tipo AND pe.enumlabel = :valor"
        ),
        {"tipo": tipo, "valor": valor},
    )
    return r.scalar() > 0


def run():
    print("🚀 Migración Sprint 6A — Catálogos y rol ADMIN_AREA")
    print("=" * 52)

    with engine.connect() as conn:

        # ── 1. Enum rolusuario → ADMIN_AREA ──────────────────────────────────
        if not SEED_ONLY:
            print("\n[1/3] Enum rolusuario...")
            if not enum_value_exists(conn, "rolusuario", "ADMIN_AREA"):
                # Los ALTER TYPE ADD VALUE deben correr fuera de transacción en PG
                conn.execute(text("COMMIT"))
                conn.execute(
                    text("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'ADMIN_AREA'")
                )
                print("  ✓ Valor ADMIN_AREA agregado al enum rolusuario")
            else:
                print("  · ADMIN_AREA ya existe en el enum")

        # ── 2. cat_grupos → region_id ─────────────────────────────────────────
        if not SEED_ONLY:
            print("\n[2/3] Columna cat_grupos.region_id...")
            if not col_exists(conn, "cat_grupos", "region_id"):
                conn.execute(
                    text(
                        "ALTER TABLE cat_grupos "
                        "ADD COLUMN region_id INTEGER REFERENCES cat_regiones(id) ON DELETE SET NULL"
                    )
                )
                conn.commit()
                print("  ✓ Columna region_id agregada a cat_grupos")
            else:
                print("  · region_id ya existe")

        # ── 3. usuarios → area_restriccion ───────────────────────────────────
        if not SEED_ONLY:
            print("\n[3/3] Columna usuarios.area_restriccion...")
            if not col_exists(conn, "usuarios", "area_restriccion"):
                conn.execute(
                    text(
                        "ALTER TABLE usuarios "
                        "ADD COLUMN area_restriccion areatecnica NULL"
                    )
                )
                conn.commit()
                print("  ✓ Columna area_restriccion agregada a usuarios")
            else:
                print("  · area_restriccion ya existe")

        # ── 4. Seed de grupos ─────────────────────────────────────────────────
        print("\n[4/4] Seed grupos CSN v2...")

        count = conn.execute(text("SELECT COUNT(*) FROM cat_grupos")).scalar()

        if count > 0 and not FORCE:
            print(f"  · cat_grupos ya tiene {count} registros.")
            print("  · Usa --force para eliminar y re-sembrar.")
            print("  · Usa --seed para agregar solo los que falten.")
            if SEED_ONLY:
                _seed_missing(conn)
        elif count > 0 and FORCE:
            print(f"  ⚠ Eliminando {count} grupos existentes (--force)...")
            # Desvincular usuarios antes de eliminar
            conn.execute(text("UPDATE usuarios SET grupo_id = NULL"))
            conn.execute(text("DELETE FROM reglas_ruteo"))
            conn.execute(text("DELETE FROM cat_grupos"))
            conn.commit()
            _seed_all(conn)
        else:
            _seed_all(conn)

    print("\n" + "=" * 52)
    print("✅ Sprint 6A completado.")
    print("\nPróximos pasos:")
    print("  1. Actualiza models.py con los cambios indicados")
    print("  2. Asigna agentes a los nuevos grupos desde el portal")
    print("  3. Configura reglas de ruteo por zona+tipificación → grupo")


def _get_region_ids(conn):
    rows = conn.execute(
        text("SELECT id, UPPER(TRIM(nombre)) AS nombre FROM cat_regiones")
    ).fetchall()
    return {r.nombre: r.id for r in rows}


def _seed_all(conn):
    region_map = _get_region_ids(conn)
    creados = 0
    for nombre, area, region_nombre in GRUPOS_CSN:
        region_id = None
        if region_nombre:
            region_id = region_map.get(region_nombre.upper())
            if region_id is None:
                print(
                    f"  ⚠ Región '{region_nombre}' no encontrada — grupo '{nombre}' se crea sin región"
                )
        conn.execute(
            text(
                "INSERT INTO cat_grupos (nombre, area_tecnica, region_id, activo) "
                "VALUES (:n, :a, :r, TRUE)"
            ),
            {"n": nombre, "a": area, "r": region_id},
        )
        creados += 1
    conn.commit()
    print(f"  ✓ {creados} grupos creados")


def _seed_missing(conn):
    region_map = _get_region_ids(conn)
    existentes = {
        r.nombre for r in conn.execute(text("SELECT nombre FROM cat_grupos")).fetchall()
    }
    creados = 0
    for nombre, area, region_nombre in GRUPOS_CSN:
        if nombre in existentes:
            continue
        region_id = None
        if region_nombre:
            region_id = region_map.get(region_nombre.upper())
        conn.execute(
            text(
                "INSERT INTO cat_grupos (nombre, area_tecnica, region_id, activo) "
                "VALUES (:n, :a, :r, TRUE)"
            ),
            {"n": nombre, "a": area, "r": region_id},
        )
        creados += 1
    conn.commit()
    if creados:
        print(f"  ✓ {creados} grupos nuevos agregados")
    else:
        print("  · Todos los grupos ya existen")


if __name__ == "__main__":
    run()
