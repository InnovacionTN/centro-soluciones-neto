"""
Seed de datos mock realistas.
Ejecutar: python scripts/seed.py
Crea: regiones, zonas, tiendas (muestra), grupos, usuarios, tipificaciones, matriz de ruteo
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal, engine
from app.models.models import Base, Region, Zona, Tienda, Grupo, Usuario, Tipificacion, ReglaRuteo
from app.models.models import RolUsuario, AreaTecnica, TipoTicket, UrgenciaTipificacion
from app.core.security import hash_password

db = SessionLocal()


def run():
    print("🌱 Creando tablas...")
    Base.metadata.create_all(bind=engine)

    if db.query(Region).count() > 0:
        print("⚠️  Ya existe data. Ejecuta con --reset para limpiar.")
        return

    # ── Regiones ───────────────────────────────────────────────────────────────
    print("📍 Regiones...")
    regiones = {}
    for nombre in ["Sureste", "Oriente", "Norte", "Centro", "Occidente"]:
        r = Region(nombre=nombre)
        db.add(r)
        regiones[nombre] = r
    db.flush()

    # ── Zonas ──────────────────────────────────────────────────────────────────
    print("🗺  Zonas...")
    zonas_data = {
        "Sureste": ["Balam", "Campeche Sur", "Yucatan Norte"],
        "Oriente": ["Veracruz Norte", "Veracruz Sur", "Tabasco"],
        "Norte": ["Monterrey", "Coahuila", "Tamaulipas"],
        "Centro": ["CDMX Norte", "CDMX Sur", "Estado de Mexico"],
        "Occidente": ["Guadalajara", "Jalisco Sur", "Colima"],
    }
    zonas = {}
    for region_nombre, zona_list in zonas_data.items():
        for z in zona_list:
            zona = Zona(nombre=z, region_id=regiones[region_nombre].id)
            db.add(zona)
            zonas[z] = zona
    db.flush()

    # ── Tiendas (muestra de 20) ────────────────────────────────────────────────
    print("🏪 Tiendas (muestra)...")
    tiendas_data = [
        (749,  "PANZACOLA",          "Balam",           "t749@soyneto.com"),
        (1296, "TUXTLA CHICO",       "Campeche Sur",    "t1296@soyneto.com"),
        (411,  "JALAPA CENTRO",      "Veracruz Norte",  "t411@soyneto.com"),
        (1483, "RODRIGUEZ CLARA",    "Veracruz Sur",    "t1483@soyneto.com"),
        (7270, "LOS ANGELES",        "Tabasco",         "t7270@soyneto.com"),
        (616,  "HUACTZICO",          "Tabasco",         "t616@soyneto.com"),
        (4553, "HUITZUCO",           "CDMX Norte",      "t4553@soyneto.com"),
        (4524, "ACATZINGO",          "CDMX Sur",        "t4524@soyneto.com"),
        (1058, "COMISTÁN",           "Estado de Mexico","t1058@soyneto.com"),
        (2845, "TLACOTEPEC",         "Monterrey",       "t2845@soyneto.com"),
        (1659, "CUICHAPA CENTRO",    "Guadalajara",     "t1659@soyneto.com"),
        (219,  "CALICANTO",          "Colima",          "t219@soyneto.com"),
        (575,  "COTAXTLA JUAREZ",    "Veracruz Norte",  "t575@soyneto.com"),
        (1563, "PEDRO MORENO",       "Jalisco Sur",     "t1563@soyneto.com"),
        (196,  "GUACAMAYAS IMSS",    "CDMX Norte",      "t196@soyneto.com"),
        (229,  "URUCHURTUR",         "Estado de Mexico","t229@soyneto.com"),
        (1213, "SAN PABLO ETLA",     "Balam",           "t1213@soyneto.com"),
        (1126, "SANTA CLARA",        "Yucatan Norte",   "t1126@soyneto.com"),
        (1221, "LA COLSA",           "Coahuila",        "t1221@soyneto.com"),
        (8971, "IMSS CENTRO",        "CDMX Sur",        "t8971@soyneto.com"),
    ]
    tiendas = {}
    for num, nombre, zona_n, correo in tiendas_data:
        t = Tienda(id=num, nombre=nombre, zona_id=zonas[zona_n].id, correo_corporativo=correo)
        db.add(t)
        tiendas[num] = t
    db.flush()

    # ── Grupos ─────────────────────────────────────────────────────────────────
    print("👥 Grupos del Call Center...")
    grupos_data = [
        ("Abasto Nacional",          AreaTecnica.ABASTO,          "#cc-abasto"),
        ("Sistemas SION",            AreaTecnica.SISTEMAS,        "#cc-sistemas"),
        ("Mantenimiento Sur",        AreaTecnica.MANTENIMIENTO,   "#cc-mantto-sur"),
        ("Mantenimiento Norte",      AreaTecnica.MANTENIMIENTO,   "#cc-mantto-norte"),
        ("Finanzas",                 AreaTecnica.FINANZAS,        "#cc-finanzas"),
        ("Comercial",                AreaTecnica.COMERCIAL,       "#cc-comercial"),
    ]
    grupos = {}
    for nombre, area, slack in grupos_data:
        g = Grupo(nombre=nombre, area_tecnica=area, slack_canal=slack)
        db.add(g)
        grupos[nombre] = g
    db.flush()

    # ── Usuarios ───────────────────────────────────────────────────────────────
    print("👤 Usuarios...")
    pwd = hash_password("Neto2024!")

    # Admin
    db.add(Usuario(email="admin@soyneto.com", nombre="Administrador Sistema",
                   hashed_password=pwd, rol=RolUsuario.ADMIN))

    # Agentes del Call Center
    agentes_data = [
        ("alejandra.sanchez@soyneto.com",   "Alejandra E. Sánchez",   "Abasto Nacional"),
        ("hugo.patlan@soyneto.com",          "Hugo Patlán Piñón",      "Abasto Nacional"),
        ("christian.gutierrez@soyneto.com",  "Christian Gutiérrez",    "Sistemas SION"),
        ("david.ramirez@soyneto.com",        "David Ramírez",          "Sistemas SION"),
        ("arturo.cortez@soyneto.com",        "Arturo Cortez Ortiz",    "Sistemas SION"),
        ("everardo.mtz@soyneto.com",         "Everardo Martínez",      "Mantenimiento Sur"),
        ("coordinador.mantto@soyneto.com",   "Coordinador Mantto",     "Mantenimiento Norte"),
        ("brenda.alvarez@soyneto.com",       "Brenda Isabel Álvarez",  "Finanzas"),
        ("gerente.comercial@soyneto.com",    "Gerente Comercial",      "Comercial"),
    ]
    for email, nombre, grupo_n in agentes_data:
        db.add(Usuario(
            email=email, nombre=nombre, hashed_password=pwd,
            rol=RolUsuario.AGENTE, grupo_id=grupos[grupo_n].id
        ))

    # Usuarios de tienda (muestra)
    for num, nombre, _, correo in tiendas_data[:5]:
        db.add(Usuario(
            email=correo, nombre=f"Encargado {nombre}",
            hashed_password=pwd, rol=RolUsuario.TIENDA,
            tienda_id=num
        ))
    db.flush()

    # ── Tipificaciones ─────────────────────────────────────────────────────────
    print("📋 Tipificaciones...")
    tips_data = [
        # (area, categoria, problema, tipo, sla_horas, urgencia, palabras_clave, requiere_foto)
        (AreaTecnica.ABASTO, "Órdenes de Compra", "Generar orden de compra centralizada",
         TipoTicket.INCIDENCIA, 120, UrgenciaTipificacion.BAJA,
         "orden compra proveedor generar pedido centralizado", False),

        (AreaTecnica.ABASTO, "Órdenes de Compra", "Artículo no aparece en orden de compra",
         TipoTicket.INCIDENCIA, 120, UrgenciaTipificacion.BAJA,
         "artículo faltante orden no aparece producto catálogo", False),

        (AreaTecnica.ABASTO, "Órdenes de Compra", "Cancelación de orden por error en captura",
         TipoTicket.INCIDENCIA, 120, UrgenciaTipificacion.BAJA,
         "cancelar orden error captura corrección", False),

        (AreaTecnica.ABASTO, "Órdenes de Compra", "Proveedor no ha visitado la tienda",
         TipoTicket.INCIDENCIA, 120, UrgenciaTipificacion.BAJA,
         "proveedor sin visita días ausente no viene", False),

        (AreaTecnica.ABASTO, "Transferencias", "Relacionar transferencia entre tiendas",
         TipoTicket.INCIDENCIA, 120, UrgenciaTipificacion.BAJA,
         "transferencia tienda origen destino relacionar", False),

        (AreaTecnica.ABASTO, "Transferencias", "Artículos bloqueados a la compra",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.MEDIA,
         "bloqueado compra artículo sin asignar catálogo bloqueo", False),

        (AreaTecnica.SISTEMAS, "Punto de Venta", "Código de barras erróneo",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.MEDIA,
         "código barras error no pasa escáner producto", False),

        (AreaTecnica.SISTEMAS, "Punto de Venta", "Precio diferente al folleto o sistema",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.MEDIA,
         "precio diferente folleto mes vigencia cobrado", False),

        (AreaTecnica.SISTEMAS, "Punto de Venta", "Promoción no asignada o no pasa en caja",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.MEDIA,
         "promoción no pasa caja no aplica descuento", False),

        (AreaTecnica.SISTEMAS, "Servicios Financieros", "Módulo retiro efectivo no aparece",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "retiro efectivo módulo no aparece servicio financiero", False),

        (AreaTecnica.SISTEMAS, "Servicios Financieros", "QR de pago no funciona",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "QR pago no refleja servicio financiero escáner", False),

        (AreaTecnica.SISTEMAS, "Conectividad", "Sin internet o antena sin señal",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "sin internet antena apagada sin señal red wifi desconectado", False),

        (AreaTecnica.SISTEMAS, "Administración Caja", "Caja electrónica bloqueada",
         TipoTicket.INCIDENCIA, 6, UrgenciaTipificacion.CRITICA,
         "caja electrónica bloqueada no abre falla eléctrica", False),

        (AreaTecnica.MANTENIMIENTO, "Energía Eléctrica", "Sin energía eléctrica en tienda",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "sin luz sin energía eléctrica apagón luz cortada", False),

        (AreaTecnica.MANTENIMIENTO, "Energía Eléctrica", "Lámparas fundidas",
         TipoTicket.INCIDENCIA, 72, UrgenciaTipificacion.MEDIA,
         "lámparas fundidas sin luz alumbrado oscuro focos", True),

        (AreaTecnica.MANTENIMIENTO, "Instalaciones", "Fuga o filtración de agua",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "fuga agua filtración gotera techo piso mojado", True),

        (AreaTecnica.MANTENIMIENTO, "Instalaciones", "Daño en área de caja",
         TipoTicket.INCIDENCIA, 72, UrgenciaTipificacion.MEDIA,
         "daño caja mostrador mueble roto instalación", True),

        (AreaTecnica.FINANZAS, "Administración Caja", "Casette de caja anclada lleno",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "casette lleno caja anclada depósito efectivo", False),

        (AreaTecnica.FINANZAS, "Administración Caja", "Fallas eléctricas en caja electrónica",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.ALTA,
         "caja electrónica falla eléctrica bloqueo infraestructura", False),

        (AreaTecnica.FINANZAS, "Nómina", "Justificación de retardo",
         TipoTicket.REQUERIMIENTO, 48, UrgenciaTipificacion.MEDIA,
         "retardo justificación entrada tarde nómina rrhh", False),

        (AreaTecnica.COMERCIAL, "Catálogo", "Etiqueta de precio incorrecta",
         TipoTicket.INCIDENCIA, 72, UrgenciaTipificacion.MEDIA,
         "etiqueta precio error diferencia producto impresión", False),

        (AreaTecnica.COMERCIAL, "Catálogo", "Precio diferente en producto adoptado",
         TipoTicket.INCIDENCIA, 24, UrgenciaTipificacion.MEDIA,
         "adoptado precio diferente categoría sub categoría", False),
    ]
    tips = []
    for area, cat, prob, tipo, sla, urg, kw, foto in tips_data:
        t = Tipificacion(
            area_tecnica=area, categoria=cat, problema=prob,
            tipo=tipo, sla_horas=sla, urgencia=urg,
            palabras_clave=kw, requiere_foto=foto,
        )
        db.add(t)
        tips.append((t, area))
    db.flush()

    # ── Matriz de Ruteo ────────────────────────────────────────────────────────
    print("🗺  Matriz de ruteo...")
    # Reglas generales (zona=None → aplica a todas)
    area_to_grupo = {
        AreaTecnica.ABASTO:        grupos["Abasto Nacional"],
        AreaTecnica.SISTEMAS:      grupos["Sistemas SION"],
        AreaTecnica.MANTENIMIENTO: grupos["Mantenimiento Sur"],
        AreaTecnica.FINANZAS:      grupos["Finanzas"],
        AreaTecnica.COMERCIAL:     grupos["Comercial"],
    }
    for tip, area in tips:
        grupo = area_to_grupo.get(area)
        if grupo:
            db.add(ReglaRuteo(tipificacion_id=tip.id, zona_id=None, grupo_id=grupo.id))

    # Regla específica: Mantenimiento en zona Norte → grupo Mantenimiento Norte
    for tip, area in tips:
        if area == AreaTecnica.MANTENIMIENTO:
            for zona_n in ["Monterrey", "Coahuila", "Tamaulipas"]:
                db.add(ReglaRuteo(
                    tipificacion_id=tip.id,
                    zona_id=zonas[zona_n].id,
                    grupo_id=grupos["Mantenimiento Norte"].id,
                    prioridad=0,  # más alta que la general
                ))

    db.commit()
    print("\n✅ Seed completado:")
    print(f"   {db.query(Region).count()} regiones")
    print(f"   {db.query(Zona).count()} zonas")
    print(f"   {db.query(Tienda).count()} tiendas (muestra)")
    print(f"   {db.query(Grupo).count()} grupos")
    print(f"   {db.query(Usuario).count()} usuarios")
    print(f"   {db.query(Tipificacion).count()} tipificaciones")
    print(f"   {db.query(ReglaRuteo).count()} reglas de ruteo")
    print("\n🔑 Credenciales de prueba:")
    print("   admin@soyneto.com       / Neto2024!  → ADMIN")
    print("   christian.gutierrez@soyneto.com / Neto2024!  → AGENTE Sistemas")
    print("   t749@soyneto.com        / Neto2024!  → TIENDA 749 PANZACOLA")

    db.close()


if __name__ == "__main__":
    run()
