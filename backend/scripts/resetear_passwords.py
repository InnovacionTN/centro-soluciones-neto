"""
resetear_passwords.py — Resetea contraseñas y reporta estado de todos los usuarios
====================================================================================
Contraseñas nuevas:
  Tiendas (rol TIENDA)          → CSNeto2026!
  Agentes / Coord / Admin       → Neto2026!

Uso:
    cd backend
    python scripts/resetear_passwords.py --dry-run   # solo reporte, sin cambios
    python scripts/resetear_passwords.py             # aplica cambios + reporte
"""

import sys, os, argparse
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from sqlalchemy import text
from app.db.session import SessionLocal

# ── Contraseñas ───────────────────────────────────────────────────────────────

PWD_TIENDAS = "CSNeto2026!"
PWD_AGENTES = "Neto2026!"

ROLES_TIENDA  = ("TIENDA",)
ROLES_AGENTES = ("AGENTE", "COORDINADOR", "ADMIN", "ADMIN_AREA")


def make_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def sep(titulo):
    print(f"\n{'=' * 62}")
    print(f"  {titulo}")
    print('=' * 62)


def run(dry: bool):
    db = SessionLocal()
    try:
        # ── Generar hashes (bcrypt es lento, hacerlo una sola vez) ────────────
        if not dry:
            print("  Generando hashes bcrypt...")
            hash_tiendas = make_hash(PWD_TIENDAS)
            hash_agentes = make_hash(PWD_AGENTES)
            print("  ✅ Hashes listos\n")

        # ── 1. Resetear contraseñas ───────────────────────────────────────────
        sep("1. RESETEAR CONTRASEÑAS")

        for roles, pwd, label in [
            (ROLES_TIENDA,  PWD_TIENDAS, "TIENDA"),
            (ROLES_AGENTES, PWD_AGENTES, "AGENTE / COORDINADOR / ADMIN"),
        ]:
            placeholders = ", ".join(f"'{r}'" for r in roles)
            count = db.execute(
                text(f"SELECT COUNT(*) FROM usuarios WHERE rol IN ({placeholders}) AND activo = true")
            ).scalar()

            print(f"  {label:<35} → {pwd:<15}  ({count} usuarios activos)")

            if not dry:
                h = hash_tiendas if "TIENDA" in roles else hash_agentes
                db.execute(
                    text(f"UPDATE usuarios SET hashed_password = :h "
                         f"WHERE rol IN ({placeholders}) AND activo = true"),
                    {"h": h}
                )

        if not dry:
            db.commit()
            print("\n  ✅ Contraseñas actualizadas en BD")

        # ── 2. Reporte de usuarios no-tienda ─────────────────────────────────
        sep("2. ESTADO DE AGENTES, COORDINADORES Y ADMINS")

        rows = db.execute(text("""
            SELECT
                u.id,
                u.email,
                u.nombre,
                u.rol,
                u.activo,
                u.disponible,
                g.nombre           AS grupo,
                g.area_tecnica     AS area,
                r.nombre           AS region,
                c.nombre           AS compania
            FROM usuarios u
            LEFT JOIN cat_grupos   g ON u.grupo_id   = g.id
            LEFT JOIN cat_regiones r ON u.zona_id    = r.id
            LEFT JOIN cat_companias c ON g.compania_id = c.id
            WHERE u.rol IN ('AGENTE','COORDINADOR','ADMIN','ADMIN_AREA')
            ORDER BY u.rol, c.nombre, u.nombre
        """)).fetchall()

        rol_actual = None
        for r in rows:
            uid, email, nombre, rol, activo, disponible, grupo, area, region, compania = r
            if rol != rol_actual:
                rol_actual = rol
                print(f"\n  ── {rol} ──────────────────────────────────────────")

            estado  = "✅ activo" if activo else "🚫 inactivo"
            disp    = " · disponible" if disponible else " · NO disponible"
            comp_s  = f"[{compania}]" if compania else ""
            region_s = f"· región: {region}" if region else ""
            grupo_s  = f"· grupo: {grupo}" if grupo else ""

            print(f"  {estado}{disp if rol == 'AGENTE' else ''}")
            print(f"    {nombre}")
            print(f"    {email}   {comp_s}")
            if grupo_s or region_s:
                print(f"    {grupo_s}  {region_s}")

        # ── 3. Advertencias ───────────────────────────────────────────────────
        sep("3. ADVERTENCIAS")

        # Agentes sin grupo
        sin_grupo = db.execute(text("""
            SELECT nombre, email FROM usuarios
            WHERE rol = 'AGENTE' AND grupo_id IS NULL AND activo = true
        """)).fetchall()
        if sin_grupo:
            print(f"  ⚠️  Agentes sin grupo ({len(sin_grupo)}):")
            for nombre, email in sin_grupo:
                print(f"     · {nombre} ({email})")
        else:
            print("  ✅ Todos los agentes tienen grupo asignado")

        # Coordinadores sin zona
        sin_zona = db.execute(text("""
            SELECT nombre, email FROM usuarios
            WHERE rol = 'COORDINADOR' AND zona_id IS NULL AND activo = true
        """)).fetchall()
        if sin_zona:
            print(f"  ⚠️  Coordinadores sin zona ({len(sin_zona)}):")
            for nombre, email in sin_zona:
                print(f"     · {nombre} ({email})")
        else:
            print("  ✅ Todos los coordinadores tienen zona asignada")

        # Agentes con región mock (no en el Excel oficial)
        regiones_mock = ("Centro CDMX", "Ecatepec", "Bajío", "Michoacán",
                         "Oriente", "Oriente CDMX", "Yucatán")
        placeholders_m = ", ".join(f"'{r}'" for r in regiones_mock)
        agentes_mock = db.execute(text(f"""
            SELECT u.nombre, u.email, reg.nombre as region
            FROM usuarios u
            JOIN cat_regiones reg ON u.zona_id = reg.id
            WHERE u.rol = 'AGENTE'
              AND reg.nombre IN ({placeholders_m})
              AND u.activo = true
        """)).fetchall()
        if agentes_mock:
            print(f"\n  ⚠️  Agentes con región del seed (no oficial) ({len(agentes_mock)}):")
            print(f"     Reasignar manualmente en la UI de admin:")
            for nombre, email, region in agentes_mock:
                print(f"     · {nombre} ({email}) → región actual: '{region}'")
        else:
            print("  ✅ Todos los agentes tienen región oficial")

        # ── 4. Resumen de tiendas ─────────────────────────────────────────────
        sep("4. RESUMEN ACCESO TIENDAS")

        total_tiendas = db.execute(text(
            "SELECT COUNT(*) FROM usuarios WHERE rol='TIENDA' AND activo=true"
        )).scalar()
        print(f"  Usuarios TIENDA activos : {total_tiendas}")
        print(f"  Patrón email            : ECO@soyneto.com  (ej: 7909@soyneto.com)")
        print(f"  Contraseña              : {PWD_TIENDAS}")
        print()
        print(f"  Ejemplo — Tienda Lerma (ECO 7909):")
        print(f"    Email    : 7909@soyneto.com")
        print(f"    Password : {PWD_TIENDAS}")

        if dry:
            print(f"\n  ⚠️  MODO DRY-RUN — no se cambió ninguna contraseña")
        else:
            print(f"\n  ✅ Contraseñas aplicadas correctamente")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        raise
    finally:
        db.close()
        print("\n✔  Listo.\n")


def main():
    parser = argparse.ArgumentParser(description="Resetear contraseñas y reportar usuarios")
    parser.add_argument("--dry-run", action="store_true",
                        help="Solo reporte, sin modificar contraseñas")
    args = parser.parse_args()

    if args.dry_run:
        print("⚠️  MODO DRY-RUN — solo reporte, sin cambios\n")

    run(dry=args.dry_run)


if __name__ == "__main__":
    main()
