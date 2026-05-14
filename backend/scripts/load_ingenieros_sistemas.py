"""
Carga los ingenieros de campo de Sistemas como usuarios AGENTE.
Datos extraidos de: Ingenieros por Region Operaciones.xlsx

Grupos de Sistemas en BD:
  id=15  Sistemas: Soporte           (fallback nacional)
  id=16  Sistemas: Comunicaciones
  id=17  Sistemas: SION
  id=18  Sistemas: Abasto
  id=19  Sistemas: CEDIS
  id=39  Corporativo
  id=40  Sistemas: Soporte CENTRO
  id=41  Sistemas: Soporte ORIENTE
  id=42  Sistemas: Soporte PONIENTE
  id=43  Sistemas: Soporte SURESTE
  id=44  Sistemas: Soporte VERACRUZ

Ejecutar:
    cd backend
    python scripts/load_ingenieros_sistemas.py

Para revertir (eliminar solo los usuarios cargados por este script):
    python scripts/load_ingenieros_sistemas.py --revertir
"""
import os, sys, psycopg2
from hashlib import sha256

def get_db_url():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip()
    raise ValueError("DATABASE_URL no encontrado en .env")


GRUPO_POR_COMPANIA = {
    "CENTRO":   40,  # Sistemas: Soporte CENTRO
    "ORIENTE":  41,  # Sistemas: Soporte ORIENTE
    "PONIENTE": 42,  # Sistemas: Soporte PONIENTE
    "SURESTE":  43,  # Sistemas: Soporte SURESTE
    "VERACRUZ": 44,  # Sistemas: Soporte VERACRUZ
}

PASSWORD_DEFAULT = "Neto2024!"

# ── Ingenieros (fuente: Excel, hoja Hoja1) ────────────────────────────────────
# Formato: (nombre, email, region_bd, compania)
# VACANTES no se cargan.
# Notas:
#   - VALLE (Oriente) → zona dentro de región "Oriente" en BD (id=17)
#   - COATZA OLMECA (Sureste) → mapeado a región "Tabasco" (geografía más cercana en BD)
INGENIEROS = [
    # ── CENTRO (coord. Alexander Vargas García) ───────────────
    ("Jose de Jesus Leal Martinez",       "jleal@tiendasneto.com",       "Centro CDMX",       "CENTRO"),
    ("Raul Carmona Santos",               "rcarmona@tiendasneto.com",    "Metro Norte",       "CENTRO"),
    ("Cristian Uriel Rosillo Arteche",    "crosillo@tiendasneto.com",    "Norte",             "CENTRO"),
    ("Josue Zavala Martinez",             "jzavala@tiendasneto.com",     "Ecatepec",          "CENTRO"),
    ("Victor Hugo Olavide Meza",          "volavide@tiendasneto.com",    "Bajío",             "CENTRO"),
    ("Horacio Chavez Beltran",            "hchavez@tiendasneto.com",     "Michoacán",         "CENTRO"),
    ("Juan Carlos Miranda Godoy",         "jmiranda@tiendasneto.com",    "Toluca",            "CENTRO"),

    # ── ORIENTE (coord. Héctor Israel Ramírez González) ───────
    # PUEBLA: VACANTE -- no se carga
    ("Angel Herrera Cruz",                "aherrera@tiendasneto.com",    "Iztapalapa",        "ORIENTE"),
    ("Kevin Fernando Aboytes Trejo",      "kaboytes@tiendasneto.com",    "Metro Sur",         "ORIENTE"),
    ("Juan Eduardo Guzman Ruiz",          "jguzman@tiendasneto.com",     "Neza",              "ORIENTE"),
    ("Ricardo Pacheco Mata",              "rpacheco@tiendasneto.com",    "Oriente",           "ORIENTE"),  # Excel: VALLE

    # ── PONIENTE (coord. Luis Jesús Santos Galeana) ────────────
    ("Lenis Jossue Espinoza Sanchez",     "lespinoza@tiendasneto.com",   "Acapulco Centro",   "PONIENTE"),
    ("Angel Daniel Olivares Gonzalez",    "aolivares@tiendasneto.com",   "Acapulco Montaña",  "PONIENTE"),
    ("Omar Aleana Huerta",                "oaleana@tiendasneto.com",     "Acapulco Oriente",  "PONIENTE"),
    ("Ivan Jonathan Cuevas Palma",        "icuevas@tiendasneto.com",     "Acapulco Poniente", "PONIENTE"),
    ("Daniel Enrique de Jesus Pelaez",    "dpelaez@tiendasneto.com",     "Morelos",           "PONIENTE"),
    ("Francisco Alonso Flores",           "falonso@tiendasneto.com",     "Oaxaca",            "PONIENTE"),
    ("Erick Reyes Ruiz",                  "ereyes@tiendasneto.com",      "Oaxaca Costa",      "PONIENTE"),

    # ── SURESTE (coord. Luis Enrique Méndez García) ────────────
    # CHIAPAS, CHIAPAS SOCONUSCO, TABASCO: VACANTES -- no se cargan
    ("Omar Sanchez Morales",              "osanchez@tiendasneto.com",    "Tabasco",           "SURESTE"),   # Excel: COATZA OLMECA
    ("Roman Alejandro Itza Colli",        "ritza@tiendasneto.com",       "Yucatán",           "SURESTE"),

    # ── VERACRUZ (coord. Héctor Alberto Cortés Contreras) ──────
    ("Rafael Flores Martin del Campo",    "rflores@tiendasneto.com",     "Veracruz Centro",   "VERACRUZ"),
    ("Cristian Omar Cruz Martinez",       "ccruz@tiendasneto.com",       "Veracruz Norte",    "VERACRUZ"),
    ("Neftali Ocampo Osorio",             "nocampo@tiendasneto.com",     "Veracruz Sur",      "VERACRUZ"),
]

# Emails que ya existen en BD y NO deben duplicarse
EMAILS_EXISTENTES_A_OMITIR = {
    "luis.santos@tiendasneto.com",   # ya está en Sistemas: Comunicaciones
    "juana.perez@tiendasneto.com",   # ya está en Sistemas: CEDIS
    "jesalas@tiendasneto.com",       # ya está en Sistemas: Soporte
}


def hash_bcrypt_simple(password: str) -> str:
    """
    Genera hash compatible con passlib bcrypt.
    Requiere: pip install bcrypt
    """
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    except ImportError:
        raise ImportError("Instala bcrypt: pip install bcrypt")


def run(revertir=False):
    conn = psycopg2.connect(get_db_url())
    cur = conn.cursor()

    if revertir:
        emails = [e for _, e, _, _ in INGENIEROS]
        cur.execute(
            "DELETE FROM usuarios WHERE email = ANY(%s) AND rol='AGENTE'",
            (emails,)
        )
        conn.commit()
        print(f"[del]  {cur.rowcount} ingenieros eliminados")
        conn.close()
        return

    # Verificar que los grupos existen
    grupo_ids = set(GRUPO_POR_COMPANIA.values())
    cur.execute("SELECT id FROM cat_grupos WHERE id = ANY(%s)", (list(grupo_ids),))
    grupos_ok = {r[0] for r in cur.fetchall()}
    grupos_faltantes = grupo_ids - grupos_ok
    if grupos_faltantes:
        print(f"[ERROR] Grupos no encontrados en BD: {grupos_faltantes}")
        print("   Verifica GRUPO_POR_COMPANIA en este script.")
        conn.close()
        return

    try:
        pwd_hash = hash_bcrypt_simple(PASSWORD_DEFAULT)
    except ImportError as e:
        print(f"[ERROR] {e}")
        conn.close()
        return

    print(f"[worker] Cargando {len(INGENIEROS)} ingenieros como AGENTE...\n")
    cargados = 0
    omitidos = 0
    ya_existian = 0

    for nombre, email, region_nombre, compania in INGENIEROS:
        if email in EMAILS_EXISTENTES_A_OMITIR:
            print(f"  [skip]  Omitido (ya existe): {nombre}")
            omitidos += 1
            continue

        # Verificar si ya existe
        cur.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
        if cur.fetchone():
            print(f"  [skip]  Ya en BD: {nombre} ({email})")
            ya_existian += 1
            continue

        grupo_id = GRUPO_POR_COMPANIA[compania]

        cur.execute("""
            INSERT INTO usuarios (nombre, email, hashed_password, rol, grupo_id, activo)
            VALUES (%s, %s, %s, 'AGENTE', %s, true)
        """, (nombre, email, pwd_hash, grupo_id))

        print(f"  [OK] {nombre:<45} grupo_id={grupo_id}  ({compania}/{region_nombre})")
        cargados += 1

    conn.commit()

    print(f"""
-----------------------------------------
  Cargados    : {cargados}
  Ya existían : {ya_existian}
  Omitidos    : {omitidos}
-----------------------------------------
[!]  Recuerda confirmar el mapeo de grupos en GRUPO_POR_COMPANIA
   y reasignar si es necesario desde el panel Admin.
""")

    conn.close()


if __name__ == "__main__":
    revertir = "--revertir" in sys.argv
    run(revertir=revertir)
