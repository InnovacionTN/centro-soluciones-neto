"""
paso0_setup.py — Paso 0: Sincronización organizacional CSN

Tareas:
  1. Crear/actualizar 5 coordinadores (COORDINADOR role + grupo por compañía)
  2. Sincronizar cat_regiones contra las 28 oficiales del Excel
     - Elimina regiones que NO están en el Excel (+ sus zonas en cascada)
     - Crea regiones faltantes con compania_id correcto
  3. Reset contraseñas de todos los usuarios TIENDA → Neto2024!
  4. Crear 10 tiendas ficticias para pruebas de enrutamiento

Uso:
    cd backend
    python scripts/paso0_setup.py --dry-run   # muestra sin modificar
    python scripts/paso0_setup.py             # ejecuta cambios
    python scripts/paso0_setup.py --solo=1    # solo tarea 1 (1-4)
"""

import os, sys
import psycopg2
from psycopg2.extras import RealDictCursor

# ── helpers ──────────────────────────────────────────────────────────────────

def get_db_url():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip()
    raise ValueError("DATABASE_URL no encontrado en .env")


def hash_bcrypt(password: str) -> str:
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    except ImportError:
        raise ImportError("pip install bcrypt")


DRY = '--dry-run' in sys.argv
SOLO = None
for a in sys.argv:
    if a.startswith('--solo='):
        SOLO = int(a.split('=')[1])

COLOR = {
    'ok':   '\033[92m',
    'warn': '\033[93m',
    'err':  '\033[91m',
    'info': '\033[94m',
    'dim':  '\033[2m',
    'end':  '\033[0m',
}

def ok(msg):   print(f"{COLOR['ok']}  [OK]  {msg}{COLOR['end']}")
def warn(msg): print(f"{COLOR['warn']}  [!!]  {msg}{COLOR['end']}")
def err(msg):  print(f"{COLOR['err']}  [ERR] {msg}{COLOR['end']}")
def info(msg): print(f"{COLOR['info']}  [--]  {msg}{COLOR['end']}")
def dim(msg):  print(f"{COLOR['dim']}        {msg}{COLOR['end']}")
def sep(t=''):
    if t:
        print(f"\n{'-'*60}")
        print(f"  {t}")
        print(f"{'-'*60}")
    else:
        print()


PASSWORD_DEFAULT = "Neto2024!"

# grupo_id por compañía (Sistemas: Soporte XXXX, ya existen en BD)
GRUPO_POR_COMPANIA = {
    "CENTRO":   40,
    "ORIENTE":  41,
    "PONIENTE": 42,
    "SURESTE":  43,
    "VERACRUZ": 44,
}

# ── 1. COORDINADORES ──────────────────────────────────────────────────────────

COORDINADORES = [
    {
        "nombre":   "ALEXANDER VARGAS GARCIA",
        "email":    "alexander.vargas@tiendasneto.com",
        "compania": "CENTRO",
        "existing_id": None,   # no existe en BD; se creará
    },
    {
        "nombre":   "HECTOR ISRAEL RAMIREZ GONZALEZ",
        "email":    "hramirez@tiendasneto.com",
        "compania": "ORIENTE",
        "existing_id": None,
    },
    {
        "nombre":   "LUIS JESUS SANTOS GALEANA",
        "email":    "luis.santos@tiendasneto.com",   # ya existe ID:3691 como AGENTE
        "compania": "PONIENTE",
        "existing_id": 3691,
    },
    {
        "nombre":   "LUIS ENRIQUE MENDEZ GARCIA",
        "email":    "luis.mendez@tiendasneto.com",
        "compania": "SURESTE",
        "existing_id": None,
    },
    {
        "nombre":   "HECTOR ALBERTO CORTES CONTRERAS",
        "email":    "hcortes@tiendasneto.com",
        "compania": "VERACRUZ",
        "existing_id": None,
    },
]

# ── 2. REGIONES OFICIALES (fuente: Excel entregado por coordinación) ──────────

REGIONES_OFICIALES = {
    "CENTRO":   [
        "CENTRO",
        "METRO NORTE",
        "NORTE",
        "NUEVO ECATEPEC",
        "OCCIDENTE BAJÍO",
        "OCCIDENTE MICHOACÁN NORTE",
        "OCCIDENTE MICHOACÁN SUR",
        "TOLUCA",
    ],
    "ORIENTE":  [
        "IZTAPALAPA",
        "METRO SUR",
        "NEZA",
        "PUEBLA",
        "VALLE",
    ],
    "PONIENTE": [
        "ACAPULCO CENTRO",
        "ACAPULCO MONTAÑA",
        "ACAPULCO ORIENTE",
        "ACAPULCO PONIENTE",
        "MORELOS",
        "OAXACA",
        "OAXACA COSTA",
    ],
    "SURESTE":  [
        "CHIAPAS",
        "CHIAPAS SOCONUSCO",
        "COATZA OLMECA",
        "TABASCO",
        "YUCATAN",
    ],
    "VERACRUZ": [
        "VERACRUZ CENTRO",
        "VERACRUZ NORTE",
        "VERACRUZ SUR",
    ],
}

# set plano de nombres oficiales (uppercase normalizado)
NOMBRES_OFICIALES = {r.upper().strip() for regions in REGIONES_OFICIALES.values() for r in regions}

# ── 4. TIENDAS FICTICIAS ──────────────────────────────────────────────────────

# Se asignan a zonas existentes; zona se resolverá en runtime por región.
# Formato: (nombre, correo_corporativo, region_nombre, compania)
TIENDAS_FICTICIAS = [
    ("TEST CENTRO 001",      "t001@test.csn",   "CENTRO",                 "CENTRO"),
    ("TEST METRO NORTE 001", "t002@test.csn",   "METRO NORTE",            "CENTRO"),
    ("TEST ORIENTE 001",     "t003@test.csn",   "IZTAPALAPA",             "ORIENTE"),
    ("TEST VALLE 001",       "t004@test.csn",   "VALLE",                  "ORIENTE"),
    ("TEST PONIENTE 001",    "t005@test.csn",   "ACAPULCO CENTRO",        "PONIENTE"),
    ("TEST MORELOS 001",     "t006@test.csn",   "MORELOS",                "PONIENTE"),
    ("TEST SURESTE 001",     "t007@test.csn",   "TABASCO",                "SURESTE"),
    ("TEST YUCATAN 001",     "t008@test.csn",   "YUCATAN",                "SURESTE"),
    ("TEST VER NORTE 001",   "t009@test.csn",   "VERACRUZ NORTE",         "VERACRUZ"),
    ("TEST VER SUR 001",     "t010@test.csn",   "VERACRUZ SUR",           "VERACRUZ"),
]


def new_conn():
    """Abre una nueva conexión fresca (Neon cierra conexiones largas)."""
    conn = psycopg2.connect(get_db_url())
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)
    return conn, cur


# Pre-calcular el hash ANTES de abrir cualquier conexión (bcrypt es lento)
PWD_HASH = None

def get_pwd_hash():
    global PWD_HASH
    if PWD_HASH is None:
        info("Generando hash bcrypt (puede tardar ~1s)...")
        PWD_HASH = hash_bcrypt(PASSWORD_DEFAULT)
        ok("Hash generado")
    return PWD_HASH


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def run():
    if DRY:
        warn("MODO DRY-RUN: no se aplicarán cambios en la BD")
    else:
        # Pre-compute hash before opening any DB connection
        try:
            get_pwd_hash()
        except ImportError as e:
            err(str(e)); sys.exit(1)

    if SOLO is None or SOLO == 1:
        conn, cur = new_conn()
        tarea_1_coordinadores(cur, conn)
        conn.close()
    if SOLO is None or SOLO == 2:
        conn, cur = new_conn()
        tarea_2_regiones(cur, conn)
        conn.close()
    if SOLO is None or SOLO == 3:
        conn, cur = new_conn()
        tarea_3_passwords(cur, conn)
        conn.close()
    if SOLO is None or SOLO == 4:
        conn, cur = new_conn()
        tarea_4_tiendas_ficticias(cur, conn)
        conn.close()

    sep()
    if DRY:
        warn("DRY-RUN completado — ejecuta sin --dry-run para aplicar cambios")
    else:
        ok("Paso 0 completado exitosamente ✓")


# ─────────────────────────────────────────────────────────────────────────────
# Tarea 1: Coordinadores
# ─────────────────────────────────────────────────────────────────────────────

def tarea_1_coordinadores(cur, conn):
    sep("TAREA 1 — Coordinadores")

    # Verificar que los grupos destino existen
    cur.execute("SELECT id, nombre FROM cat_grupos WHERE id = ANY(%s)",
                (list(GRUPO_POR_COMPANIA.values()),))
    grupos_bd = {r['id']: r['nombre'] for r in cur.fetchall()}
    for comp, gid in GRUPO_POR_COMPANIA.items():
        if gid not in grupos_bd:
            err(f"Grupo {gid} ({comp}) no encontrado en BD — aborta tarea 1")
            return
        dim(f"Grupo {gid} '{grupos_bd[gid]}' → {comp} ✓")

    pwd_hash = get_pwd_hash() if not DRY else "DRY"

    for coord in COORDINADORES:
        nombre    = coord['nombre']
        email     = coord['email']
        compania  = coord['compania']
        eid       = coord['existing_id']
        grupo_id  = GRUPO_POR_COMPANIA[compania]

        # Buscar por email (más confiable que ID hardcodeado)
        cur.execute("SELECT id, nombre, rol, grupo_id FROM usuarios WHERE email=%s", (email,))
        row = cur.fetchone()

        if row:
            uid = row['id']
            old_rol = row['rol']
            old_grp = row['grupo_id']
            if old_rol == 'COORDINADOR' and old_grp == grupo_id:
                ok(f"Ya correcto: {nombre} (id={uid}) COORDINADOR/{compania}")
            else:
                info(f"Actualizando: {nombre} (id={uid}) {old_rol}→COORDINADOR grupo {old_grp}→{grupo_id}")
                if not DRY:
                    cur.execute("""
                        UPDATE usuarios
                           SET rol='COORDINADOR', grupo_id=%s, activo=true
                         WHERE id=%s
                    """, (grupo_id, uid))
                    conn.commit()
                    ok(f"Actualizado: {nombre}")
        else:
            info(f"Creando nuevo: {nombre}  email={email}  compañía={compania}")
            if not DRY:
                cur.execute("""
                    INSERT INTO usuarios (nombre, email, hashed_password, rol, grupo_id, activo)
                    VALUES (%s, %s, %s, 'COORDINADOR', %s, true)
                    RETURNING id
                """, (nombre, email, pwd_hash, grupo_id))
                uid = cur.fetchone()['id']
                conn.commit()
                ok(f"Creado: {nombre} → id={uid}")


# ─────────────────────────────────────────────────────────────────────────────
# Tarea 2: Regiones
# Estrategia: RENOMBRAR regiones existentes cuando hay correspondencia obvia,
# CREAR las genuinamente nuevas. NUNCA eliminar una región con tiendas.
# ─────────────────────────────────────────────────────────────────────────────

# Mapa de renombrado: nombre_actual_en_BD (uppercase) → nombre_oficial_Excel
RENOMBRAR_REGIONES = {
    "BAJÍO":       "OCCIDENTE BAJÍO",
    "CENTRO CDMX": "CENTRO",
    "ECATEPEC":    "NUEVO ECATEPEC",
    "MICHOACÁN":   "OCCIDENTE MICHOACÁN NORTE",  # Split: Sur se crea vacía
    "ORIENTE":     "VALLE",                       # 0 tiendas, seguro
    "YUCATÁN":     "YUCATAN",                     # solo acento diferente
}


def tarea_2_regiones(cur, conn):
    sep("TAREA 2 — Sincronizacion de regiones")

    # Obtener companias
    cur.execute("SELECT id, nombre FROM cat_companias")
    companias_bd = {r['nombre'].upper().strip(): r['id'] for r in cur.fetchall()}
    info(f"Companias en BD: {list(companias_bd.keys())}")

    for comp in REGIONES_OFICIALES:
        if comp not in companias_bd:
            err(f"Compania '{comp}' no encontrada en BD — verifica cat_companias")
            return

    # Regiones actuales en BD
    cur.execute("SELECT id, nombre, compania_id, activo FROM cat_regiones ORDER BY nombre")
    regiones_bd  = cur.fetchall()
    nombres_bd   = {r['nombre'].upper().strip(): r for r in regiones_bd}

    info(f"Regiones en BD: {len(regiones_bd)}")
    info(f"Regiones oficiales (Excel): {sum(len(v) for v in REGIONES_OFICIALES.values())}")
    sep()

    # — A) RENOMBRAR regiones con nombre diferente —
    for nombre_viejo_key, nombre_nuevo in RENOMBRAR_REGIONES.items():
        if nombre_viejo_key not in nombres_bd:
            dim(f"Rename skip (no esta en BD): '{nombre_viejo_key}'")
            continue
        if nombre_nuevo.upper().strip() in nombres_bd:
            ok(f"Ya renombrada: '{nombre_viejo_key}' → '{nombre_nuevo}'")
            continue
        r = nombres_bd[nombre_viejo_key]
        cur.execute("SELECT COUNT(*) AS n FROM cat_zonas WHERE region_id=%s", (r['id'],))
        n_zonas = cur.fetchone()['n']
        cur.execute("""
            SELECT COUNT(*) AS n FROM tiendas t
            JOIN cat_zonas z ON t.zona_id=z.id WHERE z.region_id=%s
        """, (r['id'],))
        n_tiendas = cur.fetchone()['n']
        info(f"Renombrando '{r['nombre']}' → '{nombre_nuevo}'  ({n_zonas} zonas, {n_tiendas} tiendas)")
        if not DRY:
            cur.execute("UPDATE cat_regiones SET nombre=%s WHERE id=%s", (nombre_nuevo, r['id']))

    if not DRY:
        conn.commit()
        # Refrescar mapa tras renombrado
        cur.execute("SELECT id, nombre, compania_id, activo FROM cat_regiones ORDER BY nombre")
        regiones_bd = cur.fetchall()
        nombres_bd  = {r['nombre'].upper().strip(): r for r in regiones_bd}

    # — B) CREAR regiones genuinamente nuevas —
    a_crear = []
    for compania, nombres in REGIONES_OFICIALES.items():
        for nombre in nombres:
            if nombre.upper().strip() not in nombres_bd:
                a_crear.append((nombre, compania, companias_bd[compania]))

    if a_crear:
        info(f"Regiones a CREAR ({len(a_crear)}):")
        for nombre, compania, cid in a_crear:
            info(f"  '{nombre}' → compania {compania} (id={cid})")
            if not DRY:
                cur.execute("""
                    INSERT INTO cat_regiones (nombre, compania_id, activo)
                    VALUES (%s, %s, true)
                    ON CONFLICT (nombre) DO UPDATE SET compania_id=%s, activo=true
                """, (nombre, cid, cid))
        if not DRY:
            conn.commit()
            ok(f"Creadas {len(a_crear)} regiones nuevas")
    else:
        ok("No hay regiones nuevas que crear")

    # — C) Corregir compania_id en regiones que ya matchean nombre pero tienen compania incorrecta —
    if not DRY:
        cur.execute("SELECT id, nombre, compania_id FROM cat_regiones")
        regiones_bd = cur.fetchall()
        nombres_bd  = {r['nombre'].upper().strip(): r for r in regiones_bd}

    for compania, nombres in REGIONES_OFICIALES.items():
        cid = companias_bd[compania]
        for nombre in nombres:
            nombre_norm = nombre.upper().strip()
            if nombre_norm in nombres_bd:
                r = nombres_bd[nombre_norm]
                if r['compania_id'] != cid:
                    warn(f"Corrigiendo compania_id de '{nombre}': {r['compania_id']} → {cid}")
                    if not DRY:
                        cur.execute("UPDATE cat_regiones SET compania_id=%s WHERE id=%s",
                                    (cid, r['id']))
    if not DRY:
        conn.commit()

    # — D) Detectar regiones en BD que NO tienen equivalente en Excel —
    cur.execute("SELECT id, nombre FROM cat_regiones ORDER BY nombre")
    todas = cur.fetchall()
    nombres_excel_norm = {n.upper().strip() for ns in REGIONES_OFICIALES.values() for n in ns}
    huerfanas = [r for r in todas if r['nombre'].upper().strip() not in nombres_excel_norm]
    if huerfanas:
        warn(f"Regiones en BD sin equivalente en Excel (no se eliminan por seguridad):")
        for r in huerfanas:
            cur.execute("""
                SELECT COUNT(*) AS n FROM tiendas t
                JOIN cat_zonas z ON t.zona_id=z.id WHERE z.region_id=%s
            """, (r['id'],))
            n = cur.fetchone()['n']
            warn(f"  id={r['id']} '{r['nombre']}' ({n} tiendas) — accion manual si necesario")
    else:
        ok("Todas las regiones en BD tienen equivalente en Excel")

    # — Resumen —
    cur.execute("SELECT COUNT(*) AS n FROM cat_regiones WHERE activo=true")
    total = cur.fetchone()['n']
    info(f"Total regiones activas: {total}")


# ─────────────────────────────────────────────────────────────────────────────
# Tarea 3: Reset contraseñas TIENDA
# ─────────────────────────────────────────────────────────────────────────────

def tarea_3_passwords(cur, conn):
    sep("TAREA 3 — Reset contraseñas cuentas TIENDA")

    cur.execute("SELECT COUNT(*) AS n FROM usuarios WHERE rol='TIENDA'")
    total = cur.fetchone()['n']
    info(f"Cuentas TIENDA en BD: {total}")

    if DRY:
        warn(f"DRY-RUN: se resetearían {total} contraseñas a '{PASSWORD_DEFAULT}'")
        return

    pwd_hash = get_pwd_hash()
    cur.execute("""
        UPDATE usuarios SET hashed_password=%s
        WHERE rol='TIENDA'
    """, (pwd_hash,))
    conn.commit()
    ok(f"Contrasenas reseteadas: {cur.rowcount} cuentas → '{PASSWORD_DEFAULT}'")


# ─────────────────────────────────────────────────────────────────────────────
# Tarea 4: Tiendas ficticias
# ─────────────────────────────────────────────────────────────────────────────

def tarea_4_tiendas_ficticias(cur, conn):
    sep("TAREA 4 — Tiendas ficticias para pruebas")

    # Obtener regiones actualizadas
    cur.execute("SELECT id, nombre FROM cat_regiones")
    regiones_map = {r['nombre'].upper().strip(): r['id'] for r in cur.fetchall()}

    # Para cada tienda ficticia, buscamos UNA zona en la región (la primera activa)
    # Si no hay zonas en la región, la creamos como zona genérica.
    creadas = 0
    for nombre, correo, region_nombre, compania in TIENDAS_FICTICIAS:
        region_key = region_nombre.upper().strip()

        # ¿Ya existe la tienda test?
        cur.execute("SELECT id FROM tiendas WHERE correo_corporativo=%s", (correo,))
        if cur.fetchone():
            dim(f"Ya existe: {nombre}")
            continue

        # Obtener región
        if region_key not in regiones_map:
            warn(f"Región '{region_nombre}' no encontrada para {nombre} — saltando")
            continue
        region_id = regiones_map[region_key]

        # Obtener zona en esa región (la primera disponible)
        cur.execute("""
            SELECT id FROM cat_zonas WHERE region_id=%s AND activo=true LIMIT 1
        """, (region_id,))
        zona_row = cur.fetchone()

        if zona_row:
            zona_id = zona_row['id']
        else:
            # Crear zona genérica para esta región
            info(f"Creando zona genérica para región '{region_nombre}'")
            if not DRY:
                cur.execute("""
                    INSERT INTO cat_zonas (nombre, region_id, activo)
                    VALUES (%s, %s, true) RETURNING id
                """, (f"Zona {region_nombre}", region_id))
                zona_id = cur.fetchone()['id']
            else:
                zona_id = -1

        info(f"Creando tienda ficticia: {nombre}  zona_id={zona_id}  ({compania}/{region_nombre})")
        if not DRY:
            # Crear tienda
            cur.execute("""
                INSERT INTO tiendas (nombre, zona_id, correo_corporativo, empresa, activo)
                VALUES (%s, %s, %s, 'TEST', true)
                RETURNING id
            """, (nombre, zona_id, correo))
            tienda_id = cur.fetchone()['id']

            # Crear usuario TIENDA para esta tienda
            cur.execute("""
                INSERT INTO usuarios (nombre, email, hashed_password, rol, tienda_id, activo)
                VALUES (%s, %s, %s, 'TIENDA', %s, true)
                ON CONFLICT (email) DO NOTHING
            """, (nombre, correo, get_pwd_hash(), tienda_id))

            creadas += 1
            ok(f"Creada: {nombre} (tienda_id={tienda_id})")

    if not DRY:
        conn.commit()
        ok(f"Total tiendas ficticias creadas: {creadas}")
    else:
        warn(f"DRY-RUN: se crearían {len(TIENDAS_FICTICIAS)} tiendas ficticias")


if __name__ == "__main__":
    run()
