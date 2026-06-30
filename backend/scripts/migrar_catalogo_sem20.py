"""
migrar_catalogo_sem20.py — Corrige catálogo y carga tiendas Sem 20/2026
========================================================================
PREREQUISITO: models.py ya actualizado con latitud/longitud en Tienda.

Pasos:
  0 — Auditoría previa: muestra dependencias de zonas/regiones (sin cambios)
  1 — Renombra las 19 regiones (Title Case → UPPER CASE)
  2 — Crea las 9 regiones nuevas que faltan en BD
  3 — Crea las 234 zonas reales; desactiva zonas del seed sin dependencias
  4 — Agrega columnas latitud/longitud a la tabla tiendas en BD
  5 — Carga/actualiza las 1 959 tiendas desde el Excel

Uso:
    cd backend
    python scripts/migrar_catalogo_sem20.py --paso 0   # auditar primero
    python scripts/migrar_catalogo_sem20.py --paso 1
    ...
    python scripts/migrar_catalogo_sem20.py --paso 5
    python scripts/migrar_catalogo_sem20.py --todos    # todos en orden
    python scripts/migrar_catalogo_sem20.py --paso 1 --dry-run
"""

import sys, os, argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.models import Compania, Region, Zona, Tienda, Usuario, ReglaRuteo

EXCEL_NOMBRE = "Catalogo_Tiendas_NETO_Sem_20_2026.xlsx"


def _buscar_excel():
    """Busca el Excel en varias ubicaciones comunes del proyecto."""
    base = os.path.dirname(os.path.abspath(__file__))
    candidatos = [
        os.environ.get("EXCEL_TIENDAS", ""),
        os.path.join(base, EXCEL_NOMBRE),
        os.path.join(base, "..", EXCEL_NOMBRE),
        os.path.join(base, "..", "..", EXCEL_NOMBRE),
        os.path.join(base, "..", "..", "..", EXCEL_NOMBRE),
    ]
    for ruta in candidatos:
        if ruta and os.path.exists(os.path.abspath(ruta)):
            return os.path.abspath(ruta)
    return None


EXCEL_PATH = _buscar_excel()

# ── Catálogo fuente de verdad ─────────────────────────────────────────────────

COMPANIAS_REGIONES = {
    "CENTRO": [
        "CENTRO",
        "METRO NORTE",
        "NORTE",
        "NUEVO ECATEPEC",
        "OCCIDENTE BAJÍO",
        "OCCIDENTE MICHOACÁN NORTE",
        "OCCIDENTE MICHOACÁN SUR",
        "TOLUCA",
    ],
    "ORIENTE": ["IZTAPALAPA", "METRO SUR", "NEZA", "PUEBLA", "VALLE"],
    "PONIENTE": [
        "ACAPULCO CENTRO",
        "ACAPULCO MONTAÑA",
        "ACAPULCO ORIENTE",
        "ACAPULCO PONIENTE",
        "MORELOS",
        "OAXACA",
        "OAXACA COSTA",
    ],
    "SURESTE": ["CHIAPAS", "CHIAPAS SOCONUSCO", "COATZA OLMECA", "TABASCO", "YUCATAN"],
    "VERACRUZ": ["VERACRUZ CENTRO", "VERACRUZ NORTE", "VERACRUZ SUR"],
}

RENAME_REGIONES = {
    "Acapulco Centro": "ACAPULCO CENTRO",
    "Acapulco Montaña": "ACAPULCO MONTAÑA",
    "Acapulco Oriente": "ACAPULCO ORIENTE",
    "Acapulco Poniente": "ACAPULCO PONIENTE",
    "Chiapas": "CHIAPAS",
    "Iztapalapa": "IZTAPALAPA",
    "Metro Norte": "METRO NORTE",
    "Metro Sur": "METRO SUR",
    "Morelos": "MORELOS",
    "Neza": "NEZA",
    "Norte": "NORTE",
    "Oaxaca": "OAXACA",
    "Oaxaca Costa": "OAXACA COSTA",
    "Puebla": "PUEBLA",
    "Tabasco": "TABASCO",
    "Toluca": "TOLUCA",
    "Veracruz Centro": "VERACRUZ CENTRO",
    "Veracruz Norte": "VERACRUZ NORTE",
    "Veracruz Sur": "VERACRUZ SUR",
}

ZONAS_POR_REGION = {
    "ACAPULCO CENTRO": [
        "ACAPULCO",
        "ACAPULCO CALZADA",
        "ACAPULCO CENTRO",
        "ACAPULCO HOSPITALES",
        "ACAPULCO PERIFERIA",
        "ACAPULCO RURAL",
        "ACAPULCO TRADICIONAL",
        "ACAPULCO URBANO",
        "TEHUACALCO",
        "VICENTE GUERRERO",
    ],
    "ACAPULCO MONTAÑA": [
        "CHILPANCINGO PERIFERIA",
        "COSTA LIBRE",
        "GUERRERO CAPITAL",
        "GUERRERO NORTE",
        "GUERRERO PONIENTE",
        "MONTAÑA",
        "MONTAÑA ALTA",
        "SIERRA GUERRERO",
        "TIXTLA",
    ],
    "ACAPULCO ORIENTE": [
        "ACAPULCO COSTA",
        "COSTA CHICA",
        "COSTA DEL ESTE",
        "COSTA DORADA",
        "DIAMANTE",
        "MARQUELIA",
    ],
    "ACAPULCO PONIENTE": [
        "ACAPULCO EJIDO",
        "COSTA DEL SOL",
        "COSTA GRANDE",
        "LA UNIÓN GUERRERO",
        "LAZARO CARDENAS",
        "PETATLAN COSTA",
        "ZIHUATANEJO",
    ],
    "CENTRO": [
        "AZCAPOTZALCO",
        "CENTRO",
        "GAM ARAGÓN",
        "GAM CENTRO",
        "GAM PERIFERICO",
        "GUSTAVO A MADERO",
        "IZTACALCO",
        "MIGUEL HIDALGO",
        "VENUSTIANO CARRANZA",
    ],
    "CHIAPAS": [
        "CHIAPAS BOSQUES",
        "CHIAPAS COSTA",
        "CHIAPAS FRAILESCA",
        "CHIAPAS ISTMO COSTA",
        "CHIAPAS MESETA COMITECA",
        "CHIAPAS SIERRA MARISCAL",
        "CHIAPAS ZOQUE",
        "TUXTLA 2",
        "TUXTLA CENTRO",
    ],
    "CHIAPAS SOCONUSCO": [
        "CHIAPAS FRONTERA",
        "TAPACHULA 1",
        "TAPACHULA COSTA",
        "TAPACHULA MERCADO",
        "TAPACHULA MONTAÑA",
    ],
    "COATZA OLMECA": ["ACAYUCAN", "CHOAPAS", "COATZA", "COATZA 2", "LA VENTA", "MINA"],
    "IZTAPALAPA": [
        "AEROPUERTO",
        "CONSTITUCION IZTAPALAPA",
        "IZTAPALAPA ORIENTE",
        "NEZA SUR",
        "SAN LORENZO IZTAPALAPA",
        "SANTA CRUZ IZTAPALAPA",
        "VILLAS IZTAPALAPA",
        "ZARAGOZA IZTAPALAPA",
    ],
    "METRO NORTE": [
        "HIDALGO",
        "HIDALGO PONIENTE",
        "HIDALGO TULANCINGO",
        "HUEHUETOCA SAN JUAN",
        "OJO DE AGUA",
        "PACHUCA",
        "PACHUCA 2",
        "TECAMAC",
        "TIZAYUCA",
        "ZUMPANGO HUEHUETOCA",
    ],
    "METRO SUR": [
        "AJUSCO",
        "COYOACAN 2",
        "MAGDALENA CONTRERAS",
        "PEDREGAL",
        "PICACHO AJUSCO",
        "PLUS",
        "TEZONCO TLAHUAC",
        "TLAHUAC",
        "TLALPAN",
        "TULYEHUALCO",
        "XOCHIMILCO CENTRO",
    ],
    "MORELOS": [
        "CUAUTLA",
        "CUERNA",
        "JIUTEPEC",
        "MORELOS CENTRO",
        "ORIENTE",
        "SUR",
        "TAXCO",
    ],
    "NEZA": [
        "AYOTLA IXTAPALUCA",
        "CHICOLOAPAN",
        "CHIMALHUACAN",
        "LA PAZ NEZA",
        "LOS REYES",
        "NEZA",
        "NEZA ORIENTE",
        "PATOS CHIMALHUACAN",
        "SANTA BARBARA IXTAPALUCA",
    ],
    "NORTE": [
        "ALVARO OBREGON",
        "ATIZAPAN 1",
        "ATIZAPAN 2",
        "CUAJIMALPA",
        "NAUCALPAN 1",
        "NAUCALPAN 2",
        "NAUCALPAN 3",
        "NICOLAS ROMERO",
        "TLALNEPANTLA",
        "TULTITLAN",
    ],
    "NUEVO ECATEPEC": [
        "CHICONCUAC",
        "COACALCO",
        "CUAUTITLAN",
        "ECATEPEC ARAGON",
        "ECATEPEC PERIFERIA",
        "ECATEPEC SANTA CLARA",
        "ECATEPEC VALLE",
        "JARDINES DE MORELOS",
        "PRADOS",
        "REAL DEL VALLE",
    ],
    "OAXACA": [
        "ACATLAN",
        "AEROPUERTO OAXACA",
        "AQUIOAXACA",
        "CAPITAL OAXACA",
        "CAÑADA",
        "HUAJUAPAN",
        "MARMOLERA",
        "OAXACA ATOYAC",
        "OAXACA CENTRO",
        "SANTA LUCIA",
        "TLAXIACO",
    ],
    "OAXACA COSTA": [
        "COSTA",
        "COSTA CENTRO",
        "ISTMO",
        "JUCHITAN",
        "PINOTEPA",
        "PUERTO ESCONDIDO",
        "SALINA CRUZ",
        "SIERRA OAXACA",
    ],
    "OCCIDENTE BAJÍO": [
        "AGUASCALIENTES",
        "LA HUASTECA",
        "LA HUASTECA 2",
        "SAN LUIS POTOSI 2",
        "SAN LUIS POTOSI CAPITAL",
        "ZACATECAS",
        "ZACATECAS 2",
    ],
    "OCCIDENTE MICHOACÁN NORTE": [
        "JALISCO",
        "LEON",
        "PURÉPECHA",
        "REBOCERA",
        "TAPATIA",
        "TIERRA CALIENTE",
    ],
    "OCCIDENTE MICHOACÁN SUR": [
        "AGUACATERA",
        "CELAYA",
        "GUANAJUATO",
        "MONARCA",
        "QUERETARO MONTAÑA",
        "QUERETARO SUR",
    ],
    "PUEBLA": [
        "PUEBLA",
        "PUEBLA CAPITAL",
        "PUEBLA MONTAÑA 2",
        "PUEBLA ORIENTE",
        "PUEBLA PONIENTE",
        "PUEBLA SUR",
        "PUEBLA TLAXCALA",
        "PUEBLA VALLE",
        "TLAXCALA 2",
    ],
    "TABASCO": [
        "CHONTALPA",
        "COMALCALCO",
        "JALPA",
        "MACUSPANA",
        "SIERRA",
        "VILLA",
        "VILLA 2",
        "VILLA 3",
    ],
    "TOLUCA": [
        "TOLUCA CENTRO",
        "TOLUCA CENTRO 2",
        "TOLUCA NORESTE",
        "TOLUCA NORTE",
        "TOLUCA ORIENTE",
        "TOLUCA PONIENTE",
        "TOLUCA SUR",
        "TOLUCA SURESTE",
    ],
    "VALLE": [
        "AMECAMECA",
        "CHALCO CENTRO",
        "COCOTITLAN",
        "IXTAPALUCA",
        "IXTAPALUCA CENTRO",
        "JARDINES CHALCO",
        "MIXQUIC",
        "TLAHUAC 2",
        "VALLE DE CHALCO",
        "XICO",
    ],
    "VERACRUZ CENTRO": [
        "BOCA DEL RIO",
        "CARDEL",
        "COATEPEC",
        "COSTA ESMERALDA",
        "HEROICA",
        "PORTUARIA",
        "TEZIUTLAN",
        "XALAPA",
    ],
    "VERACRUZ NORTE": [
        "ALAMO",
        "GUTIERREZ ZAMORA",
        "HUAUCHINANGO",
        "HUEJUTLA",
        "PAPANTLA",
        "POZA RICA",
        "TAMPICO NORTE",
        "TANTOYUCA",
        "TUXPAN",
    ],
    "VERACRUZ SUR": [
        "ALVARADO",
        "CAFETALERA",
        "CORDOBA",
        "CUENCA",
        "ORIZABA",
        "PIÑERA",
        "PUERTO",
        "TUXTEPEC",
        "TUXTLAS",
    ],
    "YUCATAN": [
        "BALAM",
        "BALUARTES",
        "CAMINO REAL",
        "CARMEN",
        "KANASIN",
        "MAYAPAN",
        "MERIDA SUR",
        "PALENQUE",
        "RIOS",
    ],
}

ZONAS_EXCEL_FLAT = {z for zs in ZONAS_POR_REGION.values() for z in zs}


def sep(n, titulo):
    print(f"\n{'=' * 62}")
    print(f"  PASO {n}: {titulo}")
    print("=" * 62)


def _dependencias_zona(db, zona):
    # SQL directo para evitar que el ORM haga SELECT de columnas
    # (latitud/longitud) que aun no existen en BD antes del paso 4
    zid = zona.id
    t = db.execute(
        text("SELECT COUNT(*) FROM tiendas      WHERE zona_id = :z"), {"z": zid}
    ).scalar()
    u = db.execute(
        text("SELECT COUNT(*) FROM usuarios     WHERE zona_id = :z"), {"z": zid}
    ).scalar()
    r = db.execute(
        text("SELECT COUNT(*) FROM matriz_ruteo WHERE zona_id = :z"), {"z": zid}
    ).scalar()
    return {"tiendas": t, "usuarios": u, "ruteo": r}


def _col_exists(conn, tabla, col):
    r = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": tabla, "c": col},
    )
    return r.scalar() > 0


# ── PASO 0 ────────────────────────────────────────────────────────────────────


def paso0_auditoria(db):
    sep(0, "AUDITORÍA PREVIA — sin cambios")

    todas_bd = db.query(Zona).all()
    extras = {z.nombre for z in todas_bd} - ZONAS_EXCEL_FLAT

    print(f"\n  Zonas del seed que NO están en el Excel ({len(extras)}):")
    print(f"  {'ZONA':<38} {'TIENDAS':>7} {'USUARIOS':>8} {'RUTEO':>6}  ACCIÓN")
    print(f"  {'-'*38} {'-'*7} {'-'*8} {'-'*6}  {'-'*22}")

    con_deps = []
    sin_deps = []
    for z_nombre in sorted(extras):
        for z in db.query(Zona).filter(Zona.nombre == z_nombre).all():
            d = _dependencias_zona(db, z)
            tiene = any(v > 0 for v in d.values())
            accion = "⚠️  CONSERVAR (manual)" if tiene else "✅ desactivar"
            print(
                f"  {z_nombre:<38} {d['tiendas']:>7} {d['usuarios']:>8} {d['ruteo']:>6}  {accion}"
            )
            (con_deps if tiene else sin_deps).append((z_nombre, d))

    print(f"\n  A desactivar (sin dependencias) : {len(sin_deps)}")
    print(f"  A conservar  (tienen deps)      : {len(con_deps)}")

    if con_deps:
        print(f"\n  ⚠️  Zonas con dependencias — NO se tocarán automáticamente:")
        for z_nombre, d in con_deps:
            partes = [f"{v} {k}" for k, v in d.items() if v > 0]
            print(f"     · {z_nombre}: {', '.join(partes)}")

    print(f"\n  Regiones a renombrar ({len(RENAME_REGIONES)}):")
    for viejo, nuevo in RENAME_REGIONES.items():
        existe = db.query(Region).filter(Region.nombre == viejo).first()
        estado = "pendiente" if existe else "ya OK"
        print(f"    {viejo!r:<28} → {nuevo!r:<32} [{estado}]")

    total_t = db.execute(text("SELECT COUNT(*) FROM tiendas")).scalar()
    print(f"\n  Tiendas actuales en BD : {total_t}")
    print(f"  Tiendas en Excel Sem20 : 1 959")

    with engine.connect() as conn:
        lat_ok = _col_exists(conn, "tiendas", "latitud")
        lon_ok = _col_exists(conn, "tiendas", "longitud")
    print(f"  Columna latitud  : {'✅' if lat_ok else '❌ falta (paso 4)'}")
    print(f"  Columna longitud : {'✅' if lon_ok else '❌ falta (paso 4)'}")
    print(f"\n  ── Sin cambios. Revisa el reporte y ejecuta paso 1. ──")


# ── PASO 1 ────────────────────────────────────────────────────────────────────


def paso1_renombrar_regiones(db, dry=False):
    sep(1, "RENOMBRAR REGIONES")
    ok = skip = 0
    for viejo, nuevo in RENAME_REGIONES.items():
        r = db.query(Region).filter(Region.nombre == viejo).first()
        if not r:
            skip += 1
            continue
        if db.query(Region).filter(Region.nombre == nuevo).first():
            print(f"  ⏭  '{nuevo}' ya existe — omitiendo '{viejo}'")
            skip += 1
            continue
        print(f"  {'[dry]' if dry else '[OK] '} {viejo!r:<28} → {nuevo!r}")
        if not dry:
            r.nombre = nuevo
        ok += 1
    if not dry:
        db.commit()
    print(f"\n  Renombradas: {ok}  |  Ya OK / no encontradas: {skip}")


# ── PASO 2 ────────────────────────────────────────────────────────────────────


def paso2_crear_regiones(db, dry=False):
    sep(2, "CREAR REGIONES FALTANTES")
    comp_map = {c.nombre: c for c in db.query(Compania).all()}
    creadas = skip = 0
    for comp_nombre, regiones in COMPANIAS_REGIONES.items():
        comp = comp_map.get(comp_nombre)
        if not comp:
            print(f"  ❌ Compañía '{comp_nombre}' no encontrada")
            continue
        for reg_nombre in regiones:
            if db.query(Region).filter(Region.nombre == reg_nombre).first():
                skip += 1
                continue
            print(
                f"  {'[dry]' if dry else '[+]  '} {reg_nombre:<38} (compañía: {comp_nombre})"
            )
            if not dry:
                db.add(Region(nombre=reg_nombre, compania_id=comp.id, activo=True))
            creadas += 1
    if not dry:
        db.commit()
    print(f"\n  Creadas: {creadas}  |  Ya existían: {skip}")


# ── PASO 3 ────────────────────────────────────────────────────────────────────


def paso3_zonas(db, dry=False):
    sep(3, "ZONAS — desactivar seed sin deps + crear 234 reales")

    todas_bd = db.query(Zona).all()
    extras = {z.nombre for z in todas_bd} - ZONAS_EXCEL_FLAT
    reg_map = {r.nombre: r for r in db.query(Region).all()}

    print(f"  [3a] Evaluando {len(extras)} zonas del seed...")
    desactivadas = conservadas = 0
    for z_nombre in sorted(extras):
        for z in db.query(Zona).filter(Zona.nombre == z_nombre).all():
            d = _dependencias_zona(db, z)
            if any(v > 0 for v in d.values()):
                partes = [f"{v} {k}" for k, v in d.items() if v > 0]
                print(f"  ⚠️  CONSERVAR '{z_nombre}' — {', '.join(partes)}")
                conservadas += 1
            else:
                if z.activo:
                    print(f"  {'[dry]' if dry else '[off]'} '{z_nombre}'")
                    if not dry:
                        z.activo = False
                desactivadas += 1
    if not dry:
        db.flush()
    print(f"  Desactivadas: {desactivadas}  |  Conservadas: {conservadas}")

    print(f"\n  [3b] Creando zonas reales...")
    creadas = skip = errores = 0
    for reg_nombre, zonas in ZONAS_POR_REGION.items():
        region = reg_map.get(reg_nombre)
        if not region:
            print(
                f"  ❌ Región '{reg_nombre}' no encontrada — ejecuta pasos 1 y 2 antes"
            )
            errores += 1
            continue
        for z_nombre in zonas:
            existe = (
                db.query(Zona)
                .filter(Zona.nombre == z_nombre, Zona.region_id == region.id)
                .first()
            )
            if existe:
                if not existe.activo and not dry:
                    existe.activo = True
                skip += 1
                continue
            if not dry:
                db.add(Zona(nombre=z_nombre, region_id=region.id, activo=True))
            creadas += 1
    if not dry:
        db.commit()
    print(
        f"  Creadas: {creadas}  |  Ya existían: {skip}  |  Regiones no encontradas: {errores}"
    )
    if errores:
        print(f"  ❗ Hay errores de región. Asegúrate de haber ejecutado pasos 1 y 2.")


# ── PASO 4 ────────────────────────────────────────────────────────────────────


def paso4_latlon(dry=False):
    sep(4, "AGREGAR latitud/longitud A TABLA tiendas")
    with engine.connect() as conn:
        for col in ["latitud", "longitud"]:
            if _col_exists(conn, "tiendas", col):
                print(f"  ✅ '{col}' ya existe")
            else:
                print(
                    f"  {'[dry]' if dry else '[+]  '} ALTER TABLE tiendas ADD COLUMN {col} FLOAT"
                )
                if not dry:
                    conn.execute(text(f"ALTER TABLE tiendas ADD COLUMN {col} FLOAT"))
                    conn.commit()
                    print(f"       ✅ columna '{col}' agregada")


# ── PASO 5 ────────────────────────────────────────────────────────────────────


def paso5_tiendas(db, dry=False):
    sep(5, "CARGAR TIENDAS")

    with engine.connect() as conn:
        for col in ["latitud", "longitud"]:
            if not _col_exists(conn, "tiendas", col):
                print(f"  ❌ Columna '{col}' falta en BD. Ejecuta --paso 4 primero.")
                return

    if not EXCEL_PATH:
        base = os.path.dirname(os.path.abspath(__file__))
        print(f"  ❌ Excel no encontrado. Opciones:")
        print(f"     1. Copia el archivo a: {os.path.join(base, EXCEL_NOMBRE)}")
        print(f"     2. O ejecuta: set EXCEL_TIENDAS=<ruta_completa>/{EXCEL_NOMBRE}")
        return
    excel_abs = EXCEL_PATH

    print(f"  Leyendo Excel...")
    df = pd.read_excel(excel_abs, sheet_name="Tiendas activas", header=7)
    print(f"  {len(df)} filas en pestaña 'Tiendas activas'\n")

    # Índice zona: (nombre_zona, nombre_region) → objeto Zona
    zona_idx = {}
    for z in db.query(Zona).filter(Zona.activo == True).all():
        reg = db.query(Region).filter(Region.id == z.region_id).first()
        if reg:
            zona_idx[(z.nombre, reg.nombre)] = z

    creadas = actualizadas = sin_cambio = sin_zona = otras_omitidas = conflictos = 0

    for _, row in df.iterrows():
        eco = row.get("ECO")
        if pd.isna(eco):
            otras_omitidas += 1
            continue

        eco = int(eco)
        nombre = str(row.get("NOMBRE TIENDA - NETO", ""))
        zona_excel = str(row.get("NOMBRE ZONA", "")).strip()
        region_excel = str(row.get("NOMBRE REGIÓN", "")).strip()
        status = str(row.get("STATUS", "")).strip().upper()
        cc = row.get("CC DIRECCION OPERACIONES")
        lat = row.get("LATITUD")
        lon = row.get("LONGITUD")
        empresa = row.get("COMPAÑÍA")
        estrategia = row.get("ESTRATEGIA COMERCIAL")

        activo = status == "ACTIVA"
        correo = f"{eco}@soyneto.com"
        cc_str = str(int(cc)) if pd.notna(cc) else None
        lat_v = float(lat) if pd.notna(lat) else None
        lon_v = float(lon) if pd.notna(lon) else None
        emp_s = str(empresa) if pd.notna(empresa) else None
        est_s = str(estrategia) if pd.notna(estrategia) else "normal"

        # Buscar zona: exacta primero, fallback solo por nombre
        zona = zona_idx.get((zona_excel, region_excel)) or next(
            (z for (zn, _), z in zona_idx.items() if zn == zona_excel), None
        )
        if zona is None:
            sin_zona += 1
            continue

        if not dry:
            # Si otra tienda (distinto id) ya tiene este correo, limpiarlo
            # antes de asignarlo a la tienda correcta
            duplicado = db.execute(
                text(
                    "SELECT id FROM tiendas WHERE correo_corporativo = :c AND id != :id"
                ),
                {"c": correo, "id": eco},
            ).fetchone()
            if duplicado:
                db.execute(
                    text("UPDATE tiendas SET correo_corporativo = :tmp WHERE id = :id"),
                    {"tmp": f"_dup_{duplicado[0]}@soyneto.com", "id": duplicado[0]},
                )
                db.flush()
                conflictos += 1

        tienda = db.query(Tienda).filter(Tienda.id == eco).first()

        if tienda is None:
            if not dry:
                db.add(
                    Tienda(
                        id=eco,
                        nombre=nombre,
                        zona_id=zona.id,
                        correo_corporativo=correo,
                        centro_costos=cc_str,
                        empresa=emp_s,
                        estrategia=est_s,
                        latitud=lat_v,
                        longitud=lon_v,
                        activo=activo,
                    )
                )
                db.flush()
            creadas += 1
        else:
            nuevos = {
                "nombre": nombre,
                "zona_id": zona.id,
                "correo_corporativo": correo,
                "centro_costos": cc_str,
                "empresa": emp_s,
                "estrategia": est_s,
                "latitud": lat_v,
                "longitud": lon_v,
                "activo": activo,
            }
            cambios = {
                k: v
                for k, v in nuevos.items()
                if getattr(tienda, k) != v and v is not None
            }
            if cambios:
                if not dry:
                    for k, v in cambios.items():
                        setattr(tienda, k, v)
                    db.flush()
                actualizadas += 1
            else:
                sin_cambio += 1

    if not dry:
        db.commit()

    print(f"  {'[DRY RUN] ' if dry else ''}Resumen final:")
    print(f"  ✅ Creadas              : {creadas}")
    print(f"  🔄 Actualizadas         : {actualizadas}")
    print(f"  ⏭  Sin cambios          : {sin_cambio}")
    print(f"  ⚠️  Sin zona (omitidas)  : {sin_zona}")
    print(f"  ❌ Otras omitidas       : {otras_omitidas}")
    print(
        f"  🔧 Correos duplicados   : {conflictos} (renombrados a _dup_ID@soyneto.com)"
    )
    print(f"  📊 Total OK             : {creadas + actualizadas + sin_cambio}")
    if sin_zona:
        print(f"\n  ❗ {sin_zona} tiendas sin zona. Verifica pasos 1-3 sin errores.")
    if conflictos:
        print(f"\n  ℹ️  {conflictos} tiendas del seed tenían correos que colisionaban.")
        print(f"     Sus correos fueron renombrados a _dup_ID@soyneto.com.")
        print(
            f"     Si esas tiendas tenían usuarios activos, actualiza su correo en la UI."
        )


# ── PASO 8: Reconciliar tiendas duplicadas del seed ──────────────────────────


def paso8_reconciliar_dups(db, dry=False):
    sep(8, "RECONCILIAR TIENDAS DUPLICADAS DEL SEED")

    # Buscar todas las tiendas con correo _dup_ (son las seriales del seed)
    dups = db.execute(
        text(
            "SELECT id, nombre, correo_corporativo FROM tiendas "
            "WHERE correo_corporativo LIKE '_dup_%' ORDER BY id"
        )
    ).fetchall()

    if not dups:
        print("  ✅ No hay tiendas duplicadas — nada que hacer.")
        return

    print(f"  Tiendas duplicadas encontradas: {len(dups)}")
    print()

    usuarios_ok = tickets_ok = dany_ok = desactivadas = sin_eco = 0
    advertencias = []

    for dup_id, dup_nombre, dup_correo in dups:
        # Obtener el ECO desde el usuario vinculado a esta tienda serial
        # El usuario tiene email = ECO@soyneto.com
        usuario = db.execute(
            text(
                "SELECT id, email FROM usuarios WHERE tienda_id = :tid AND rol = 'TIENDA' LIMIT 1"
            ),
            {"tid": dup_id},
        ).fetchone()

        if not usuario:
            # Sin usuario — buscar por nombre de tienda
            tienda_correcta = db.execute(
                text(
                    "SELECT id FROM tiendas WHERE nombre = :n AND correo_corporativo NOT LIKE '_dup_%' LIMIT 1"
                ),
                {"n": dup_nombre},
            ).fetchone()
            if not tienda_correcta:
                advertencias.append(f"Sin usuario ni match: id={dup_id} '{dup_nombre}'")
                sin_eco += 1
                if not dry:
                    db.execute(
                        text("UPDATE tiendas SET activo=false WHERE id=:id"),
                        {"id": dup_id},
                    )
                continue
            eco = tienda_correcta[0]
        else:
            u_id, u_email = usuario
            # Extraer ECO del email: ECO@soyneto.com
            try:
                eco = int(u_email.split("@")[0])
            except ValueError:
                advertencias.append(
                    f"Email no numérico: {u_email} (tienda id={dup_id})"
                )
                sin_eco += 1
                continue

        # Verificar que la tienda correcta existe
        tienda_real = db.execute(
            text(
                "SELECT id, nombre FROM tiendas WHERE id = :eco AND correo_corporativo NOT LIKE '_dup_%'"
            ),
            {"eco": eco},
        ).fetchone()

        if not tienda_real:
            advertencias.append(
                f"Tienda real id={eco} no encontrada para dup id={dup_id} '{dup_nombre}'"
            )
            sin_eco += 1
            continue

        if not dry:
            # 1. Reasignar usuarios
            r = db.execute(
                text("UPDATE usuarios SET tienda_id=:eco WHERE tienda_id=:old"),
                {"eco": eco, "old": dup_id},
            )
            usuarios_ok += r.rowcount

            # 2. Reasignar tickets
            r = db.execute(
                text("UPDATE tickets SET tienda_id=:eco WHERE tienda_id=:old"),
                {"eco": eco, "old": dup_id},
            )
            tickets_ok += r.rowcount

            # 3. Reasignar dany_sesiones (si existe la tabla)
            try:
                r = db.execute(
                    text(
                        "UPDATE dany_sesiones SET tienda_id=:eco WHERE tienda_id=:old"
                    ),
                    {"eco": eco, "old": dup_id},
                )
                dany_ok += r.rowcount
            except Exception:
                pass  # tabla puede no existir en todos los entornos

            # 4. Desactivar la tienda serial duplicada
            db.execute(
                text("UPDATE tiendas SET activo=false WHERE id=:id"), {"id": dup_id}
            )
            db.flush()
            desactivadas += 1
        else:
            # dry-run: solo reportar
            n_tickets = db.execute(
                text("SELECT COUNT(*) FROM tickets WHERE tienda_id=:id"), {"id": dup_id}
            ).scalar()
            n_usuarios = db.execute(
                text("SELECT COUNT(*) FROM usuarios WHERE tienda_id=:id"),
                {"id": dup_id},
            ).scalar()
            if n_tickets or n_usuarios:
                print(
                    f"  [dry] id={dup_id:<6} '{dup_nombre[:30]}'  → real id={eco}"
                    f"  ({n_usuarios} usuarios, {n_tickets} tickets)"
                )
            desactivadas += 1

    if not dry:
        db.commit()

    print(f"  {'[DRY RUN] ' if dry else ''}Resumen:")
    print(f"  🔄 Usuarios reasignados  : {usuarios_ok}")
    print(f"  🎫 Tickets reasignados   : {tickets_ok}")
    print(f"  💬 Dany sesiones         : {dany_ok}")
    print(f"  🚫 Tiendas desactivadas  : {desactivadas}")
    print(f"  ⚠️  Sin tienda real        : {sin_eco}")

    if advertencias:
        print(f"\n  Advertencias ({len(advertencias)}):")
        for a in advertencias:
            print(f"    · {a}")

    if not dry:
        # Verificación final
        restantes = db.execute(
            text(
                "SELECT COUNT(*) FROM tiendas WHERE correo_corporativo LIKE '_dup_%' AND activo=true"
            )
        ).scalar()
        activas_total = db.execute(
            text("SELECT COUNT(*) FROM tiendas WHERE activo=true")
        ).scalar()
        print(f"\n  ── Verificación final ──")
        print(f"  Tiendas activas en BD       : {activas_total}")
        print(f"  _dup_ activas restantes     : {restantes}")
        if restantes == 0:
            print(f"  ✅ BD limpia — solo tiendas reales activas")
        else:
            print(
                f"  ⚠️  Quedan {restantes} tiendas _dup_ activas — revisar manualmente"
            )


# ── PASO 6: Migrar reglas de ruteo a zonas reales ────────────────────────────

# Mapeo zona seed (nombre en BD) → zona real equivalente (nombre en Excel)
RUTEO_SEED_A_EXCEL = {
    "Acapulco Centro": "ACAPULCO CENTRO",
    "Acapulco Hospitales": "ACAPULCO HOSPITALES",
    "Boca del Río": "BOCA DEL RIO",
    "Campeche Sur": "CARMEN",
    "Capital Oaxaca": "CAPITAL OAXACA",
    "Chiapas Istmo Costa": "CHIAPAS ISTMO COSTA",
    "Chiapas Tuxtla 1": "TUXTLA CENTRO",
    "Chiapas Tuxtla 2": "TUXTLA 2",
    "Costa Oaxaca": "COSTA",
    "Cuenca": "CUENCA",
    "Istmo": "ISTMO",
    "Portuaria": "PORTUARIA",
    "Poza Rica": "POZA RICA",
    "Puerto Escondido": "PUERTO ESCONDIDO",
    "Puerto Veracruz": "PORTUARIA",
    "Santa Lucía": "SANTA LUCIA",
    "Tabasco Centro": "VILLA",
    "Tabasco Villa 3": "VILLA 3",
    "Tantoyuca": "TANTOYUCA",
    "Tuxtepec": "TUXTEPEC",
    "Yucatán Norte": "BALAM",
}


def paso6_migrar_ruteo(db, dry=False):
    sep(6, "MIGRAR REGLAS DE RUTEO a zonas reales")

    migradas = skip = errores = 0

    for seed_nombre, excel_nombre in sorted(RUTEO_SEED_A_EXCEL.items()):
        # Zona origen (seed, puede estar desactivada)
        zona_origen = db.query(Zona).filter(Zona.nombre == seed_nombre).first()
        if not zona_origen:
            print(f"  ⏭  '{seed_nombre}' no existe en BD — omitiendo")
            skip += 1
            continue

        # Verificar que tiene reglas
        n_reglas = db.execute(
            text("SELECT COUNT(*) FROM matriz_ruteo WHERE zona_id = :z"),
            {"z": zona_origen.id},
        ).scalar()
        if n_reglas == 0:
            skip += 1
            continue

        # Zona destino (nueva zona real)
        zona_destino = (
            db.query(Zona)
            .filter(Zona.nombre == excel_nombre, Zona.activo == True)
            .first()
        )
        if not zona_destino:
            print(
                f"  ❌ Zona destino '{excel_nombre}' no encontrada — ejecuta pasos 1-3 primero"
            )
            errores += 1
            continue

        # Verificar si ya hay reglas duplicadas en la zona destino
        # (misma tipificacion_id + grupo_id) para no duplicar
        reglas_origen = db.execute(
            text(
                "SELECT id, tipificacion_id, grupo_id FROM matriz_ruteo WHERE zona_id = :z"
            ),
            {"z": zona_origen.id},
        ).fetchall()

        for regla_id, tip_id, grupo_id in reglas_origen:
            existe_en_destino = db.execute(
                text(
                    """SELECT COUNT(*) FROM matriz_ruteo
                        WHERE zona_id=:z AND tipificacion_id=:t AND grupo_id=:g"""
                ),
                {"z": zona_destino.id, "t": tip_id, "g": grupo_id},
            ).scalar()

            if existe_en_destino:
                # Ya existe una regla equivalente en la zona destino — eliminar la duplicada
                print(
                    f"  {'[dry]' if dry else '[del]'} Regla {regla_id} ya existe en '{excel_nombre}' — eliminando duplicado de '{seed_nombre}'"
                )
                if not dry:
                    db.execute(
                        text("DELETE FROM matriz_ruteo WHERE id = :id"),
                        {"id": regla_id},
                    )
            else:
                # Mover la regla a la zona destino
                print(
                    f"  {'[dry]' if dry else '[→]  '} Regla {regla_id}: '{seed_nombre}' → '{excel_nombre}'"
                )
                if not dry:
                    db.execute(
                        text("UPDATE matriz_ruteo SET zona_id = :nuevo WHERE id = :id"),
                        {"nuevo": zona_destino.id, "id": regla_id},
                    )
            migradas += 1

    if not dry:
        db.commit()

    print(
        f"\n  {'[DRY RUN] ' if dry else ''}Reglas migradas/limpiadas: {migradas}  |  Omitidas: {skip}  |  Errores: {errores}"
    )
    if errores:
        print(
            f"  ❗ Hay zonas destino no encontradas. Verifica que los pasos 1-3 se ejecutaron."
        )


# ── PASO 7: Reasignar coordinadores a zonas reales ───────────────────────────

# Mapeo zona seed → zona real para los 2 coordinadores
COORDINADORES_ZONA = {
    "Costa Oaxaca": "COSTA",  # región OAXACA COSTA
    "Puerto Veracruz": "PORTUARIA",  # región VERACRUZ CENTRO
}


def paso7_coordinadores(db, dry=False):
    sep(7, "REASIGNAR COORDINADORES a zonas reales")

    ok = sin_usuario = sin_zona_destino = 0

    for seed_nombre, excel_nombre in COORDINADORES_ZONA.items():
        zona_origen = db.query(Zona).filter(Zona.nombre == seed_nombre).first()
        if not zona_origen:
            print(f"  ⏭  Zona '{seed_nombre}' no existe — ya fue migrada o no aplica")
            sin_usuario += 1
            continue

        # Buscar coordinadores con esta zona
        usuarios = db.execute(
            text(
                """SELECT id, nombre, email, rol
                    FROM usuarios
                    WHERE zona_id = :z"""
            ),
            {"z": zona_origen.id},
        ).fetchall()

        if not usuarios:
            print(f"  ⏭  '{seed_nombre}' — sin usuarios asignados")
            sin_usuario += 1
            continue

        # Zona destino
        zona_destino = (
            db.query(Zona)
            .filter(Zona.nombre == excel_nombre, Zona.activo == True)
            .first()
        )
        if not zona_destino:
            print(
                f"  ❌ Zona destino '{excel_nombre}' no encontrada — ejecuta pasos 1-3 primero"
            )
            sin_zona_destino += 1
            continue

        for uid, nombre, email, rol in usuarios:
            print(f"  {'[dry]' if dry else '[→]  '} {nombre} ({email}) [{rol}]")
            print(f"         zona: '{seed_nombre}' → '{excel_nombre}'")
            if not dry:
                db.execute(
                    text("UPDATE usuarios SET zona_id = :nuevo WHERE id = :id"),
                    {"nuevo": zona_destino.id, "id": uid},
                )
            ok += 1

    if not dry:
        db.commit()

    print(
        f"\n  {'[DRY RUN] ' if dry else ''}Coordinadores reasignados: {ok}  |  Sin usuario: {sin_usuario}  |  Sin zona destino: {sin_zona_destino}"
    )

    # Recordatorio CORPORATIVO
    corp = db.execute(
        text(
            """SELECT t.id, t.nombre, z.nombre as zona
                FROM tiendas t
                JOIN cat_zonas z ON t.zona_id = z.id
                WHERE z.nombre = 'CORPORATIVO'"""
        )
    ).fetchall()
    if corp:
        print(f"\n  ⚠️  Pendiente manual — tienda(s) en zona CORPORATIVO:")
        for tid, tnombre, znombre in corp:
            print(
                f"     · ID {tid}: {tnombre} — asignar zona manualmente en la UI de admin"
            )


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Migración catálogo Sem 20/2026")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--paso", type=int, choices=[0, 1, 2, 3, 4, 5, 6, 7, 8])
    group.add_argument("--todos", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dry = args.dry_run
    if dry:
        print("⚠️  MODO DRY-RUN — no se escribirá nada en la BD\n")

    db = SessionLocal()
    try:

        def run_paso(n):
            if n == 0:
                paso0_auditoria(db)
            elif n == 1:
                paso1_renombrar_regiones(db, dry)
            elif n == 2:
                paso2_crear_regiones(db, dry)
            elif n == 3:
                paso3_zonas(db, dry)
            elif n == 4:
                paso4_latlon(dry)
            elif n == 5:
                paso5_tiendas(db, dry)
            elif n == 6:
                paso6_migrar_ruteo(db, dry)
            elif n == 7:
                paso7_coordinadores(db, dry)
            elif n == 8:
                paso8_reconciliar_dups(db, dry)

        for n in range(9) if args.todos else [args.paso]:
            run_paso(n)

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        raise
    finally:
        db.close()
        print("\n✔  Listo.\n")


if __name__ == "__main__":
    main()
