"""
Reset completo + seed limpio para pruebas.
Ejecutar: python -m scripts.reset_seed

Crea:
  1 admin · 1 tienda · 4 agentes (Sistemas, Mantto, Abasto, Finanzas)
  Tipificaciones y ruteo completos
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
    BitacoraEvento,
    Ticket,
    PlantillaRespuesta,
    RolUsuario,
    AreaTecnica,
    TipoTicket,
    UrgenciaTipificacion,
)
from app.core.security import hash_password
from sqlalchemy import text

db = SessionLocal()


def reset():
    print("Limpiando base de datos...")
    # Borrar en orden para respetar FKs — sin requerir superusuario
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM plantillas_respuesta"))
        conn.execute(
            text("DELETE FROM bitacora_eventos")
        )  # borra antes que ticket_evidencias
        conn.execute(text("DELETE FROM ticket_evidencias"))
        conn.execute(text("DELETE FROM tickets"))
        conn.execute(text("DELETE FROM matriz_ruteo"))
        conn.execute(text("DELETE FROM cat_tipificaciones"))
        conn.execute(text("DELETE FROM usuarios"))
        conn.execute(text("DELETE FROM cat_grupos"))
        conn.execute(text("DELETE FROM tiendas"))
        conn.execute(text("DELETE FROM cat_zonas"))
        conn.execute(text("DELETE FROM cat_regiones"))
        # Resetear secuencias para que los IDs vuelvan a empezar en 1
        for seq in [
            "cat_regiones_id_seq",
            "cat_zonas_id_seq",
            "cat_grupos_id_seq",
            "usuarios_id_seq",
            "cat_tipificaciones_id_seq",
            "matriz_ruteo_id_seq",
            "bitacora_eventos_id_seq",
            "tickets_id_seq",
            "ticket_evidencias_id_seq",
            "plantillas_respuesta_id_seq",
        ]:
            conn.execute(text(f"ALTER SEQUENCE {seq} RESTART WITH 1"))
        conn.commit()
    print("   Tablas limpias y secuencias reseteadas")


def seed():
    print("Creando datos de prueba...")
    pwd = hash_password("Neto2024!")

    # Region + Zona
    region = Region(nombre="Centro")
    db.add(region)
    db.flush()

    zona = Zona(nombre="CDMX Sur", region_id=region.id)
    db.add(zona)
    db.flush()

    # Tienda
    tienda = Tienda(
        id=749,
        nombre="PANZACOLA",
        zona_id=zona.id,
        correo_corporativo="t749@soyneto.com",
    )
    db.add(tienda)
    db.flush()

    # Grupos
    grupos_data = [
        ("Sistemas SION", AreaTecnica.SISTEMAS, "#cc-sistemas"),
        ("Mantenimiento", AreaTecnica.MANTENIMIENTO, "#cc-mantto"),
        ("Abasto Nacional", AreaTecnica.ABASTO, "#cc-abasto"),
        ("Finanzas", AreaTecnica.FINANZAS, "#cc-finanzas"),
        ("Comercial", AreaTecnica.COMERCIAL, "#cc-comercial"),
    ]
    grupos = {}
    for nombre, area, slack in grupos_data:
        g = Grupo(nombre=nombre, area_tecnica=area, slack_canal=slack)
        db.add(g)
        grupos[nombre] = g
    db.flush()

    # Usuarios
    db.add(
        Usuario(
            email="admin@soyneto.com",
            nombre="Administrador Sistema",
            hashed_password=pwd,
            rol=RolUsuario.ADMIN,
        )
    )
    agentes = [
        ("christian.gutierrez@soyneto.com", "Christian Gutierrez", "Sistemas SION"),
        ("everardo.mtz@soyneto.com", "Everardo Martinez", "Mantenimiento"),
        ("alejandra.sanchez@soyneto.com", "Alejandra E. Sanchez", "Abasto Nacional"),
        ("brenda.alvarez@soyneto.com", "Brenda Alvarez", "Finanzas"),
    ]
    for email, nombre, grupo_n in agentes:
        db.add(
            Usuario(
                email=email,
                nombre=nombre,
                hashed_password=pwd,
                rol=RolUsuario.AGENTE,
                grupo_id=grupos[grupo_n].id,
            )
        )
    db.add(
        Usuario(
            email="t749@soyneto.com",
            nombre="Encargado PANZACOLA",
            hashed_password=pwd,
            rol=RolUsuario.TIENDA,
            tienda_id=749,
        )
    )
    db.flush()

    # Tipificaciones
    tips_data = [
        (
            AreaTecnica.SISTEMAS,
            "Conectividad",
            "Sin internet o antena sin senal",
            TipoTicket.INCIDENCIA,
            4,
            UrgenciaTipificacion.CRITICA,
            "sin internet antena red wifi senal",
        ),
        (
            AreaTecnica.SISTEMAS,
            "Punto de Venta",
            "Lector de huella no detecta",
            TipoTicket.INCIDENCIA,
            8,
            UrgenciaTipificacion.ALTA,
            "lector huella no detecta huellero",
        ),
        (
            AreaTecnica.SISTEMAS,
            "Punto de Venta",
            "Precio diferente al folleto",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.MEDIA,
            "precio diferente folleto cobrado",
        ),
        (
            AreaTecnica.SISTEMAS,
            "Punto de Venta",
            "Promocion no pasa en caja",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.MEDIA,
            "promocion no pasa descuento caja",
        ),
        (
            AreaTecnica.SISTEMAS,
            "Admin Caja",
            "Caja electronica bloqueada",
            TipoTicket.INCIDENCIA,
            2,
            UrgenciaTipificacion.CRITICA,
            "caja bloqueada no abre",
        ),
        (
            AreaTecnica.SISTEMAS,
            "Serv. Financ.",
            "QR de pago no funciona",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.ALTA,
            "QR pago no refleja escaner",
        ),
        (
            AreaTecnica.MANTENIMIENTO,
            "Energia Electr.",
            "Sin energia electrica en tienda",
            TipoTicket.INCIDENCIA,
            4,
            UrgenciaTipificacion.CRITICA,
            "sin luz sin energia apagon",
        ),
        (
            AreaTecnica.MANTENIMIENTO,
            "Instalaciones",
            "Fuga o filtracion de agua",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.ALTA,
            "fuga agua gotera techo mojado",
        ),
        (
            AreaTecnica.MANTENIMIENTO,
            "Instalaciones",
            "Danio en area de caja",
            TipoTicket.INCIDENCIA,
            72,
            UrgenciaTipificacion.MEDIA,
            "danio caja mostrador mueble roto",
        ),
        (
            AreaTecnica.MANTENIMIENTO,
            "Energia Electr.",
            "Lamparas fundidas",
            TipoTicket.INCIDENCIA,
            72,
            UrgenciaTipificacion.MEDIA,
            "lamparas fundidas alumbrado focos",
        ),
        (
            AreaTecnica.ABASTO,
            "Ordenes Compra",
            "Proveedor no ha visitado la tienda",
            TipoTicket.INCIDENCIA,
            48,
            UrgenciaTipificacion.BAJA,
            "proveedor sin visita ausente",
        ),
        (
            AreaTecnica.ABASTO,
            "Ordenes Compra",
            "Articulo no aparece en orden de compra",
            TipoTicket.INCIDENCIA,
            48,
            UrgenciaTipificacion.BAJA,
            "articulo faltante orden no aparece",
        ),
        (
            AreaTecnica.ABASTO,
            "Transferencias",
            "Articulos bloqueados a la compra",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.MEDIA,
            "bloqueado compra articulo bloqueo",
        ),
        (
            AreaTecnica.FINANZAS,
            "Admin Caja",
            "Casette de caja anclada lleno",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.ALTA,
            "casette lleno caja anclada deposito",
        ),
        (
            AreaTecnica.FINANZAS,
            "Nomina",
            "Justificacion de retardo",
            TipoTicket.REQUERIMIENTO,
            48,
            UrgenciaTipificacion.MEDIA,
            "retardo justificacion entrada tarde",
        ),
        (
            AreaTecnica.COMERCIAL,
            "Catalogo",
            "Etiqueta de precio incorrecta",
            TipoTicket.INCIDENCIA,
            48,
            UrgenciaTipificacion.MEDIA,
            "etiqueta precio error diferencia",
        ),
        (
            AreaTecnica.COMERCIAL,
            "Catalogo",
            "Precio diferente en producto adoptado",
            TipoTicket.INCIDENCIA,
            24,
            UrgenciaTipificacion.MEDIA,
            "adoptado precio diferente",
        ),
    ]
    tips = []
    for area, cat, prob, tipo, sla, urg, kw in tips_data:
        t = Tipificacion(
            area_tecnica=area,
            categoria=cat,
            problema=prob,
            tipo=tipo,
            sla_horas=sla,
            urgencia=urg,
            palabras_clave=kw,
        )
        db.add(t)
        tips.append((t, area))
    db.flush()

    # Ruteo — area → grupo
    area_grupo = {
        AreaTecnica.SISTEMAS: grupos["Sistemas SION"],
        AreaTecnica.MANTENIMIENTO: grupos["Mantenimiento"],
        AreaTecnica.ABASTO: grupos["Abasto Nacional"],
        AreaTecnica.FINANZAS: grupos["Finanzas"],
        AreaTecnica.COMERCIAL: grupos["Comercial"],
    }
    for tip, area in tips:
        g = area_grupo.get(area)
        if g:
            db.add(ReglaRuteo(tipificacion_id=tip.id, zona_id=None, grupo_id=g.id))

    db.commit()

    print("\nSeed completado:")
    print("  1 region · 1 zona · 1 tienda · 5 grupos")
    print("  4 agentes + 1 admin + 1 tienda = 6 usuarios")
    print(f"  {len(tips_data)} tipificaciones · {len(tips_data)} reglas de ruteo")
    print("\nCredenciales (password: Neto2024!):")
    print("  admin@soyneto.com                  ADMIN")
    print("  t749@soyneto.com                   TIENDA 749")
    print("  christian.gutierrez@soyneto.com    AGENTE Sistemas")
    print("  everardo.mtz@soyneto.com            AGENTE Mantenimiento")
    print("  alejandra.sanchez@soyneto.com       AGENTE Abasto")
    print("  brenda.alvarez@soyneto.com          AGENTE Finanzas")
    db.close()


if __name__ == "__main__":
    reset()
    seed()
