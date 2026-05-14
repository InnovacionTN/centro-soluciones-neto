"""
Auditoría read-only del estado actual de la base de datos.
No hace ningún cambio.

Ejecutar:
    cd backend
    python scripts/inspect_db.py
"""
import sys, os, psycopg2

def get_db_url():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip()
    raise ValueError("DATABASE_URL no encontrado en .env")


def sep(titulo):
    print(f"\n{'=' * 60}")
    print(f"  {titulo}")
    print('=' * 60)


def run():
    conn = psycopg2.connect(get_db_url())
    cur = conn.cursor()

    # ── Compañías ──────────────────────────────────────────────
    cur.execute("SELECT to_regclass('cat_companias')")
    tiene_companias = cur.fetchone()[0] is not None

    sep("COMPAÑÍAS (cat_companias)")
    if tiene_companias:
        cur.execute("""
            SELECT c.id, c.nombre, COUNT(r.id) as regiones, c.activo
            FROM cat_companias c
            LEFT JOIN cat_regiones r ON r.compania_id = c.id
            GROUP BY c.id, c.nombre, c.activo
            ORDER BY c.nombre
        """)
        rows = cur.fetchall()
        if rows:
            for r in rows:
                print(f"  [{r[0]}] {r[1]}  |  {r[2]} regiones  |  activo={r[3]}")
        else:
            print("  (sin datos -- ejecuta migrar_companias.py)")
    else:
        print("  [!]  Tabla no existe -- ejecuta migrar_companias.py")

    # ── Regiones ───────────────────────────────────────────────
    sep("REGIONES (cat_regiones)")
    if tiene_companias:
        cur.execute("""
            SELECT r.id, r.nombre, COALESCE(c.nombre, '[!] SIN COMPAÑÍA') as compania,
                   COUNT(z.id) as zonas, COUNT(t.id) as tiendas
            FROM cat_regiones r
            LEFT JOIN cat_companias c ON r.compania_id = c.id
            LEFT JOIN cat_zonas z ON z.region_id = r.id
            LEFT JOIN tiendas t ON t.zona_id = z.id
            GROUP BY r.id, r.nombre, c.nombre
            ORDER BY c.nombre, r.nombre
        """)
    else:
        cur.execute("""
            SELECT r.id, r.nombre, COUNT(z.id) as zonas, COUNT(t.id) as tiendas
            FROM cat_regiones r
            LEFT JOIN cat_zonas z ON z.region_id = r.id
            LEFT JOIN tiendas t ON t.zona_id = z.id
            GROUP BY r.id, r.nombre
            ORDER BY r.nombre
        """)
    for r in cur.fetchall():
        print(f"  {r}")

    # ── Zonas ──────────────────────────────────────────────────
    sep("ZONAS (cat_zonas) -- resumen por región")
    cur.execute("""
        SELECT r.nombre as region, COUNT(z.id) as zonas, COUNT(t.id) as tiendas
        FROM cat_regiones r
        LEFT JOIN cat_zonas z ON z.region_id = r.id
        LEFT JOIN tiendas t ON t.zona_id = z.id
        GROUP BY r.nombre
        ORDER BY r.nombre
    """)
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]} zonas, {r[2]} tiendas")

    # ── Grupos ─────────────────────────────────────────────────
    sep("GRUPOS (cat_grupos)")
    cur.execute("""
        SELECT g.id, g.nombre, g.area_tecnica,
               COUNT(u.id) FILTER (WHERE u.rol='AGENTE' AND u.activo) as agentes,
               g.activo
        FROM cat_grupos g
        LEFT JOIN usuarios u ON u.grupo_id = g.id
        GROUP BY g.id, g.nombre, g.area_tecnica, g.activo
        ORDER BY g.area_tecnica, g.nombre
    """)
    area_actual = None
    for r in cur.fetchall():
        if r[2] != area_actual:
            area_actual = r[2]
            print(f"\n  [{area_actual}]")
        print(f"    id={r[0]}  {r[1]}  |  {r[3]} agentes  |  activo={r[4]}")

    # ── Grupos de Sistemas (detalle) ────────────────────────────
    sep("GRUPOS DE SISTEMAS -- detalle de agentes")
    cur.execute("""
        SELECT g.id, g.nombre, u.nombre as agente, u.email
        FROM cat_grupos g
        LEFT JOIN usuarios u ON u.grupo_id = g.id AND u.rol='AGENTE' AND u.activo
        WHERE g.area_tecnica = 'SISTEMAS'
        ORDER BY g.nombre, u.nombre
    """)
    grupo_actual = None
    for r in cur.fetchall():
        if r[1] != grupo_actual:
            grupo_actual = r[1]
            print(f"\n  Grupo id={r[0]}: {r[1]}")
        if r[2]:
            print(f"    - {r[2]} ({r[3]})")
        else:
            print(f"    (sin agentes)")

    # ── Matriz de ruteo para Sistemas ──────────────────────────
    sep("RUTEO SISTEMAS -- ¿llegan por zona o general?")
    cur.execute("""
        SELECT
            CASE WHEN mr.zona_id IS NULL THEN 'GENERAL (todas las zonas)'
                 ELSE z.nombre END as zona,
            g.nombre as grupo,
            COUNT(*) as reglas
        FROM matriz_ruteo mr
        JOIN cat_tipificaciones tip ON mr.tipificacion_id = tip.id
        JOIN cat_grupos g ON mr.grupo_id = g.id
        LEFT JOIN cat_zonas z ON mr.zona_id = z.id
        WHERE tip.area_tecnica = 'SISTEMAS'
        GROUP BY mr.zona_id, z.nombre, g.nombre
        ORDER BY zona, grupo
    """)
    for r in cur.fetchall():
        print(f"  Zona: {r[0]:<35} → Grupo: {r[1]}  ({r[2]} reglas)")

    # ── Tiendas ────────────────────────────────────────────────
    sep("TIENDAS -- resumen")
    cur.execute("SELECT COUNT(*) FROM tiendas WHERE activo=true")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tiendas WHERE zona_id IS NULL")
    sin_zona = cur.fetchone()[0]
    print(f"  Total activas : {total}")
    print(f"  Sin zona_id   : {sin_zona}")

    cur.execute("""
        SELECT COUNT(*) FROM tiendas t
        JOIN cat_zonas z ON t.zona_id = z.id
        JOIN cat_regiones r ON z.region_id = r.id
        WHERE r.compania_id IS NULL
    """) if tiene_companias else None
    if tiene_companias:
        sin_compania = cur.fetchone()[0]
        print(f"  Sin compañía  : {sin_compania}")

    # ── Tickets ────────────────────────────────────────────────
    sep("TICKETS -- estado actual")
    cur.execute("""
        SELECT estatus, COUNT(*) FROM tickets GROUP BY estatus ORDER BY estatus
    """)
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]}")

    print()
    conn.close()


if __name__ == "__main__":
    run()
