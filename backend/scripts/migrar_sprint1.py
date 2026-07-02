"""
seed_sprint1.py — Carga el catálogo v2 con datos reales de Zendesk
===================================================================
Ejecutar DESPUÉS de migrar_sprint1.py:
  python scripts/seed_sprint1.py

- Carga o actualiza las 7 políticas SLA
- Carga 32 tipificaciones nuevas con 3 niveles (cat/subcat/problema)
- Actualiza sla_policy_id en tipificaciones existentes
- No borra datos existentes
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.models import (
    SlaPolicy,
    Tipificacion,
    ReglaRuteo,
    Grupo,
    AreaTecnica,
    TipoTicket,
    UrgenciaTipificacion,
)

db = SessionLocal()


def get_or_create_policy(nombre: str, horas: int, tipo: str = "habil") -> SlaPolicy:
    p = db.query(SlaPolicy).filter(SlaPolicy.nombre == nombre).first()
    if not p:
        p = SlaPolicy(nombre=nombre, horas_limite=horas, tipo_calendario=tipo)
        db.add(p)
        db.flush()
    return p


def upsert_tipificacion(
    area: AreaTecnica,
    categoria: str,
    subcategoria: str,
    problema: str,
    tipo: TipoTicket,
    sla_policy: SlaPolicy,
    urgencia: UrgenciaTipificacion,
    palabras_clave: str = "",
    requiere_foto: bool = False,
) -> Tipificacion:
    """Crea o actualiza tipificación. Identifica por area+categoria+problema."""
    tip = (
        db.query(Tipificacion)
        .filter(
            Tipificacion.area_tecnica == area,
            Tipificacion.categoria == categoria,
            Tipificacion.problema == problema,
        )
        .first()
    )
    if tip:
        tip.subcategoria = subcategoria
        tip.sla_policy_id = sla_policy.id
        tip.sla_horas = sla_policy.horas_limite
        tip.urgencia = urgencia
        tip.tipo = tipo
    else:
        tip = Tipificacion(
            area_tecnica=area,
            categoria=categoria,
            subcategoria=subcategoria,
            problema=problema,
            tipo=tipo,
            sla_policy_id=sla_policy.id,
            sla_horas=sla_policy.horas_limite,
            urgencia=urgencia,
            palabras_clave=palabras_clave,
            requiere_foto=requiere_foto,
            activo=True,
        )
        db.add(tip)
    db.flush()
    return tip


def run():
    print("🌱 Seed Sprint 1 — Catálogo v2 (datos reales Zendesk)")
    print("=" * 58)

    # ── 1. SLA Policies ──────────────────────────────────────────────────────
    print("\n[1/4] Políticas SLA...")
    sla = {
        "6h": get_or_create_policy("6 horas hábiles", 6),
        "16h": get_or_create_policy("16 horas hábiles", 16),
        "24h": get_or_create_policy("24 horas hábiles", 24),
        "32h": get_or_create_policy("32 horas hábiles", 32),
        "48h": get_or_create_policy("48 horas hábiles", 48),
        "72h": get_or_create_policy("72 horas hábiles", 72),
        "120h": get_or_create_policy("120 horas hábiles", 120),
    }
    db.commit()
    print(f"  ✓ {len(sla)} políticas SLA listas")

    # ── 2. Tipificaciones por área ─────────────────────────────────────────────
    print("\n[2/4] Tipificaciones SISTEMAS (34.5% del volumen)...")
    tips_sistemas = [
        # (categoría, subcategoría, problema, tipo, sla_key, urgencia, palabras_clave, foto)
        (
            "Equipo de cómputo hardware",
            "Terminal bancaria",
            "No funciona / pantalla rota",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "terminal bancaria rota dañada",
            True,
        ),
        (
            "Equipo de cómputo hardware",
            "Terminal bancaria",
            "Sin conectividad / no lee tarjetas",
            TipoTicket.INCIDENCIA,
            "16h",
            UrgenciaTipificacion.ALTA,
            "terminal sin conectividad no lee tarjeta",
            False,
        ),
        (
            "Equipo de cómputo hardware",
            "Terminal PAX A35",
            "Error de conectividad NFC",
            TipoTicket.INCIDENCIA,
            "16h",
            UrgenciaTipificacion.ALTA,
            "pax a35 nfc contactless sin conectividad",
            False,
        ),
        (
            "Equipo de cómputo hardware",
            "Impresora térmica",
            "No imprime / sin papel / atascada",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "impresora térmica no imprime sin papel atascada",
            True,
        ),
        (
            "Equipo de cómputo hardware",
            "CPU",
            "No enciende / pantalla azul / reinicio",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "cpu no enciende pantalla azul bsod reinicio",
            False,
        ),
        (
            "Equipo de cómputo hardware",
            "Monitor",
            "Sin imagen / pantalla negra / roto",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "monitor sin imagen pantalla negra roto dañado",
            True,
        ),
        (
            "Equipo de cómputo hardware",
            "Teclado",
            "Cable roto / teclas dañadas / no funciona",
            TipoTicket.INCIDENCIA,
            "72h",
            UrgenciaTipificacion.BAJA,
            "teclado cable roto tecla dañada no funciona",
            True,
        ),
        (
            "Equipo de cómputo hardware",
            "Lector de huella",
            "No reconoce huellas / no funciona",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "lector huella no reconoce biométrico",
            False,
        ),
        (
            "Equipo de cómputo hardware",
            "Cajón de dinero",
            "No abre / no funciona",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "cajón dinero no abre bloqueado",
            False,
        ),
        (
            "Equipo de cómputo hardware",
            "Scanner",
            "No lee códigos / dañado",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "scanner lector código barras no lee dañado",
            True,
        ),
        (
            "Punto de venta SION",
            "Comunicación / antena",
            "Antena en rojo / sin conexión a internet",
            TipoTicket.INCIDENCIA,
            "6h",
            UrgenciaTipificacion.CRITICA,
            "antena rojo sin internet sin conexión wifi",
            False,
        ),
        (
            "Punto de venta SION",
            "Catálogo de productos",
            "Artículo no aparece / precio incorrecto",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "artículo no aparece precio incorrecto catalogo sion",
            False,
        ),
        (
            "Punto de venta SION",
            "Venta",
            "Venta no registrada / duplicada / cancelada",
            TipoTicket.INCIDENCIA,
            "16h",
            UrgenciaTipificacion.ALTA,
            "venta no registrada duplicada cancelada punto venta",
            False,
        ),
        (
            "Punto de venta SION",
            "Módulos POS",
            "Módulo lento / no carga / se cierra",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "módulo pos lento no carga se cierra sistema",
            False,
        ),
        (
            "Punto de venta SION",
            "Catálogo de productos",
            "Consulta o sincronización de catálogo",
            TipoTicket.REQUERIMIENTO,
            "72h",
            UrgenciaTipificacion.BAJA,
            "consulta catálogo sincronización soporte",
            False,
        ),
        (
            "Actualización pendiente hardware",
            "CPU",
            "Equipo requiere actualización de software",
            TipoTicket.REQUERIMIENTO,
            "72h",
            UrgenciaTipificacion.BAJA,
            "actualización pendiente software firmware cpu",
            False,
        ),
    ]

    for args in tips_sistemas:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.SISTEMAS, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )
    db.commit()
    print(f"  ✓ {len(tips_sistemas)} tipificaciones SISTEMAS")

    print("\n[2b/4] Tipificaciones OPERACIONES (17.4% del volumen)...")
    tips_ops = [
        (
            "Servicios financieros SION",
            "Tarjeta de vales",
            "Tarjeta rechazada / comercio inválido",
            TipoTicket.INCIDENCIA,
            "16h",
            UrgenciaTipificacion.ALTA,
            "tarjeta vales rechazada comercio inválido",
            False,
        ),
        (
            "Servicios financieros SION",
            "Venta",
            "Error en cobro / venta incorrecta",
            TipoTicket.INCIDENCIA,
            "16h",
            UrgenciaTipificacion.ALTA,
            "error cobro venta incorrecta financiero",
            False,
        ),
        (
            "Servicios financieros SION",
            "Devolución",
            "Error en devolución a cliente",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "devolución error cliente financiero",
            False,
        ),
        (
            "Administración caja SION",
            "Reporte de ventas",
            "Reporte de ventas incorrecto / no cuadra",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "reporte ventas incorrecto no cuadra caja",
            False,
        ),
        (
            "Administración caja SION",
            "Procedimientos",
            "Cómo generar reporte en Soluciones Neto",
            TipoTicket.REQUERIMIENTO,
            "72h",
            UrgenciaTipificacion.BAJA,
            "cómo generar reporte soluciones neto procedimiento",
            False,
        ),
        (
            "Portal RH SION",
            "Acceso",
            "Sin acceso / contraseña bloqueada",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.MEDIA,
            "portal rh sin acceso contraseña bloqueada",
            False,
        ),
        (
            "Portal RH soporte",
            "General",
            "Soporte general portal RH",
            TipoTicket.REQUERIMIENTO,
            "72h",
            UrgenciaTipificacion.BAJA,
            "portal recursos humanos soporte general",
            False,
        ),
        (
            "Inventarios SION",
            "Diferencias",
            "Diferencia de inventario en sistema",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "diferencia inventario sistema sion",
            False,
        ),
        (
            "Comercial SION",
            "Catálogo",
            "Artículo no aparece en catálogo comercial",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.MEDIA,
            "artículo catálogo comercial no aparece sion",
            False,
        ),
    ]

    for args in tips_ops:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.OPERACIONES, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )
    db.commit()
    print(f"  ✓ {len(tips_ops)} tipificaciones OPERACIONES")

    print("\n[2c/4] Tipificaciones ABASTO (3% del volumen)...")
    tips_abasto = [
        (
            "Abasto SION",
            "Órdenes de compra",
            "Cancelación por error en captura",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "cancelación orden compra error captura abasto",
            False,
        ),
        (
            "Abasto SION",
            "Órdenes de compra",
            "Artículo no aparece en orden de compra",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "artículo no aparece orden compra oc",
            False,
        ),
        (
            "Abasto SION",
            "Órdenes de compra",
            "Orden de compra en blanco",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.ALTA,
            "orden compra oc en blanco vacía",
            False,
        ),
        (
            "Abasto SION",
            "Transferencias",
            "Error en transferencia entre tiendas",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.ALTA,
            "transferencia entre tiendas error abasto",
            False,
        ),
        (
            "Abasto SION",
            "Proveedor",
            "Proveedor no ha realizado visita programada",
            TipoTicket.INCIDENCIA,
            "72h",
            UrgenciaTipificacion.MEDIA,
            "proveedor no visita programada abasto",
            False,
        ),
    ]

    for args in tips_abasto:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.ABASTO, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )
    db.commit()
    print(f"  ✓ {len(tips_abasto)} tipificaciones ABASTO")

    print("\n[2d/4] Tipificaciones MANTENIMIENTO (35.2% del volumen)...")
    tips_mantto = [
        (
            "Mantenimiento correctivo",
            "Electricidad",
            "Falla eléctrica / sin luz en área de trabajo",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.CRITICA,
            "falla eléctrica sin luz electricidad",
            True,
        ),
        (
            "Mantenimiento correctivo",
            "Refrigeración",
            "Equipo de frío con falla / no enfría",
            TipoTicket.INCIDENCIA,
            "72h",
            UrgenciaTipificacion.ALTA,
            "refrigeración equipo frío falla no enfría",
            True,
        ),
        (
            "Mantenimiento correctivo",
            "Plomería",
            "Fuga de agua / baños sin servicio",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.ALTA,
            "fuga agua baños sin servicio plomería",
            True,
        ),
        (
            "Mantenimiento correctivo",
            "Instalaciones",
            "Daño estructural / goteras / pintura / piso",
            TipoTicket.INCIDENCIA,
            "120h",
            UrgenciaTipificacion.MEDIA,
            "daño estructural goteras pintura piso instalaciones",
            True,
        ),
        (
            "Mantenimiento correctivo",
            "Seguridad",
            "Cámara dañada / alarma sin funcionar",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.ALTA,
            "cámara dañada alarma sin funcionar seguridad",
            True,
        ),
        (
            "Mantenimiento correctivo",
            "Aire acondicionado",
            "AC no enfría / hace ruido / apagado",
            TipoTicket.INCIDENCIA,
            "72h",
            UrgenciaTipificacion.MEDIA,
            "aire acondicionado no enfría ruido apagado",
            True,
        ),
        (
            "Mantenimiento preventivo",
            "Revisión programada",
            "Revisión general de equipos de tienda",
            TipoTicket.REQUERIMIENTO,
            "120h",
            UrgenciaTipificacion.BAJA,
            "revisión programada general equipos mantenimiento",
            False,
        ),
    ]

    for args in tips_mantto:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.MANTENIMIENTO, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )
    db.commit()
    print(f"  ✓ {len(tips_mantto)} tipificaciones MANTENIMIENTO")

    print("\n[2e/4] Tipificaciones FINANZAS y COMERCIAL...")
    tips_fin = [
        (
            "Finanzas SION",
            "Facturación",
            "Error en factura / RFC incorrecto",
            TipoTicket.INCIDENCIA,
            "48h",
            UrgenciaTipificacion.MEDIA,
            "factura error rfc incorrecto facturación",
            False,
        ),
        (
            "Finanzas SION",
            "Nómina",
            "Diferencia en nómina / descuento incorrecto",
            TipoTicket.INCIDENCIA,
            "72h",
            UrgenciaTipificacion.ALTA,
            "nómina diferencia descuento incorrecto finanzas",
            False,
        ),
    ]
    for args in tips_fin:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.FINANZAS, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )

    tips_com = [
        (
            "Comercial SION",
            "Catálogo",
            "Artículo sin existencia / diferencia precio",
            TipoTicket.INCIDENCIA,
            "24h",
            UrgenciaTipificacion.MEDIA,
            "artículo sin existencia diferencia precio comercial",
            False,
        ),
    ]
    for args in tips_com:
        cat, sub, prob, tipo, sla_key, urg, kw, foto = args
        upsert_tipificacion(
            AreaTecnica.COMERCIAL, cat, sub, prob, tipo, sla[sla_key], urg, kw, foto
        )

    db.commit()
    print(f"  ✓ {len(tips_fin) + len(tips_com)} tipificaciones FINANZAS + COMERCIAL")

    # ── 3. Actualizar tipificaciones existentes sin sla_policy_id ─────────────
    print("\n[3/4] Actualizando tipificaciones v1 sin política SLA...")
    policy_72h = sla["72h"]
    sin_policy = (
        db.query(Tipificacion).filter(Tipificacion.sla_policy_id.is_(None)).all()
    )
    for tip in sin_policy:
        # Asignar la política más cercana a las horas que tienen
        horas = tip.sla_horas or 72
        mejor = min(sla.values(), key=lambda p: abs(p.horas_limite - horas))
        tip.sla_policy_id = mejor.id
    db.commit()
    print(f"  ✓ {len(sin_policy)} tipificaciones actualizadas con política SLA")

    # ── 4. Resumen ─────────────────────────────────────────────────────────────
    total_tips = db.query(Tipificacion).count()
    total_sla = db.query(SlaPolicy).count()
    print(f"\n{'=' * 58}")
    print(f"✅ Seed Sprint 1 completado:")
    print(f"   {total_sla} políticas SLA")
    print(f"   {total_tips} tipificaciones totales (3 niveles)")
    print(f"\nSiguiente paso: levantar el backend y correr las pruebas")


if __name__ == "__main__":
    run()
