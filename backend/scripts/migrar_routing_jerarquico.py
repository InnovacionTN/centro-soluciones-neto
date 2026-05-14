"""
Migración: habilita routing jerárquico (zona → región → compañía → general)
y crea los 5 subgrupos de Sistemas: Soporte por compañía.

Pasos que ejecuta:
  1. Agrega columna compania_id a cat_grupos
  2. Agrega columnas region_id y compania_id a matriz_ruteo
  3. Crea 5 grupos: "Sistemas: Soporte CENTRO/ORIENTE/PONIENTE/SURESTE/VERACRUZ"
  4. Para cada tipificacion que hoy va a Sistemas: Soporte (general),
     crea una regla equivalente por compañía → subgrupo correcto

Idempotente — se puede ejecutar más de una vez.

Ejecutar:
    cd backend
    python scripts/migrar_routing_jerarquico.py
"""
import os, psycopg2

def get_db_url():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip()
    raise ValueError("DATABASE_URL no encontrado en .env")


GRUPO_SOPORTE_NACIONAL_ID = 15  # Sistemas: Soporte (nacional/fallback)


def run():
    conn = psycopg2.connect(get_db_url())
    cur = conn.cursor()

    # ── 1. compania_id en cat_grupos ──────────────────────────────
    print("Paso 1: compania_id en cat_grupos...")
    cur.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='cat_grupos' AND column_name='compania_id'
            ) THEN
                ALTER TABLE cat_grupos
                ADD COLUMN compania_id INTEGER REFERENCES cat_companias(id);
            END IF;
        END $$;
    """)
    conn.commit()
    print("  [OK]")

    # ── 2. region_id y compania_id en matriz_ruteo ────────────────
    print("Paso 2: columnas region_id y compania_id en matriz_ruteo...")
    cur.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='matriz_ruteo' AND column_name='region_id'
            ) THEN
                ALTER TABLE matriz_ruteo
                ADD COLUMN region_id INTEGER REFERENCES cat_regiones(id),
                ADD COLUMN compania_id INTEGER REFERENCES cat_companias(id);
            END IF;
        END $$;
    """)
    conn.commit()
    print("  [OK]")

    # ── 3. Crear 5 subgrupos de Soporte por compañía ──────────────
    print("Paso 3: Crear subgrupos Sistemas: Soporte por compañia...")

    cur.execute("SELECT id, nombre FROM cat_companias ORDER BY nombre")
    companias = cur.fetchall()

    subgrupos = {}  # compania_id → grupo_id
    for comp_id, comp_nombre in companias:
        nombre_grupo = f"Sistemas: Soporte {comp_nombre}"

        cur.execute("SELECT id FROM cat_grupos WHERE nombre = %s", (nombre_grupo,))
        existente = cur.fetchone()
        if existente:
            subgrupos[comp_id] = existente[0]
            print(f"  [skip] Ya existe: {nombre_grupo} (id={existente[0]})")
        else:
            cur.execute("""
                INSERT INTO cat_grupos (nombre, area_tecnica, activo, compania_id)
                VALUES (%s, 'SISTEMAS', true, %s)
                RETURNING id
            """, (nombre_grupo, comp_id))
            nuevo_id = cur.fetchone()[0]
            subgrupos[comp_id] = nuevo_id
            print(f"  [OK] Creado: {nombre_grupo} (id={nuevo_id})")

    conn.commit()

    # ── 4. Reglas de ruteo por compañía para tipificaciones Soporte
    print("Paso 4: Crear reglas de ruteo compania -> subgrupo...")

    # Obtener tipificaciones que hoy van a Sistemas: Soporte por regla general
    cur.execute("""
        SELECT DISTINCT tipificacion_id
        FROM matriz_ruteo
        WHERE grupo_id = %s
          AND zona_id IS NULL
          AND (region_id IS NULL OR region_id IS NULL)
          AND (compania_id IS NULL)
    """, (GRUPO_SOPORTE_NACIONAL_ID,))
    tip_ids = [r[0] for r in cur.fetchall()]
    print(f"  Tipificaciones de Soporte encontradas: {len(tip_ids)}")

    reglas_creadas = 0
    reglas_existentes = 0

    for comp_id, comp_nombre in companias:
        grupo_id = subgrupos[comp_id]
        for tip_id in tip_ids:
            # Verificar si ya existe la regla compania-nivel
            cur.execute("""
                SELECT id FROM matriz_ruteo
                WHERE tipificacion_id = %s
                  AND zona_id IS NULL
                  AND region_id IS NULL
                  AND compania_id = %s
                  AND grupo_id = %s
            """, (tip_id, comp_id, grupo_id))
            if cur.fetchone():
                reglas_existentes += 1
                continue

            cur.execute("""
                INSERT INTO matriz_ruteo
                    (tipificacion_id, zona_id, region_id, compania_id, grupo_id, prioridad)
                VALUES (%s, NULL, NULL, %s, %s, 0)
            """, (tip_id, comp_id, grupo_id))
            reglas_creadas += 1

    conn.commit()
    print(f"  [OK] {reglas_creadas} reglas creadas, {reglas_existentes} ya existian")

    # ── Resumen ───────────────────────────────────────────────────
    print("\nResumen final:")
    cur.execute("""
        SELECT g.nombre, c.nombre as compania, COUNT(u.id) as agentes
        FROM cat_grupos g
        LEFT JOIN cat_companias c ON g.compania_id = c.id
        LEFT JOIN usuarios u ON u.grupo_id = g.id AND u.rol='AGENTE' AND u.activo
        WHERE g.area_tecnica = 'SISTEMAS'
        GROUP BY g.id, g.nombre, c.nombre
        ORDER BY g.nombre
    """)
    for r in cur.fetchall():
        comp = r[1] or "(nacional)"
        print(f"  {r[0]:<40} compania={comp:<12} agentes={r[2]}")

    print("\nReglas de ruteo SISTEMAS por tipo:")
    cur.execute("""
        SELECT
            CASE
                WHEN mr.zona_id IS NOT NULL THEN 'zona'
                WHEN mr.region_id IS NOT NULL THEN 'region'
                WHEN mr.compania_id IS NOT NULL THEN 'compania'
                ELSE 'general'
            END as nivel,
            g.nombre as grupo,
            COUNT(*) as reglas
        FROM matriz_ruteo mr
        JOIN cat_tipificaciones tip ON mr.tipificacion_id = tip.id
        JOIN cat_grupos g ON mr.grupo_id = g.id
        WHERE tip.area_tecnica = 'SISTEMAS'
        GROUP BY nivel, g.nombre
        ORDER BY nivel, g.nombre
    """)
    for r in cur.fetchall():
        print(f"  [{r[0]:<8}] {r[1]:<40} {r[2]} reglas")

    print("\n[OK] migrar_routing_jerarquico.py completado")
    print("     Siguiente: ejecuta load_ingenieros_sistemas.py")
    print("     (actualiza GRUPO_POR_COMPANIA con los IDs de los subgrupos)\n")

    conn.close()


if __name__ == "__main__":
    run()
