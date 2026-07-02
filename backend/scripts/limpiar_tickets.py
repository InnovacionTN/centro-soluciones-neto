"""
limpiar_tickets.py — Limpieza de datos operativos para prueba en limpio
========================================================================
Borra SOLO los tickets y todo lo asociado a ellos.
NO toca: regiones, zonas, tiendas, grupos, usuarios, tipificaciones,
         sla_policies, matriz_ruteo, plantillas_respuesta.

Ejecutar:
  python scripts/limpiar_tickets.py

Con confirmación saltada (para CI):
  python scripts/limpiar_tickets.py --confirm
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from sqlalchemy import text


def run(auto_confirm=False):
    print("🧹 Limpieza de datos operativos — CSN v2")
    print("=" * 50)
    print("\nEsto borrará:")
    print("  • bitacora_eventos")
    print("  • ticket_evidencias")
    print("  • tickets")
    print("  • incidentes_masivos")
    print("\nNO toca catálogos (tiendas, grupos, tipificaciones, usuarios, SLA, ruteo)")

    if not auto_confirm:
        resp = (
            input("\n¿Confirmar limpieza? (escribe 'si' para continuar): ")
            .strip()
            .lower()
        )
        if resp != "si":
            print("Cancelado.")
            return

    with engine.connect() as conn:
        # Orden importa por FKs
        pasos = [
            ("bitacora_eventos", "DELETE FROM bitacora_eventos"),
            ("ticket_evidencias", "DELETE FROM ticket_evidencias"),
            ("tickets", "DELETE FROM tickets"),
            ("incidentes_masivos", "DELETE FROM incidentes_masivos"),
        ]

        total = 0
        for nombre, sql in pasos:
            result = conn.execute(text(sql))
            n = result.rowcount
            total += n
            print(f"  ✓ {nombre}: {n} filas eliminadas")

        # Reiniciar secuencias para que folios empiecen desde TKT-2026-00001
        secuencias = [
            "ALTER SEQUENCE IF EXISTS tickets_id_seq RESTART WITH 1",
            "ALTER SEQUENCE IF EXISTS bitacora_eventos_id_seq RESTART WITH 1",
            "ALTER SEQUENCE IF EXISTS ticket_evidencias_id_seq RESTART WITH 1",
            "ALTER SEQUENCE IF EXISTS incidentes_masivos_id_seq RESTART WITH 1",
        ]
        for sql in secuencias:
            conn.execute(text(sql))

        conn.commit()

    print(f"\n✅ Limpieza completada. {total} filas eliminadas.")
    print("   El próximo ticket será TKT-2026-00001")
    print("\nSiguiente paso: levantar el backend y crear un ticket de prueba.")


if __name__ == "__main__":
    auto = "--confirm" in sys.argv
    run(auto_confirm=auto)
