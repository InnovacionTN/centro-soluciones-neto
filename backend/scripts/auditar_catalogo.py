"""
auditar_catalogo.py — Compara el catálogo actual en Neon vs el Excel Sem 20/2026
=================================================================================
NO hace ningún cambio. Solo audita y reporta diferencias.

Ejecutar:
    cd backend
    python scripts/auditar_catalogo.py

Reporta:
  1. Compañías: ¿cuáles hay en BD vs Excel?
  2. Regiones: ¿coinciden nombres y compañía asignada?
  3. Zonas: ¿cuáles faltan, cuáles sobran, cuáles están en región incorrecta?
  4. Resumen de tiendas actuales en BD
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from app.db.session import SessionLocal
from app.models.models import Compania, Region, Zona, Tienda

EXCEL = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                     "Catalogo_Tiendas_NETO_Sem_20_2026.xlsx")

# Catálogo esperado según Excel Sem 20/2026
# Compañía → [lista de regiones]
EXCEL_COMPANIAS = {
    "CENTRO":   ["CENTRO", "METRO NORTE", "NORTE", "NUEVO ECATEPEC",
                 "OCCIDENTE BAJÍO", "OCCIDENTE MICHOACÁN NORTE", "OCCIDENTE MICHOACÁN SUR", "TOLUCA"],
    "ORIENTE":  ["IZTAPALAPA", "METRO SUR", "NEZA", "PUEBLA", "VALLE"],
    "PONIENTE": ["ACAPULCO CENTRO", "ACAPULCO MONTAÑA", "ACAPULCO ORIENTE",
                 "ACAPULCO PONIENTE", "MORELOS", "OAXACA", "OAXACA COSTA"],
    "SURESTE":  ["CHIAPAS", "CHIAPAS SOCONUSCO", "COATZA OLMECA", "TABASCO", "YUCATAN"],
    "VERACRUZ": ["VERACRUZ CENTRO", "VERACRUZ NORTE", "VERACRUZ SUR"],
}

# Región → [zonas esperadas]
EXCEL_ZONAS = {
    "ACAPULCO CENTRO": ["ACAPULCO","ACAPULCO CALZADA","ACAPULCO CENTRO","ACAPULCO HOSPITALES","ACAPULCO PERIFERIA","ACAPULCO RURAL","ACAPULCO TRADICIONAL","ACAPULCO URBANO","TEHUACALCO","VICENTE GUERRERO"],
    "ACAPULCO MONTAÑA": ["CHILPANCINGO PERIFERIA","COSTA LIBRE","GUERRERO CAPITAL","GUERRERO NORTE","GUERRERO PONIENTE","MONTAÑA","MONTAÑA ALTA","SIERRA GUERRERO","TIXTLA"],
    "ACAPULCO ORIENTE": ["ACAPULCO COSTA","COSTA CHICA","COSTA DEL ESTE","COSTA DORADA","DIAMANTE","MARQUELIA"],
    "ACAPULCO PONIENTE": ["ACAPULCO EJIDO","COSTA DEL SOL","COSTA GRANDE","LA UNIÓN GUERRERO","LAZARO CARDENAS","PETATLAN COSTA","ZIHUATANEJO"],
    "CENTRO": ["AZCAPOTZALCO","CENTRO","GAM ARAGÓN","GAM CENTRO","GAM PERIFERICO","GUSTAVO A MADERO","IZTACALCO","MIGUEL HIDALGO","VENUSTIANO CARRANZA"],
    "CHIAPAS": ["CHIAPAS BOSQUES","CHIAPAS COSTA","CHIAPAS FRAILESCA","CHIAPAS ISTMO COSTA","CHIAPAS MESETA COMITECA","CHIAPAS SIERRA MARISCAL","CHIAPAS ZOQUE","TUXTLA 2","TUXTLA CENTRO"],
    "CHIAPAS SOCONUSCO": ["CHIAPAS FRONTERA","TAPACHULA 1","TAPACHULA COSTA","TAPACHULA MERCADO","TAPACHULA MONTAÑA"],
    "COATZA OLMECA": ["ACAYUCAN","CHOAPAS","COATZA","COATZA 2","LA VENTA","MINA"],
    "IZTAPALAPA": ["AEROPUERTO","CONSTITUCION IZTAPALAPA","IZTAPALAPA ORIENTE","NEZA SUR","SAN LORENZO IZTAPALAPA","SANTA CRUZ IZTAPALAPA","VILLAS IZTAPALAPA","ZARAGOZA IZTAPALAPA"],
    "METRO NORTE": ["HIDALGO","HIDALGO PONIENTE","HIDALGO TULANCINGO","HUEHUETOCA SAN JUAN","OJO DE AGUA","PACHUCA","PACHUCA 2","TECAMAC","TIZAYUCA","ZUMPANGO HUEHUETOCA"],
    "METRO SUR": ["AJUSCO","COYOACAN 2","MAGDALENA CONTRERAS","PEDREGAL","PICACHO AJUSCO","PLUS","TEZONCO TLAHUAC","TLAHUAC","TLALPAN","TULYEHUALCO","XOCHIMILCO CENTRO"],
    "MORELOS": ["CUAUTLA","CUERNA","JIUTEPEC","MORELOS CENTRO","ORIENTE","SUR","TAXCO"],
    "NEZA": ["AYOTLA IXTAPALUCA","CHICOLOAPAN","CHIMALHUACAN","LA PAZ NEZA","LOS REYES","NEZA","NEZA ORIENTE","PATOS CHIMALHUACAN","SANTA BARBARA IXTAPALUCA"],
    "NORTE": ["ALVARO OBREGON","ATIZAPAN 1","ATIZAPAN 2","CUAJIMALPA","NAUCALPAN 1","NAUCALPAN 2","NAUCALPAN 3","NICOLAS ROMERO","TLALNEPANTLA","TULTITLAN"],
    "NUEVO ECATEPEC": ["CHICONCUAC","COACALCO","CUAUTITLAN","ECATEPEC ARAGON","ECATEPEC PERIFERIA","ECATEPEC SANTA CLARA","ECATEPEC VALLE","JARDINES DE MORELOS","PRADOS","REAL DEL VALLE"],
    "OAXACA": ["ACATLAN","AEROPUERTO OAXACA","AQUIOAXACA","CAPITAL OAXACA","CAÑADA","HUAJUAPAN","MARMOLERA","OAXACA ATOYAC","OAXACA CENTRO","SANTA LUCIA","TLAXIACO"],
    "OAXACA COSTA": ["COSTA","COSTA CENTRO","ISTMO","JUCHITAN","PINOTEPA","PUERTO ESCONDIDO","SALINA CRUZ","SIERRA OAXACA"],
    "OCCIDENTE BAJÍO": ["AGUASCALIENTES","LA HUASTECA","LA HUASTECA 2","SAN LUIS POTOSI 2","SAN LUIS POTOSI CAPITAL","ZACATECAS","ZACATECAS 2"],
    "OCCIDENTE MICHOACÁN NORTE": ["JALISCO","LEON","PURÉPECHA","REBOCERA","TAPATIA","TIERRA CALIENTE"],
    "OCCIDENTE MICHOACÁN SUR": ["AGUACATERA","CELAYA","GUANAJUATO","MONARCA","QUERETARO MONTAÑA","QUERETARO SUR"],
    "PUEBLA": ["PUEBLA","PUEBLA CAPITAL","PUEBLA MONTAÑA 2","PUEBLA ORIENTE","PUEBLA PONIENTE","PUEBLA SUR","PUEBLA TLAXCALA","PUEBLA VALLE","TLAXCALA 2"],
    "TABASCO": ["CHONTALPA","COMALCALCO","JALPA","MACUSPANA","SIERRA","VILLA","VILLA 2","VILLA 3"],
    "TOLUCA": ["TOLUCA CENTRO","TOLUCA CENTRO 2","TOLUCA NORESTE","TOLUCA NORTE","TOLUCA ORIENTE","TOLUCA PONIENTE","TOLUCA SUR","TOLUCA SURESTE"],
    "VALLE": ["AMECAMECA","CHALCO CENTRO","COCOTITLAN","IXTAPALUCA","IXTAPALUCA CENTRO","JARDINES CHALCO","MIXQUIC","TLAHUAC 2","VALLE DE CHALCO","XICO"],
    "VERACRUZ CENTRO": ["BOCA DEL RIO","CARDEL","COATEPEC","COSTA ESMERALDA","HEROICA","PORTUARIA","TEZIUTLAN","XALAPA"],
    "VERACRUZ NORTE": ["ALAMO","GUTIERREZ ZAMORA","HUAUCHINANGO","HUEJUTLA","PAPANTLA","POZA RICA","TAMPICO NORTE","TANTOYUCA","TUXPAN"],
    "VERACRUZ SUR": ["ALVARADO","CAFETALERA","CORDOBA","CUENCA","ORIZABA","PIÑERA","PUERTO","TUXTEPEC","TUXTLAS"],
    "YUCATAN": ["BALAM","BALUARTES","CAMINO REAL","CARMEN","KANASIN","MAYAPAN","MERIDA SUR","PALENQUE","RIOS"],
}


def sep(titulo):
    print(f"\n{'=' * 62}")
    print(f"  {titulo}")
    print('=' * 62)


def run():
    db = SessionLocal()

    # ── 1. Compañías ──────────────────────────────────────────────────────────
    sep("1. COMPAÑÍAS")
    bd_companias = {c.nombre: c for c in db.query(Compania).all()}
    excel_companias = set(EXCEL_COMPANIAS.keys())
    bd_comp_nombres = set(bd_companias.keys())

    ok = excel_companias & bd_comp_nombres
    faltantes = excel_companias - bd_comp_nombres
    extras = bd_comp_nombres - excel_companias

    print(f"  ✅ Coinciden  ({len(ok)}):  {sorted(ok)}")
    if faltantes:
        print(f"  ❌ Faltan en BD ({len(faltantes)}):  {sorted(faltantes)}")
    if extras:
        print(f"  ⚠️  Extra en BD  ({len(extras)}):  {sorted(extras)}")

    # ── 2. Regiones ───────────────────────────────────────────────────────────
    sep("2. REGIONES")
    bd_regiones = {r.nombre: r for r in db.query(Region).all()}
    excel_regiones = {r for regiones in EXCEL_COMPANIAS.values() for r in regiones}
    bd_reg_nombres = set(bd_regiones.keys())

    coinciden = excel_regiones & bd_reg_nombres
    faltan = excel_regiones - bd_reg_nombres
    extras = bd_reg_nombres - excel_regiones

    print(f"  ✅ Coinciden    : {len(coinciden)}")
    if faltan:
        print(f"  ❌ Faltan en BD ({len(faltan)}):")
        for r in sorted(faltan):
            comp = next(c for c, rs in EXCEL_COMPANIAS.items() if r in rs)
            print(f"      {r}  (compañía: {comp})")
    if extras:
        print(f"  ⚠️  Extra en BD  ({len(extras)}):")
        for r in sorted(extras):
            bd_r = bd_regiones[r]
            comp_bd = bd_companias.get(
                next((c.nombre for c in db.query(Compania).filter(Compania.id == bd_r.compania_id).all()), None),
                "SIN COMPAÑÍA"
            ) if bd_r.compania_id else "SIN COMPAÑÍA"
            print(f"      {r}  (compañía BD: {comp_bd})")

    # Verificar compañía asignada en las que coinciden
    print(f"\n  Verificando compañía asignada en regiones que coinciden...")
    mal_compania = []
    for r_nombre in sorted(coinciden):
        bd_r = bd_regiones[r_nombre]
        expected_comp = next(c for c, rs in EXCEL_COMPANIAS.items() if r_nombre in rs)
        if bd_r.compania_id is None:
            mal_compania.append((r_nombre, "SIN COMPAÑÍA", expected_comp))
        else:
            bd_comp_obj = db.query(Compania).filter(Compania.id == bd_r.compania_id).first()
            if bd_comp_obj and bd_comp_obj.nombre != expected_comp:
                mal_compania.append((r_nombre, bd_comp_obj.nombre, expected_comp))

    if mal_compania:
        print(f"  ❌ Regiones con compañía incorrecta ({len(mal_compania)}):")
        for r, actual, esperado in mal_compania:
            print(f"      {r:<30}  BD={actual}  →  esperado={esperado}")
    else:
        print(f"  ✅ Todas las regiones tienen la compañía correcta")

    # ── 3. Zonas ──────────────────────────────────────────────────────────────
    sep("3. ZONAS")
    bd_zonas = db.query(Zona).all()
    bd_zonas_dict = {}  # nombre → list[Zona] (puede haber duplicados de nombre)
    for z in bd_zonas:
        bd_zonas_dict.setdefault(z.nombre, []).append(z)

    excel_zonas_flat = {z for zonas in EXCEL_ZONAS.values() for z in zonas}
    bd_zonas_nombres = set(bd_zonas_dict.keys())

    coinciden_z = excel_zonas_flat & bd_zonas_nombres
    faltan_z = excel_zonas_flat - bd_zonas_nombres
    extras_z = bd_zonas_nombres - excel_zonas_flat

    print(f"  ✅ Coinciden    : {len(coinciden_z)}")
    if faltan_z:
        print(f"  ❌ Faltan en BD ({len(faltan_z)}):")
        for z in sorted(faltan_z):
            reg = next(r for r, zs in EXCEL_ZONAS.items() if z in zs)
            print(f"      {z:<35}  (región: {reg})")
    if extras_z:
        print(f"  ⚠️  Extra en BD  ({len(extras_z)}):")
        for z in sorted(extras_z):
            for zo in bd_zonas_dict[z]:
                reg_bd = db.query(Region).filter(Region.id == zo.region_id).first()
                print(f"      {z:<35}  (región BD: {reg_bd.nombre if reg_bd else '?'})")

    # Verificar región de las zonas que coinciden
    print(f"\n  Verificando región asignada en zonas que coinciden...")
    mal_region = []
    for z_nombre in sorted(coinciden_z):
        expected_reg = next(r for r, zs in EXCEL_ZONAS.items() if z_nombre in zs)
        for zo in bd_zonas_dict[z_nombre]:
            reg_bd = db.query(Region).filter(Region.id == zo.region_id).first()
            if reg_bd and reg_bd.nombre != expected_reg:
                mal_region.append((z_nombre, reg_bd.nombre, expected_reg))

    if mal_region:
        print(f"  ❌ Zonas con región incorrecta ({len(mal_region)}):")
        for z, actual, esperado in mal_region:
            print(f"      {z:<35}  BD={actual}  →  esperado={esperado}")
    else:
        print(f"  ✅ Todas las zonas están en la región correcta")

    # ── 4. Tiendas actuales ───────────────────────────────────────────────────
    sep("4. TIENDAS ACTUALES EN BD")
    total = db.query(Tienda).count()
    activas = db.query(Tienda).filter(Tienda.activo == True).count()
    sin_latlon = db.query(Tienda).filter(
        ~Tienda.__table__.c.keys().__contains__('latitud') if 'latitud' not in [c.name for c in Tienda.__table__.columns] else Tienda.activo == True
    ).count()

    print(f"  Total tiendas en BD : {total}")
    print(f"  Activas             : {activas}")

    # Check if lat/lon columns exist
    cols = [c.name for c in Tienda.__table__.columns]
    tiene_latlon = 'latitud' in cols and 'longitud' in cols
    print(f"  Columnas lat/lon    : {'✅ existen' if tiene_latlon else '❌ NO existen (pendiente migración)'}")
    print(f"\n  Columnas actuales de tiendas: {cols}")

    print()
    db.close()


if __name__ == "__main__":
    run()
