"""
reset_seed_v2.py — Reset completo + catálogos reales homologados v2
====================================================================
Datos basados en el análisis real de 146,869 tickets de Zendesk.

Crea:
  • 5 empresas → 26 regiones → zonas representativas
  • 13 grupos alineados con AreaTecnica real
  • 57+ tipificaciones con 3 niveles y SLA correcto
  • Matriz de ruteo completa
  • Usuarios de prueba: 1 admin, 1 agente por grupo, 1 coordinador, tiendas
  • 25 tiendas reales del top de Zendesk
  • 7 políticas SLA

Ejecutar:
  python scripts/reset_seed_v2.py
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal, engine
from app.models.models import (
    Base,
    Region,
    Zona,
    Tienda,
    Grupo,
    Usuario,
    Tipificacion,
    ReglaRuteo,
    SlaPolicy,
    PlantillaRespuesta,
    RolUsuario,
    AreaTecnica,
    TipoTicket,
    UrgenciaTipificacion,
)
from app.core.security import hash_password
from sqlalchemy import text

db = SessionLocal()
PWD = hash_password("Neto2024!")


# ═══════════════════════════════════════════════════════════════════════════════
# 1. RESET — limpia todo en orden FK-safe
# ═══════════════════════════════════════════════════════════════════════════════


def reset():
    print("🗑  Limpiando base de datos...")
    with engine.connect() as conn:
        tablas = [
            "plantillas_respuesta",
            "bitacora_eventos",
            "ticket_evidencias",
            "tickets",
            "incidentes_masivos",
            "matriz_ruteo",
            "cat_tipificaciones",
            "sla_policies",
            "usuarios",
            "cat_grupos",
            "tiendas",
            "cat_zonas",
            "cat_regiones",
        ]
        for t in tablas:
            try:
                conn.execute(text(f"DELETE FROM {t}"))
            except Exception:
                pass

        seqs = [
            "cat_regiones_id_seq",
            "cat_zonas_id_seq",
            "cat_grupos_id_seq",
            "usuarios_id_seq",
            "cat_tipificaciones_id_seq",
            "sla_policies_id_seq",
            "matriz_ruteo_id_seq",
            "bitacora_eventos_id_seq",
            "tickets_id_seq",
            "ticket_evidencias_id_seq",
            "plantillas_respuesta_id_seq",
            "incidentes_masivos_id_seq",
        ]
        for s in seqs:
            try:
                conn.execute(text(f"ALTER SEQUENCE IF EXISTS {s} RESTART WITH 1"))
            except Exception:
                pass
        conn.commit()
    print("   ✓ Limpio")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SEED
# ═══════════════════════════════════════════════════════════════════════════════


def seed():
    Base.metadata.create_all(bind=engine)
    print("\n📦 Cargando catálogos v2 con datos reales de Zendesk...\n")

    # ── 2.1 REGIONES Y ZONAS ──────────────────────────────────────────────────
    print("[1/8] Regiones y zonas...")

    # Estructura: empresa → { region_nombre: [zonas] }
    geo = {
        "Sureste": {
            "Chiapas": ["Chiapas Istmo Costa", "Chiapas Tuxtla 1", "Chiapas Tuxtla 2"],
            "Tabasco": ["Tabasco Villa 3", "Tabasco Centro"],
            "Yucatán": ["Yucatán Norte", "Campeche Sur"],
        },
        "Veracruz": {
            "Veracruz Sur": [
                "Puerto Veracruz",
                "Orizaba",
                "Alvarado",
                "Cuenca",
                "Tuxtepec",
            ],
            "Veracruz Norte": ["Poza Rica", "Tantoyuca"],
            "Veracruz Centro": ["Heroica Veracruz", "Boca del Río", "Portuaria"],
        },
        "Poniente": {
            "Oaxaca": ["Capital Oaxaca", "Santa Lucía"],
            "Oaxaca Costa": ["Costa Oaxaca", "Istmo", "Pinotepa", "Puerto Escondido"],
            "Acapulco Centro": [
                "Acapulco Centro",
                "Acapulco Hospitales",
                "Acapulco Tradicional",
            ],
            "Acapulco Oriente": ["Marquelia", "Costa del Este", "Costa Chica"],
            "Acapulco Poniente": ["Acapulco Ejido", "Lázaro Cárdenas"],
            "Acapulco Montaña": ["Sierra Guerrero", "Montaña"],
            "Morelos": ["Jiutepec", "Cuernavaca"],
            "Bajío": ["Bajío Norte", "Bajío Sur"],
            "Puebla": ["Puebla Capital", "Teziutlán"],
        },
        "Oriente": {
            "Neza": ["La Paz Neza", "Neza Centro"],
            "Oriente": ["Oriente CDMX"],
            "Iztapalapa": ["Iztapalapa Norte", "Iztapalapa Sur"],
            "Ecatepec": ["Ecatepec Aragón", "Ecatepec Santa Clara"],
        },
        "Centro": {
            "Centro CDMX": ["GAM Aragón", "Azcapotzalco", "Xochimilco"],
            "Metro Norte": ["Hidalgo", "Ojo de Agua", "Zumpango", "Hidalgo Tulancingo"],
            "Metro Sur": ["Coyoacán", "Tlalpan"],
            "Norte": ["Nicolas Romero", "Cuautitlán"],
            "Toluca": ["Toluca Sur", "Toluca Norte"],
            "Michoacán": ["Morelia", "Uruapan"],
        },
    }

    regiones = {}  # nombre → Region
    zonas = {}  # nombre → Zona

    for empresa, regs in geo.items():
        for reg_nombre, zona_lista in regs.items():
            r = Region(nombre=reg_nombre)
            db.add(r)
            db.flush()
            regiones[reg_nombre] = r
            for z_nombre in zona_lista:
                z = Zona(nombre=z_nombre, region_id=r.id)
                db.add(z)
                zonas[z_nombre] = z
    db.flush()
    print(f"   ✓ {len(regiones)} regiones, {len(zonas)} zonas")

    # ── 2.2 SLA POLICIES ──────────────────────────────────────────────────────
    print("[2/8] Políticas SLA...")
    sla_defs = [
        ("6 horas hábiles", 6, "habil"),
        ("16 horas hábiles", 16, "habil"),
        ("24 horas hábiles", 24, "habil"),
        ("32 horas hábiles", 32, "habil"),
        ("48 horas hábiles", 48, "habil"),
        ("72 horas hábiles", 72, "habil"),
        ("120 horas hábiles", 120, "habil"),
    ]
    sla = {}
    for nombre, horas, tipo in sla_defs:
        p = SlaPolicy(nombre=nombre, horas_limite=horas, tipo_calendario=tipo)
        db.add(p)
        db.flush()
        sla[f"{horas}h"] = p
    db.commit()
    print(f"   ✓ {len(sla)} políticas SLA")

    # ── 2.3 GRUPOS ────────────────────────────────────────────────────────────
    print("[3/8] Grupos del Call Center...")

    grupos_def = [
        # (nombre, AreaTecnica, slack_canal)
        # SISTEMAS
        ("Soporte Sistemas", AreaTecnica.SISTEMAS, "#cc-sistemas"),
        ("SION Analistas", AreaTecnica.SISTEMAS, "#cc-sion-analistas"),
        ("SION Desarrollo", AreaTecnica.SISTEMAS, "#cc-sion-dev"),
        ("Comunicaciones Soporte", AreaTecnica.SISTEMAS, "#cc-comunicaciones"),
        # OPERACIONES
        ("Call Center Operaciones", AreaTecnica.OPERACIONES, "#cc-operaciones"),
        ("Servicios Financieros", AreaTecnica.OPERACIONES, "#cc-financieros"),
        # ABASTO
        ("Sistemas Abasto", AreaTecnica.ABASTO, "#cc-abasto"),
        # FINANZAS
        ("Finanzas Inventarios", AreaTecnica.FINANZAS, "#cc-finanzas"),
        # COMERCIAL
        ("Soporte Comercial", AreaTecnica.COMERCIAL, "#cc-comercial"),
        # RRHH
        ("Recursos Humanos", AreaTecnica.RRHH, "#cc-rrhh"),
        # MANTENIMIENTO — uno por macro-región
        ("Mantenimiento Sureste", AreaTecnica.MANTENIMIENTO, "#cc-mantto-sureste"),
        ("Mantenimiento Veracruz", AreaTecnica.MANTENIMIENTO, "#cc-mantto-veracruz"),
        (
            "Mantenimiento Centro-Oriente",
            AreaTecnica.MANTENIMIENTO,
            "#cc-mantto-centro",
        ),
        ("Mantenimiento Poniente", AreaTecnica.MANTENIMIENTO, "#cc-mantto-poniente"),
    ]

    grupos = {}
    for nombre, area, slack in grupos_def:
        g = Grupo(nombre=nombre, area_tecnica=area, slack_canal=slack)
        db.add(g)
        db.flush()
        grupos[nombre] = g
    db.commit()
    print(f"   ✓ {len(grupos)} grupos")

    # ── 2.4 TIENDAS ───────────────────────────────────────────────────────────
    print("[4/8] Tiendas (top real de Zendesk)...")

    # (eco, nombre, zona, correo, estrategia, empresa)
    tiendas_data = [
        (749, "PANZACOLA", "GAM Aragón", "t749@soyneto.com", "frontal", "Centro"),
        (
            411,
            "JALAPA CENTRO",
            "Heroica Veracruz",
            "t411@soyneto.com",
            "normal",
            "Veracruz",
        ),
        (
            1296,
            "TUXTLA CHICO",
            "Chiapas Tuxtla 1",
            "t1296@soyneto.com",
            "normal",
            "Sureste",
        ),
        (
            1483,
            "RODRIGUEZ CLARA",
            "Puerto Veracruz",
            "t1483@soyneto.com",
            "normal",
            "Veracruz",
        ),
        (
            7270,
            "LOS ANGELES",
            "Tabasco Centro",
            "t7270@soyneto.com",
            "normal",
            "Sureste",
        ),
        (616, "HUACTZICO", "Tabasco Centro", "t616@soyneto.com", "normal", "Sureste"),
        (680, "OJITLAN II", "Tuxtepec", "t680@soyneto.com", "normal", "Veracruz"),
        (
            1160,
            "ACATLIPA",
            "Jiutepec",
            "t1160@soyneto.com",
            "frontal_especial",
            "Poniente",
        ),
        (
            1042,
            "POCHUTLA NUEVA",
            "Costa Oaxaca",
            "t1042@soyneto.com",
            "normal",
            "Poniente",
        ),
        (
            1011,
            "SAN LUIS ACATLAN",
            "Marquelia",
            "t1011@soyneto.com",
            "normal",
            "Poniente",
        ),
        (
            388,
            "HIDALGO SAN LUIS",
            "Marquelia",
            "t388@soyneto.com",
            "normal",
            "Poniente",
        ),
        (138, "IXTALTEPEC", "Istmo", "t138@soyneto.com", "normal", "Poniente"),
        (
            233,
            "AEROPUERTO PRINCIPAL",
            "Puerto Escondido",
            "t233@soyneto.com",
            "frontal_especial",
            "Poniente",
        ),
        (
            1375,
            "CARLOS TABASCO",
            "Tabasco Villa 3",
            "t1375@soyneto.com",
            "normal",
            "Sureste",
        ),
        (1808, "ORIENTE 8", "La Paz Neza", "t1808@soyneto.com", "normal", "Oriente"),
        (630, "JUCHITAN MERCADO 2", "Istmo", "t630@soyneto.com", "normal", "Poniente"),
        (8953, "PIEDRAS NEGRAS", "Alvarado", "t8953@soyneto.com", "normal", "Veracruz"),
        (1053, "TECOZAUTLA", "Hidalgo", "t1053@soyneto.com", "normal", "Centro"),
        (1977, "AVANDARO", "Toluca Sur", "t1977@soyneto.com", "frontal", "Centro"),
        (
            575,
            "COTAXTLA JUAREZ",
            "Puerto Veracruz",
            "t575@soyneto.com",
            "normal",
            "Veracruz",
        ),
        (
            201,
            "BALBUENA MIRON",
            "Coyoacán",
            "t201@soyneto.com",
            "frontal_especial",
            "Oriente",
        ),
        (
            558,
            "SANTA CLARA LIBERTAD",
            "Ecatepec Santa Clara",
            "t558@soyneto.com",
            "normal",
            "Oriente",
        ),
        (
            4553,
            "HUITZUCO",
            "Acapulco Centro",
            "t4553@soyneto.com",
            "normal",
            "Poniente",
        ),
        (
            8971,
            "IMSS CENTRO",
            "Iztapalapa Norte",
            "t8971@soyneto.com",
            "normal",
            "Oriente",
        ),
        (1058, "COMISTAN", "Nicolas Romero", "t1058@soyneto.com", "normal", "Centro"),
    ]

    empresa_map = {
        "Sureste": "sureste_empresa",
        "Veracruz": "veracruz_empresa",
        "Poniente": "poniente_empresa",
        "Oriente": "oriente_empresa",
        "Centro": "centro_empresa",
    }

    tiendas = {}
    for eco, nombre, zona_n, correo, estrat, empresa in tiendas_data:
        z = zonas.get(zona_n)
        if not z:
            # Fallback a primera zona disponible
            z = list(zonas.values())[0]
        t = Tienda(
            id=eco,
            nombre=nombre,
            zona_id=z.id,
            correo_corporativo=correo,
            estrategia=estrat,
            empresa=empresa_map.get(empresa, "centro_empresa"),
        )
        db.add(t)
        tiendas[eco] = t
    db.flush()
    print(f"   ✓ {len(tiendas)} tiendas")

    # ── 2.5 USUARIOS ──────────────────────────────────────────────────────────
    print("[5/8] Usuarios...")

    # Admin
    db.add(
        Usuario(
            email="admin@soyneto.com",
            nombre="Administrador CSN",
            hashed_password=PWD,
            rol=RolUsuario.ADMIN,
        )
    )

    # Agentes — uno real por grupo (basados en Zendesk top performers)
    agentes_def = [
        # (email, nombre, grupo)
        ("karen.aboytes@soyneto.com", "Karen Aboytes Trejo", "Soporte Sistemas"),
        ("christian.gutierrez@soyneto.com", "Christian Gutiérrez", "SION Analistas"),
        ("stephany.vazquez@soyneto.com", "Stephany Vázquez Delgado", "SION Desarrollo"),
        ("omar.reyesm@soyneto.com", "Omar Reyes Martínez", "Comunicaciones Soporte"),
        ("raul.carmona@soyneto.com", "Raúl Carmona Santos", "Call Center Operaciones"),
        ("diana.villanueva@soyneto.com", "Diana Villanueva", "Soporte Comercial"),
        ("karina.yanez@soyneto.com", "Karina Yañez", "Sistemas Abasto"),
        (
            "brenda.alvarezga@soyneto.com",
            "Brenda Isabel Álvarez",
            "Finanzas Inventarios",
        ),
        ("natalia.ortiz@soyneto.com", "Natalia Ortiz López", "Servicios Financieros"),
        ("juana.perez@soyneto.com", "Juana Pérez Mancilla", "Recursos Humanos"),
        ("everardo.mtz@soyneto.com", "Everardo Martínez", "Mantenimiento Sureste"),
        ("zohara.valdes@soyneto.com", "Zohara Valdés Pérez", "Mantenimiento Poniente"),
        ("donovan.avila@soyneto.com", "Donovan Ávila Pérez", "Mantenimiento Veracruz"),
        (
            "jose.cruzg@soyneto.com",
            "José Guadalupe Cruz",
            "Mantenimiento Centro-Oriente",
        ),
    ]
    for email, nombre, grupo_n in agentes_def:
        db.add(
            Usuario(
                email=email,
                nombre=nombre,
                hashed_password=PWD,
                rol=RolUsuario.AGENTE,
                grupo_id=grupos[grupo_n].id,
            )
        )

    # Coordinador de zona (Veracruz)
    zona_veracruz = zonas.get("Puerto Veracruz")
    db.add(
        Usuario(
            email="coord.veracruz@soyneto.com",
            nombre="Coordinador Veracruz",
            hashed_password=PWD,
            rol=RolUsuario.COORDINADOR,
            zona_id=zona_veracruz.id if zona_veracruz else None,
        )
    )

    #   # Coordinador global de Mantenimiento (sin zona → ve todos)
    db.add(
        Usuario(
            email="coord.mantenimiento@soyneto.com",
            nombre="Coordinador Nacional Mantenimiento",
            hashed_password=PWD,
            rol=RolUsuario.COORDINADOR,
            zona_id=None,  # None = sin restricción de zona
        )
    )

    # Usuarios de tienda — todas las tiendas cargadas
    for eco, nombre, zona_n, correo, *_ in tiendas_data:
        db.add(
            Usuario(
                email=correo,
                nombre=f"Encargado {nombre}",
                hashed_password=PWD,
                rol=RolUsuario.TIENDA,
                tienda_id=eco,
            )
        )

    db.flush()
    total_users = 1 + len(agentes_def) + 1 + len(tiendas_data)
    print(
        f"   ✓ {total_users} usuarios (1 admin, {len(agentes_def)} agentes, 1 coordinador, {len(tiendas_data)} tiendas)"
    )

    # ── 2.6 TIPIFICACIONES ────────────────────────────────────────────────────
    print("[6/8] Tipificaciones (3 niveles, datos reales Zendesk)...")

    def tip(area, cat, sub, prob, tipo, s, urg, kw="", foto=False):
        t = Tipificacion(
            area_tecnica=area,
            categoria=cat,
            subcategoria=sub,
            problema=prob,
            tipo=tipo,
            sla_policy_id=sla[s].id,
            sla_horas=sla[s].horas_limite,
            urgencia=urg,
            palabras_clave=kw,
            requiere_foto=foto,
            activo=True,
        )
        db.add(t)
        db.flush()
        return t

    I = TipoTicket.INCIDENCIA
    R = TipoTicket.REQUERIMIENTO
    CR = UrgenciaTipificacion.CRITICA
    AL = UrgenciaTipificacion.ALTA
    ME = UrgenciaTipificacion.MEDIA
    BA = UrgenciaTipificacion.BAJA
    SI = AreaTecnica.SISTEMAS
    MN = AreaTecnica.MANTENIMIENTO
    OP = AreaTecnica.OPERACIONES
    AB = AreaTecnica.ABASTO
    FI = AreaTecnica.FINANZAS
    CO = AreaTecnica.COMERCIAL
    RH = AreaTecnica.RRHH

    tips = []
    # ── SISTEMAS ──────────────────────────────────────────────────────────────
    tips += [
        # Hardware crítico
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Terminal bancaria",
            "Sin conectividad / no lee tarjetas",
            I,
            "16h",
            AL,
            "terminal sin conectividad tarjeta",
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Terminal bancaria",
            "No funciona / pantalla rota",
            I,
            "24h",
            AL,
            "terminal bancaria rota dañada",
            True,
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Terminal PAX A35",
            "Error NFC / sin respuesta",
            I,
            "16h",
            AL,
            "pax a35 nfc contactless",
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Impresora térmica",
            "No imprime / atascada / sin papel",
            I,
            "24h",
            AL,
            "impresora térmica no imprime atascada",
            True,
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "CPU",
            "No enciende / pantalla azul / reinicio",
            I,
            "24h",
            AL,
            "cpu no enciende pantalla azul bsod",
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Monitor",
            "Sin imagen / pantalla negra / roto",
            I,
            "48h",
            ME,
            "monitor sin imagen pantalla negra",
            True,
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Teclado",
            "Cable roto / teclas dañadas",
            I,
            "72h",
            BA,
            "teclado cable roto teclas",
            True,
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Lector de huella",
            "No reconoce huellas",
            I,
            "48h",
            ME,
            "lector huella biométrico no reconoce",
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Cajón de dinero",
            "No abre / bloqueado",
            I,
            "24h",
            AL,
            "cajón dinero no abre bloqueado",
        ),
        tip(
            SI,
            "Equipo de cómputo hardware",
            "Scanner",
            "No lee códigos de barras",
            I,
            "48h",
            ME,
            "scanner lector código barras",
            True,
        ),
        # POS SION — 12.8% del volumen
        tip(
            SI,
            "Punto de venta SION",
            "Comunicación / antena",
            "Antena en rojo / sin internet",
            I,
            "6h",
            CR,
            "antena rojo sin internet wifi",
        ),
        tip(
            SI,
            "Punto de venta SION",
            "Catálogo de productos",
            "Artículo no aparece / precio incorrecto",
            I,
            "24h",
            AL,
            "artículo no aparece precio incorrecto catálogo",
        ),
        tip(
            SI,
            "Punto de venta SION",
            "Venta",
            "Venta no registrada / duplicada",
            I,
            "16h",
            AL,
            "venta no registrada duplicada",
        ),
        tip(
            SI,
            "Punto de venta SION",
            "Módulos POS",
            "Módulo lento / no carga / se cierra",
            I,
            "24h",
            AL,
            "módulo pos lento no carga sistema",
        ),
        tip(
            SI,
            "Punto de venta SION",
            "Lentitud",
            "Sistema muy lento / no responde",
            I,
            "24h",
            ME,
            "sistema lento no responde lentitud",
        ),
        tip(
            SI,
            "Punto de venta SION",
            "Catálogo de productos",
            "Sincronización o consulta de catálogo",
            R,
            "72h",
            BA,
            "catálogo sincronización consulta soporte",
        ),
        tip(
            SI,
            "Punto de venta",
            "Catálogo de productos",
            "Artículo sin precio / catálogo soporte",
            I,
            "24h",
            ME,
            "catálogo productos punto venta soporte",
        ),
        tip(
            SI,
            "Punto de venta",
            "Comunicación",
            "Falla en comunicación / antena",
            I,
            "6h",
            CR,
            "falla comunicación antena punto venta",
        ),
        tip(
            SI,
            "Administración caja SION",
            "Reporte de ventas",
            "Reporte incorrecto / no cuadra caja",
            I,
            "24h",
            AL,
            "reporte ventas incorrecto no cuadra caja",
        ),
        tip(
            SI,
            "Actualización pendiente hardware",
            "CPU / Equipo",
            "Equipo requiere actualización firmware",
            R,
            "72h",
            BA,
            "actualización pendiente firmware hardware",
        ),
    ]
    # ── OPERACIONES ───────────────────────────────────────────────────────────
    tips += [
        tip(
            OP,
            "Servicios financieros SION",
            "Tarjeta de vales",
            "Tarjeta rechazada / comercio inválido",
            I,
            "16h",
            AL,
            "tarjeta vales rechazada comercio inválido",
        ),
        tip(
            OP,
            "Servicios financieros SION",
            "Tarjeta",
            "Tarjeta Edenred / Sodexo rechazada",
            I,
            "16h",
            AL,
            "edenred sodexo tarjeta rechazada",
        ),
        tip(
            OP,
            "Servicios financieros SION",
            "Venta",
            "Error en cobro / venta incorrecta",
            I,
            "16h",
            AL,
            "error cobro venta incorrecta financiero",
        ),
        tip(
            OP,
            "Servicios financieros SION",
            "Devolución",
            "Error en devolución a cliente",
            I,
            "24h",
            AL,
            "devolución error cliente",
        ),
        tip(
            OP,
            "Servicios financieros SION",
            "Respuesta tardía",
            "Tarjeta con respuesta tardía",
            I,
            "24h",
            ME,
            "tarjeta respuesta tardía lenta",
        ),
        tip(
            OP,
            "Administración caja SION",
            "Reporte de ventas",
            "Reporte incorrecto / cuadre de caja",
            I,
            "24h",
            AL,
            "reporte ventas incorrecto cuadre caja",
        ),
        tip(
            OP,
            "Administración caja SION",
            "Procedimientos",
            "Cómo generar reporte en Soluciones Neto",
            R,
            "72h",
            BA,
            "cómo generar reporte soluciones neto procedimiento",
        ),
        tip(
            OP,
            "Portal RH SION",
            "Acceso",
            "Sin acceso / contraseña bloqueada",
            I,
            "24h",
            ME,
            "portal rh sin acceso contraseña bloqueada",
        ),
        tip(
            OP,
            "Portal RH soporte",
            "General",
            "Soporte general portal recursos humanos",
            R,
            "72h",
            BA,
            "portal rh recursos humanos soporte",
        ),
        tip(
            OP,
            "Inventarios SION",
            "Diferencias",
            "Diferencia de inventario en sistema",
            I,
            "48h",
            ME,
            "diferencia inventario sistema sion",
        ),
        tip(
            OP,
            "Inventarios soporte",
            "General",
            "Soporte general inventarios",
            R,
            "72h",
            BA,
            "inventarios soporte general",
        ),
        tip(
            OP,
            "Comercial SION",
            "Catálogo",
            "Artículo no aparece en catálogo comercial",
            I,
            "24h",
            ME,
            "artículo catálogo comercial no aparece sion",
        ),
    ]
    # ── ABASTO ────────────────────────────────────────────────────────────────
    tips += [
        tip(
            AB,
            "Abasto SION",
            "Órdenes de compra",
            "Cancelación por error en captura",
            I,
            "48h",
            ME,
            "cancelación orden compra error captura",
        ),
        tip(
            AB,
            "Abasto SION",
            "Órdenes de compra",
            "Artículo no aparece en OC",
            I,
            "48h",
            ME,
            "artículo no aparece orden compra oc",
        ),
        tip(
            AB,
            "Abasto SION",
            "Órdenes de compra",
            "Orden de compra en blanco",
            I,
            "48h",
            AL,
            "orden compra oc en blanco vacía",
        ),
        tip(
            AB,
            "Abasto SION",
            "Órdenes de compra",
            "Mensaje error al recepcionar OC",
            I,
            "32h",
            ME,
            "mensaje error recepcionar orden compra soporte",
        ),
        tip(
            AB,
            "Abasto SION",
            "Órdenes de compra",
            "Proveedor no ha realizado visita",
            I,
            "72h",
            ME,
            "proveedor no visita programada",
        ),
        tip(
            AB,
            "Abasto SION",
            "Transferencias",
            "Error en transferencia entre tiendas",
            I,
            "24h",
            AL,
            "transferencia entre tiendas error abasto",
        ),
        tip(
            AB,
            "Abasto SION",
            "Transferencias",
            "Reimpresión ticket orden de compra",
            R,
            "48h",
            BA,
            "reimpresión ticket orden compra proveedor",
        ),
        tip(
            AB,
            "Abasto soporte",
            "General",
            "Soporte general módulo Abasto",
            R,
            "72h",
            BA,
            "abasto soporte general módulo",
        ),
    ]
    # ── MANTENIMIENTO — 35.2% del volumen ─────────────────────────────────────
    tips += [
        tip(
            MN,
            "Mantenimiento correctivo",
            "Electricidad",
            "Falla eléctrica / sin luz en tienda",
            I,
            "24h",
            CR,
            "falla eléctrica sin luz electricidad",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Refrigeración",
            "Equipo de frío / no enfría / falla",
            I,
            "72h",
            AL,
            "refrigeración equipo frío falla no enfría",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Plomería",
            "Fuga de agua / baños sin servicio",
            I,
            "48h",
            AL,
            "fuga agua baños sin servicio plomería",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Instalaciones",
            "Daño estructural / goteras / pintura",
            I,
            "120h",
            ME,
            "daño estructural goteras pintura piso",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Seguridad",
            "Cámara dañada / alarma sin funcionar",
            I,
            "48h",
            AL,
            "cámara dañada alarma sin funcionar seguridad",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Aire acondicionado",
            "AC no enfría / hace ruido / apagado",
            I,
            "72h",
            ME,
            "aire acondicionado no enfría ruido apagado",
            True,
        ),
        tip(
            MN,
            "Mantenimiento correctivo",
            "Luminarias",
            "Lámparas fundidas / iluminación",
            I,
            "120h",
            BA,
            "lámparas fundidas iluminación luminarias",
            True,
        ),
        tip(
            MN,
            "Mantenimiento preventivo",
            "Revisión programada",
            "Revisión general equipos de tienda",
            R,
            "120h",
            BA,
            "revisión programada general equipos",
        ),
        tip(
            MN,
            "Mantenimiento preventivo",
            "Limpieza industrial",
            "Servicio limpieza profunda programado",
            R,
            "120h",
            BA,
            "limpieza industrial profunda programado",
        ),
    ]
    # ── FINANZAS ──────────────────────────────────────────────────────────────
    tips += [
        tip(
            FI,
            "Finanzas SION",
            "Facturación",
            "Error en factura / RFC incorrecto",
            I,
            "48h",
            ME,
            "factura error rfc incorrecto facturación",
        ),
        tip(
            FI,
            "Finanzas SION",
            "Nómina",
            "Diferencia en nómina / descuento incorrecto",
            I,
            "72h",
            AL,
            "nómina diferencia descuento incorrecto",
        ),
        tip(
            FI,
            "Finanzas SION",
            "Planeación financiera",
            "Soporte módulo planeación financiera",
            R,
            "72h",
            BA,
            "planeación financiera módulo soporte",
        ),
        tip(
            FI,
            "Finanzas SION",
            "Venteks",
            "Soporte sistema Venteks / integración",
            I,
            "48h",
            ME,
            "venteks sistema soporte integración",
        ),
    ]
    # ── COMERCIAL ─────────────────────────────────────────────────────────────
    tips += [
        tip(
            CO,
            "Comercial SION",
            "Catálogo",
            "Artículo sin existencia / diferencia precio",
            I,
            "24h",
            ME,
            "artículo sin existencia diferencia precio comercial",
        ),
        tip(
            CO,
            "Comercial SION",
            "Catálogo",
            "Catálogo botanas / bebidas / lácteos",
            R,
            "48h",
            BA,
            "catálogo botanas bebidas lácteos comercial",
        ),
        tip(
            CO,
            "Comercial SION",
            "Reportes",
            "Reporte de ventas comercial",
            R,
            "72h",
            BA,
            "reporte ventas comercial sion",
        ),
    ]
    # ── RRHH ──────────────────────────────────────────────────────────────────
    tips += [
        tip(
            RH,
            "Portal RH SION",
            "Acceso / Contraseña",
            "Sin acceso portal RH / recuperación",
            I,
            "24h",
            ME,
            "portal rh sin acceso contraseña recuperación",
        ),
        tip(
            RH,
            "Portal RH SION",
            "Incidencias",
            "Registro de incidencia en portal RH",
            R,
            "48h",
            BA,
            "registro incidencia portal rh",
        ),
    ]

    db.commit()
    print(f"   ✓ {len(tips)} tipificaciones")

    # ── 2.7 MATRIZ DE RUTEO ───────────────────────────────────────────────────
    print("[7/8] Matriz de ruteo...")

    # Mapa área → grupo por defecto
    area_grupo_default = {
        AreaTecnica.SISTEMAS: grupos["Soporte Sistemas"],
        AreaTecnica.OPERACIONES: grupos["Call Center Operaciones"],
        AreaTecnica.ABASTO: grupos["Sistemas Abasto"],
        AreaTecnica.FINANZAS: grupos["Finanzas Inventarios"],
        AreaTecnica.COMERCIAL: grupos["Soporte Comercial"],
        AreaTecnica.RRHH: grupos["Recursos Humanos"],
        AreaTecnica.MANTENIMIENTO: grupos["Mantenimiento Poniente"],  # default
    }

    # Reglas específicas de Mantenimiento por zona
    mantto_zona_grupo = {
        # zonas sureste → Mantenimiento Sureste
        "Chiapas Istmo Costa": grupos["Mantenimiento Sureste"],
        "Chiapas Tuxtla 1": grupos["Mantenimiento Sureste"],
        "Chiapas Tuxtla 2": grupos["Mantenimiento Sureste"],
        "Tabasco Centro": grupos["Mantenimiento Sureste"],
        "Tabasco Villa 3": grupos["Mantenimiento Sureste"],
        "Yucatán Norte": grupos["Mantenimiento Sureste"],
        "Campeche Sur": grupos["Mantenimiento Sureste"],
        # zonas veracruz
        "Puerto Veracruz": grupos["Mantenimiento Veracruz"],
        "Orizaba": grupos["Mantenimiento Veracruz"],
        "Alvarado": grupos["Mantenimiento Veracruz"],
        "Tuxtepec": grupos["Mantenimiento Veracruz"],
        "Cuenca": grupos["Mantenimiento Veracruz"],
        "Poza Rica": grupos["Mantenimiento Veracruz"],
        "Tantoyuca": grupos["Mantenimiento Veracruz"],
        "Heroica Veracruz": grupos["Mantenimiento Veracruz"],
        "Boca del Río": grupos["Mantenimiento Veracruz"],
        "Portuaria": grupos["Mantenimiento Veracruz"],
        # zonas centro/oriente
        "GAM Aragón": grupos["Mantenimiento Centro-Oriente"],
        "Azcapotzalco": grupos["Mantenimiento Centro-Oriente"],
        "Coyoacán": grupos["Mantenimiento Centro-Oriente"],
        "La Paz Neza": grupos["Mantenimiento Centro-Oriente"],
        "Ecatepec Aragón": grupos["Mantenimiento Centro-Oriente"],
        "Ecatepec Santa Clara": grupos["Mantenimiento Centro-Oriente"],
        "Iztapalapa Norte": grupos["Mantenimiento Centro-Oriente"],
        "Nicolas Romero": grupos["Mantenimiento Centro-Oriente"],
        "Hidalgo": grupos["Mantenimiento Centro-Oriente"],
        "Toluca Sur": grupos["Mantenimiento Centro-Oriente"],
    }

    # Reglas específicas de SION Analistas (POS, catálogo, servicios financieros SION)
    sion_keywords = [
        "SION",
        "sion",
        "Punto de venta SION",
        "Servicios financieros SION",
        "Administración caja SION",
        "Portal RH SION",
    ]

    reglas = 0
    for tip_obj in tips:
        area = tip_obj.area_tecnica

        if area == AreaTecnica.MANTENIMIENTO:
            # Regla general → grupo por defecto
            db.add(
                ReglaRuteo(
                    tipificacion_id=tip_obj.id,
                    zona_id=None,
                    grupo_id=grupos["Mantenimiento Poniente"].id,
                    prioridad=2,
                )
            )
            # Reglas específicas por zona
            for zona_n, grupo_mantto in mantto_zona_grupo.items():
                z = zonas.get(zona_n)
                if z:
                    db.add(
                        ReglaRuteo(
                            tipificacion_id=tip_obj.id,
                            zona_id=z.id,
                            grupo_id=grupo_mantto.id,
                            prioridad=1,
                        )
                    )
                    reglas += 1
        elif area == AreaTecnica.SISTEMAS:
            # POS SION y SION → SION Analistas, hardware → Soporte Sistemas
            if "SION" in (tip_obj.categoria or "") or "SION" in (
                tip_obj.subcategoria or ""
            ):
                db.add(
                    ReglaRuteo(
                        tipificacion_id=tip_obj.id,
                        zona_id=None,
                        grupo_id=grupos["SION Analistas"].id,
                        prioridad=1,
                    )
                )
            elif "Comunicacion" in (tip_obj.subcategoria or "") or "antena" in (
                tip_obj.palabras_clave or ""
            ):
                db.add(
                    ReglaRuteo(
                        tipificacion_id=tip_obj.id,
                        zona_id=None,
                        grupo_id=grupos["Comunicaciones Soporte"].id,
                        prioridad=1,
                    )
                )
            else:
                db.add(
                    ReglaRuteo(
                        tipificacion_id=tip_obj.id,
                        zona_id=None,
                        grupo_id=grupos["Soporte Sistemas"].id,
                        prioridad=1,
                    )
                )
        elif area == AreaTecnica.OPERACIONES:
            if "financiero" in (tip_obj.palabras_clave or "") or "tarjeta" in (
                tip_obj.palabras_clave or ""
            ):
                db.add(
                    ReglaRuteo(
                        tipificacion_id=tip_obj.id,
                        zona_id=None,
                        grupo_id=grupos["Servicios Financieros"].id,
                        prioridad=1,
                    )
                )
            else:
                db.add(
                    ReglaRuteo(
                        tipificacion_id=tip_obj.id,
                        zona_id=None,
                        grupo_id=grupos["Call Center Operaciones"].id,
                        prioridad=1,
                    )
                )
        else:
            g = area_grupo_default.get(area, grupos["Soporte Sistemas"])
            db.add(
                ReglaRuteo(
                    tipificacion_id=tip_obj.id, zona_id=None, grupo_id=g.id, prioridad=1
                )
            )
        reglas += 1

    db.commit()
    print(f"   ✓ {reglas} reglas de ruteo")

    # ── 2.8 PLANTILLAS DE RESPUESTA ───────────────────────────────────────────
    print("[8/8] Plantillas de respuesta rápida...")

    admin_user = db.query(Usuario).filter(Usuario.rol == RolUsuario.ADMIN).first()
    plantillas = [
        (
            "Pasos reinicio terminal bancaria",
            "1. Apaga la terminal completamente\n2. Espera 30 segundos\n3. Enciende y espera que cargue\n4. Intenta procesar nuevamente",
            AreaTecnica.SISTEMAS,
        ),
        (
            "Solución impresora sin papel",
            "Verifica que el papel esté correctamente instalado con la cara térmica (brillante) hacia arriba. Si el rodillo no jala, limpia con alcohol isopropílico.",
            AreaTecnica.SISTEMAS,
        ),
        (
            "Troubleshooting antena en rojo",
            "1. Verifica que los cables estén conectados firmemente\n2. Reinicia el equipo de red (modem/router)\n3. Espera 2 minutos y verifica la señal\n4. Si persiste, reporta el número de serie del equipo",
            AreaTecnica.SISTEMAS,
        ),
        (
            "Pasos para sincronizar catálogo POS",
            "1. Cierra sesión en el sistema\n2. Espera 5 minutos\n3. Vuelve a iniciar sesión\n4. El catálogo se sincronizará automáticamente al abrir el módulo",
            AreaTecnica.SISTEMAS,
        ),
        (
            "Visita técnica programada — confirmación",
            "Se ha programado la visita de nuestro técnico para la fecha indicada. Por favor asegúrese de tener disponible al encargado del área afectada y acceso al equipo.",
            AreaTecnica.MANTENIMIENTO,
        ),
        (
            "Solicitud de foto del equipo dañado",
            "Para continuar con su reporte necesitamos que nos envíe fotografías del equipo/área afectada mostrando claramente el daño. Adjúntelas a este ticket.",
            None,
        ),  # aplica a todas las áreas
        (
            "Ticket resuelto — cierre",
            "Su reporte ha sido atendido y resuelto. Si el problema vuelve a presentarse dentro de las próximas 24 horas, reabra este ticket y lo atenderemos con prioridad.",
            None,
        ),
    ]
    for titulo, contenido, area in plantillas:
        db.add(
            PlantillaRespuesta(
                titulo=titulo,
                contenido=contenido,
                area_tecnica=area,
                creado_por=admin_user.id,
                activo=True,
            )
        )
    db.commit()
    print(f"   ✓ {len(plantillas)} plantillas de respuesta")


# ═══════════════════════════════════════════════════════════════════════════════
# RESUMEN
# ═══════════════════════════════════════════════════════════════════════════════


def resumen():
    from app.models.models import PlantillaRespuesta as PR

    print("\n" + "=" * 55)
    print("✅ Reset + Seed v2 completado")
    print("=" * 55)
    print(f"  Regiones:       {db.query(Region).count()}")
    print(f"  Zonas:          {db.query(Zona).count()}")
    print(f"  Tiendas:        {db.query(Tienda).count()}")
    print(f"  Grupos:         {db.query(Grupo).count()}")
    print(f"  Usuarios:       {db.query(Usuario).count()}")
    print(f"  SLA Policies:   {db.query(SlaPolicy).count()}")
    print(f"  Tipificaciones: {db.query(Tipificacion).count()}")
    print(f"  Reglas ruteo:   {db.query(ReglaRuteo).count()}")
    print(f"  Plantillas:     {db.query(PR).count()}")
    print("\n🔑 Credenciales de prueba (password: Neto2024!):")
    print("  admin@soyneto.com              → ADMIN")
    print("  karen.aboytes@soyneto.com      → AGENTE Soporte Sistemas")
    print("  christian.gutierrez@soyneto.com→ AGENTE SION Analistas")
    print("  everardo.mtz@soyneto.com       → AGENTE Mantenimiento Sureste")
    print("  coord.veracruz@soyneto.com     → COORDINADOR Veracruz")
    print("  t749@soyneto.com               → TIENDA 749 PANZACOLA")
    print("  t411@soyneto.com               → TIENDA 411 JALAPA CENTRO")
    print("  t1160@soyneto.com              → TIENDA 1160 ACATLIPA (frontal_especial)")


if __name__ == "__main__":
    import sys

    auto = "--confirm" in sys.argv
    if not auto:
        print("⚠️  Este script BORRA TODOS los datos y recarga los catálogos.")
        resp = input("¿Confirmar reset completo? (escribe 'si'): ").strip().lower()
        if resp != "si":
            print("Cancelado.")
            sys.exit(0)
    reset()
    seed()
    resumen()
