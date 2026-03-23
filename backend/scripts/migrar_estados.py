from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    # 1. Agregar nuevos valores al enum
    conn.execute(text("ALTER TYPE estatusticket ADD VALUE IF NOT EXISTS 'ASIGNADO'"))
    conn.execute(
        text("ALTER TYPE estatusticket ADD VALUE IF NOT EXISTS 'ESPERANDO_TIENDA'")
    )
    conn.execute(text("ALTER TYPE estatusticket ADD VALUE IF NOT EXISTS 'CANCELADO'"))

    # 2. Agregar columna tipo_comentario si no existe
    conn.execute(
        text(
            """
        ALTER TABLE bitacora_eventos 
        ADD COLUMN IF NOT EXISTS tipo_comentario VARCHAR(10) DEFAULT 'PUBLICO'
    """
        )
    )
    conn.commit()
    print("Paso 1: Enum y columnas actualizados")

with engine.connect() as conn:
    # 3. Migrar datos existentes
    r1 = conn.execute(
        text("UPDATE tickets SET estatus = 'ASIGNADO' WHERE estatus = 'ABIERTO'")
    )
    r2 = conn.execute(
        text(
            "UPDATE tickets SET estatus = 'ESPERANDO_TIENDA' WHERE estatus = 'CONFIRMAR_SOLUCION'"
        )
    )
    r3 = conn.execute(
        text(
            "UPDATE bitacora_eventos SET estado_anterior = 'ASIGNADO' WHERE estado_anterior = 'ABIERTO'"
        )
    )
    r4 = conn.execute(
        text(
            "UPDATE bitacora_eventos SET estado_nuevo = 'ASIGNADO' WHERE estado_nuevo = 'ABIERTO'"
        )
    )
    r5 = conn.execute(
        text(
            "UPDATE bitacora_eventos SET estado_anterior = 'ESPERANDO_TIENDA' WHERE estado_anterior = 'CONFIRMAR_SOLUCION'"
        )
    )
    r6 = conn.execute(
        text(
            "UPDATE bitacora_eventos SET estado_nuevo = 'ESPERANDO_TIENDA' WHERE estado_nuevo = 'CONFIRMAR_SOLUCION'"
        )
    )
    conn.commit()
    print(
        f"Paso 2: Tickets — ABIERTO→ASIGNADO: {r1.rowcount}, CONFIRMAR→ESPERANDO: {r2.rowcount}"
    )
    print(
        f"Paso 2: Bitacora — {r3.rowcount + r4.rowcount + r5.rowcount + r6.rowcount} filas"
    )
    print("Migracion completa")
