"""
fix_grupos_activos.py — Activa todos los grupos del seed
=========================================================
Ejecutar si los grupos aparecen como desactivados en el catálogo.

  python scripts/fix_grupos_activos.py
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.models import Grupo

db = SessionLocal()

try:
    grupos = db.query(Grupo).all()
    inactivos = [g for g in grupos if not g.activo]

    if not inactivos:
        print(f"✅ Todos los grupos ({len(grupos)}) ya están activos.")
    else:
        for g in inactivos:
            g.activo = True
            print(f"  ✓ Activando: {g.nombre} ({g.area_tecnica.value})")
        db.commit()
        print(f"\n✅ {len(inactivos)} grupos activados. Total: {len(grupos)} grupos.")

    print("\nEstado actual:")
    for g in db.query(Grupo).order_by(Grupo.area_tecnica, Grupo.nombre).all():
        estado = "✅" if g.activo else "❌"
        print(f"  {estado} [{g.area_tecnica.value}] {g.nombre}")

finally:
    db.close()
