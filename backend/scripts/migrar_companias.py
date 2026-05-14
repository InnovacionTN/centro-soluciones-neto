"""
Migración: crea cat_companias, agrega compania_id a cat_regiones
y vincula las 25 regiones existentes a sus 5 compañías.

Idempotente -- se puede ejecutar más de una vez sin duplicar datos.

Ejecutar:
    cd backend
    python scripts/migrar_companias.py
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


# ── Mapeo Región (BD) → Compañía (Excel) ──────────────────────────────────────
# Fuente: Ingenieros por Region Operaciones.xlsx
REGION_COMPANIA = {
    # CENTRO -- coord. Alexander Vargas García
    "Centro CDMX":  "CENTRO",   # Excel: CENTRO + VALLE (VALLE es zona dentro de esta región)
    "Metro Norte":  "CENTRO",   # Excel: METRO NORTE
    "Norte":        "CENTRO",   # Excel: NORTE
    "Ecatepec":     "CENTRO",   # Excel: NUEVO ECATEPEC
    "Bajío":        "CENTRO",   # Excel: OCCIDENTE BAJÍO
    "Michoacán":    "CENTRO",   # Excel: OCCIDENTE MICHOACÁN NORTE + SUR (unificados en BD)
    "Toluca":       "CENTRO",   # Excel: TOLUCA

    # ORIENTE -- coord. Héctor Israel Ramírez González
    "Iztapalapa":   "ORIENTE",  # Excel: IZTAPALAPA
    "Metro Sur":    "ORIENTE",  # Excel: METRO SUR
    "Neza":         "ORIENTE",  # Excel: NEZA
    "Puebla":       "ORIENTE",  # Excel: PUEBLA
    "Oriente":      "ORIENTE",  # Región catch-all para tiendas de Oriente CDMX

    # PONIENTE -- coord. Luis Jesús Santos Galeana
    "Acapulco Centro":   "PONIENTE",  # Excel: ACAPULCO CENTRO
    "Acapulco Montaña":  "PONIENTE",  # Excel: ACAPULCO MONTAÑA
    "Acapulco Oriente":  "PONIENTE",  # Excel: ACAPULCO ORIENTE
    "Acapulco Poniente": "PONIENTE",  # Excel: ACAPULCO PONIENTE
    "Morelos":           "PONIENTE",  # Excel: MORELOS
    "Oaxaca":            "PONIENTE",  # Excel: OAXACA
    "Oaxaca Costa":      "PONIENTE",  # Excel: OAXACA COSTA

    # SURESTE -- coord. Luis Enrique Méndez García
    "Chiapas":  "SURESTE",  # Excel: CHIAPAS + CHIAPAS SOCONUSCO (unificados en BD)
    "Tabasco":  "SURESTE",  # Excel: TABASCO + COATZA OLMECA (unificados en BD)
    "Yucatán":  "SURESTE",  # Excel: YUCATAN

    # VERACRUZ -- coord. Héctor Alberto Cortés Contreras
    "Veracruz Centro": "VERACRUZ",  # Excel: VERACRUZ CENTRO
    "Veracruz Norte":  "VERACRUZ",  # Excel: VERACRUZ NORTE
    "Veracruz Sur":    "VERACRUZ",  # Excel: VERACRUZ SUR
}


def run():
    conn = psycopg2.connect(get_db_url())
    cur = conn.cursor()

    print("[*] Paso 1: Crear tabla cat_companias...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cat_companias (
            id         SERIAL PRIMARY KEY,
            nombre     VARCHAR(100) NOT NULL UNIQUE,
            activo     BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()
    print("   [OK] cat_companias lista")

    print("\n[link] Paso 2: Agregar columna compania_id a cat_regiones...")
    cur.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='cat_regiones' AND column_name='compania_id'
            ) THEN
                ALTER TABLE cat_regiones
                ADD COLUMN compania_id INTEGER REFERENCES cat_companias(id);
                RAISE NOTICE 'Columna compania_id agregada.';
            ELSE
                RAISE NOTICE 'Columna compania_id ya existe.';
            END IF;
        END $$;
    """)
    conn.commit()
    print("   [OK] columna compania_id en cat_regiones")

    print("\n[*] Paso 3: Insertar las 5 compañías...")
    companias = ["CENTRO", "ORIENTE", "PONIENTE", "SURESTE", "VERACRUZ"]
    for nombre in companias:
        cur.execute("""
            INSERT INTO cat_companias (nombre)
            VALUES (%s)
            ON CONFLICT (nombre) DO NOTHING
        """, (nombre,))
    conn.commit()

    cur.execute("SELECT id, nombre FROM cat_companias ORDER BY nombre")
    comp_ids = {nombre: cid for cid, nombre in cur.fetchall()}
    print(f"   [OK] Compañías: {comp_ids}")

    print("\n[map]  Paso 4: Vincular regiones a compañías...")
    ok = 0
    faltantes = []

    for region_nombre, compania_nombre in REGION_COMPANIA.items():
        cur.execute("""
            UPDATE cat_regiones
            SET compania_id = %s
            WHERE nombre = %s
        """, (comp_ids[compania_nombre], region_nombre))

        if cur.rowcount == 0:
            faltantes.append(region_nombre)
        else:
            ok += 1

    conn.commit()
    print(f"   [OK] {ok} regiones vinculadas")
    if faltantes:
        print(f"   [!]  No encontradas en BD (revisar nombre exacto): {faltantes}")

    # ── Verificación final ─────────────────────────────────────
    print("\n[chart] Verificación:")
    cur.execute("""
        SELECT c.nombre, COUNT(r.id) as regiones, COUNT(t.id) as tiendas
        FROM cat_companias c
        LEFT JOIN cat_regiones r ON r.compania_id = c.id
        LEFT JOIN cat_zonas z ON z.region_id = r.id
        LEFT JOIN tiendas t ON t.zona_id = z.id
        GROUP BY c.nombre
        ORDER BY c.nombre
    """)
    for row in cur.fetchall():
        print(f"   {row[0]:<12} {row[1]:>2} regiones   {row[2]:>4} tiendas")

    cur.execute("""
        SELECT COUNT(*) FROM cat_regiones WHERE compania_id IS NULL
    """)
    sin_compania = cur.fetchone()[0]
    if sin_compania:
        print(f"\n   [!]  {sin_compania} región(es) sin compañía asignada:")
        cur.execute("SELECT id, nombre FROM cat_regiones WHERE compania_id IS NULL")
        for r in cur.fetchall():
            print(f"      id={r[0]}  {r[1]}")

    print("\n[OK] migrar_companias.py completado\n")
    conn.close()


if __name__ == "__main__":
    run()
