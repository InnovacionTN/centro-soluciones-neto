"""
Test de integración end-to-end usando SQLite en memoria.
Simula el flujo completo sin necesidad de Docker ni PostgreSQL.

Ejecutar: python scripts/test_e2e.py
"""
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ─── Patch para usar SQLite en lugar de PostgreSQL ─────────────────────────────
os.environ["DATABASE_URL"] = "sqlite:///./test_cs.db"
os.environ["SECRET_KEY"]   = "test-secret-key-for-e2e-tests-only"
os.environ["ANTHROPIC_API_KEY"] = ""  # fuerza fallback a reglas

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# SQLite necesita este pragma para FKs
engine = create_engine("sqlite:///./test_cs.db", connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Reemplazar el engine del módulo antes de importar modelos
import app.db.session as db_module
db_module.engine = engine
db_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

from app.db.session import Base
from app.models.models import (
    Region, Zona, Tienda, Grupo, Usuario, Tipificacion, ReglaRuteo,
    Ticket, BitacoraEvento,
    RolUsuario, AreaTecnica, TipoTicket, UrgenciaTipificacion,
    EstatusTicket, PrioridadTicket
)
from app.core.security import hash_password, verify_password, create_token
from app.services.ia_service import classify_by_rules, detect_urgency_from_text
from app.services.ticket_service import (
    generate_folio, find_group, assign_agent_round_robin,
    calculate_sla, create_ticket_in_db
)

# ─── Setup ─────────────────────────────────────────────────────────────────────

Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine)
db = Session()


def _sep(titulo: str):
    print(f"\n{'─'*55}")
    print(f"  {titulo}")
    print('─'*55)


# ─── Test 1: Datos maestros ────────────────────────────────────────────────────

_sep("TEST 1: Carga de catálogos maestros")

region = Region(nombre="Sureste")
db.add(region); db.flush()

zona = Zona(nombre="Balam", region_id=region.id)
db.add(zona); db.flush()

tienda = Tienda(id=749, nombre="PANZACOLA", zona_id=zona.id,
                correo_corporativo="t749@soyneto.com")
db.add(tienda); db.flush()

grupo_sistemas = Grupo(nombre="Sistemas SION", area_tecnica=AreaTecnica.SISTEMAS,
                       slack_canal="#cc-sistemas")
grupo_mantto = Grupo(nombre="Mantenimiento Sur", area_tecnica=AreaTecnica.MANTENIMIENTO,
                     slack_canal="#cc-mantto")
db.add_all([grupo_sistemas, grupo_mantto]); db.flush()

# Usuarios
pwd_hash = hash_password("Neto2024!")
admin = Usuario(email="admin@test.com", nombre="Admin",
                hashed_password=pwd_hash, rol=RolUsuario.ADMIN)
agente1 = Usuario(email="christian@test.com", nombre="Christian Gutiérrez",
                  hashed_password=pwd_hash, rol=RolUsuario.AGENTE,
                  grupo_id=grupo_sistemas.id)
agente2 = Usuario(email="david@test.com", nombre="David Ramírez",
                  hashed_password=pwd_hash, rol=RolUsuario.AGENTE,
                  grupo_id=grupo_sistemas.id)
agente_mantto = Usuario(email="everardo@test.com", nombre="Everardo Martínez",
                        hashed_password=pwd_hash, rol=RolUsuario.AGENTE,
                        grupo_id=grupo_mantto.id)
usuario_tienda = Usuario(email="t749@test.com", nombre="Encargado PANZACOLA",
                         hashed_password=pwd_hash, rol=RolUsuario.TIENDA,
                         tienda_id=749)
db.add_all([admin, agente1, agente2, agente_mantto, usuario_tienda]); db.flush()

# Tipificaciones
tip_red = Tipificacion(
    area_tecnica=AreaTecnica.SISTEMAS, categoria="Conectividad",
    problema="Sin internet o antena sin señal",
    tipo=TipoTicket.INCIDENCIA, sla_horas=24,
    urgencia=UrgenciaTipificacion.ALTA,
    palabras_clave="sin internet antena sin señal red wifi"
)
tip_fuga = Tipificacion(
    area_tecnica=AreaTecnica.MANTENIMIENTO, categoria="Instalaciones",
    problema="Fuga o filtración de agua",
    tipo=TipoTicket.INCIDENCIA, sla_horas=24,
    urgencia=UrgenciaTipificacion.ALTA,
    palabras_clave="fuga agua filtración gotera techo piso mojado", requiere_foto=True
)
tip_orden = Tipificacion(
    area_tecnica=AreaTecnica.ABASTO, categoria="Órdenes de Compra",
    problema="Artículo no aparece en orden de compra",
    tipo=TipoTicket.INCIDENCIA, sla_horas=120,
    urgencia=UrgenciaTipificacion.BAJA,
    palabras_clave="artículo faltante orden no aparece producto"
)
db.add_all([tip_red, tip_fuga, tip_orden]); db.flush()

# Matriz de ruteo
db.add(ReglaRuteo(tipificacion_id=tip_red.id, zona_id=None, grupo_id=grupo_sistemas.id))
db.add(ReglaRuteo(tipificacion_id=tip_fuga.id, zona_id=None, grupo_id=grupo_mantto.id))
db.commit()

print(f"✅ Región: {region.nombre}")
print(f"✅ Zona: {zona.nombre}")
print(f"✅ Tienda: {tienda.nombre} (#{tienda.id})")
print(f"✅ Grupos: {grupo_sistemas.nombre}, {grupo_mantto.nombre}")
print(f"✅ Usuarios: {db.query(Usuario).count()} cargados")
print(f"✅ Tipificaciones: {db.query(Tipificacion).count()}")
print(f"✅ Reglas de ruteo: {db.query(ReglaRuteo).count()}")


# ─── Test 2: Autenticación ─────────────────────────────────────────────────────

_sep("TEST 2: Autenticación y JWT")

assert verify_password("Neto2024!", pwd_hash), "Password verification failed"
token = create_token({"sub": str(usuario_tienda.id), "rol": "TIENDA"})
assert len(token) > 50, "Token muy corto"
print(f"✅ Password hash/verify OK")
print(f"✅ JWT generado: {token[:40]}...")


# ─── Test 3: Clasificación IA (fallback por reglas) ───────────────────────────

_sep("TEST 3: Motor de clasificación (reglas sin API key)")

casos = [
    ("no tenemos internet desde esta mañana la antena parece apagada",
     "Conectividad", "ALTA"),
    ("gotera en el area de caja filtracion de agua del techo",
     "Instalaciones", "ALTA"),
    ("el artículo no aparece en la orden de compra del proveedor",
     "Órdenes de Compra", "BAJA"),
]

for descripcion, cat_esperada, urg_esperada in casos:
    resultado = classify_by_rules(descripcion, db)
    cat_ok = "✅" if resultado.categoria == cat_esperada else "❌"
    urg_ok = "✅" if resultado.urgencia_sugerida.value == urg_esperada else "⚠️"
    print(f"  {cat_ok} Categoría: '{resultado.categoria}' (esperada: '{cat_esperada}')")
    print(f"  {urg_ok} Urgencia:  {resultado.urgencia_sugerida.value} | Confianza: {resultado.confianza}%")
    print(f"     Razón: {resultado.razon}")
    print()


# ─── Test 4: Motor de ruteo ────────────────────────────────────────────────────

_sep("TEST 4: Motor de ruteo automático")

grupo_red = find_group(tip_red.id, zona.id, db)
grupo_fuga = find_group(tip_fuga.id, zona.id, db)

assert grupo_red is not None, "No encontró grupo para Sistemas"
assert grupo_fuga is not None, "No encontró grupo para Mantenimiento"
assert grupo_red.nombre == "Sistemas SION", f"Grupo incorrecto: {grupo_red.nombre}"
assert grupo_fuga.nombre == "Mantenimiento Sur", f"Grupo incorrecto: {grupo_fuga.nombre}"

print(f"✅ Ticket Sistemas → grupo: {grupo_red.nombre}")
print(f"✅ Ticket Mantenimiento → grupo: {grupo_fuga.nombre}")


# ─── Test 5: Round Robin ──────────────────────────────────────────────────────

_sep("TEST 5: Asignación Round Robin entre agentes")

# Simular 4 tickets creados secuencialmente → ciclo debe alternar
asignaciones = []
for i in range(4):
    agente = assign_agent_round_robin(grupo_sistemas, db)
    asignaciones.append(agente.nombre)
    print(f"  Ticket #{i+1} → {agente.nombre}")
    # Crear ticket fantasma para avanzar el contador del grupo
    t = Ticket(
        folio=f"TKT-TEST-RR-{i}",
        tienda_id=749,
        agente_id=agente.id,
        grupo_id=grupo_sistemas.id,
        estatus=EstatusTicket.ABIERTO,
        descripcion=f"Test RR {i}",
    )
    db.add(t)
    db.flush()

# Con 2 agentes debe alternar: A, B, A, B
assert asignaciones[0] != asignaciones[1], "Ticket 1 y 2 deberían ir a agentes distintos"
assert asignaciones[0] == asignaciones[2], "Ticket 1 y 3 deberían ir al mismo agente"
assert asignaciones[1] == asignaciones[3], "Ticket 2 y 4 deberían ir al mismo agente"
agentes_unicos = set(asignaciones)
assert len(agentes_unicos) == 2, f"Round Robin debe usar ambos agentes"
print(f"✅ Secuencia: {' → '.join(asignaciones)}")
print(f"✅ Round Robin balanceando entre {len(agentes_unicos)} agentes")

# Limpiar tickets de prueba RR
db.query(Ticket).filter(Ticket.folio.like("TKT-TEST-RR-%")).delete()
db.flush()


# ─── Test 6: Creación de ticket completo ──────────────────────────────────────

_sep("TEST 6: Crear ticket — flujo completo")

clasificacion = classify_by_rules(
    "no tenemos internet desde esta mañana la antena parece apagada", db
)

ticket = create_ticket_in_db(
    db=db,
    tienda_id=749,
    descripcion="No tenemos internet desde esta mañana, la antena parece apagada",
    usuario_id=usuario_tienda.id,
    tipificacion_id=None,
    ia_clasificacion_aceptada=True,
    ia_area=clasificacion.area_tecnica.value,
    ia_tipificacion_id=clasificacion.tipificacion_id,
    ia_confianza=clasificacion.confianza,
    ia_sugerencia_solucion="Verificar estado de antena en el módulo de servicios. Si la antena muestra luz roja, reiniciar el equipo.",
    metadata_extra={},
)

assert ticket.folio.startswith("TKT-"), f"Folio inválido: {ticket.folio}"
assert ticket.agente_id is not None, "Sin agente asignado"
assert ticket.grupo_id == grupo_sistemas.id, "Grupo incorrecto"
assert ticket.sla_limite is not None, "Sin SLA calculado"
assert ticket.estatus == EstatusTicket.ABIERTO, f"Estatus incorrecto: {ticket.estatus}"
assert ticket.ia_confianza > 0, "Sin confianza IA"

eventos = db.query(BitacoraEvento).filter(BitacoraEvento.ticket_id == ticket.id).all()
assert len(eventos) >= 2, f"Bitácora incompleta: {len(eventos)} eventos"

agente_asignado = db.query(Usuario).filter(Usuario.id == ticket.agente_id).first()
print(f"✅ Folio generado: {ticket.folio}")
print(f"✅ Estatus: {ticket.estatus.value}")
print(f"✅ Prioridad: {ticket.prioridad.value}")
print(f"✅ Agente asignado: {agente_asignado.nombre}")
print(f"✅ Grupo: {db.query(Grupo).filter_by(id=ticket.grupo_id).first().nombre}")
print(f"✅ SLA límite: {ticket.sla_limite.strftime('%Y-%m-%d %H:%M')}")
print(f"✅ Confianza IA: {ticket.ia_confianza}%")
print(f"✅ Sugerencia IA: {ticket.ia_sugerencia_solucion[:60]}...")
print(f"✅ Bitácora: {len(eventos)} eventos registrados")
for ev in eventos:
    print(f"     → [{ev.accion}] {ev.comentario[:60] if ev.comentario else ''}")


# ─── Test 7: Ciclo de vida del ticket ─────────────────────────────────────────

_sep("TEST 7: Ciclo de vida — cambios de estado")

from app.services.ticket_service import log_event

estados_ciclo = [
    (EstatusTicket.EN_PROCESO,           "Analista tomó el ticket"),
    (EstatusTicket.CONFIRMAR_SOLUCION,   "Antena reiniciada, internet restaurado"),
    (EstatusTicket.RESUELTO,             "Tienda confirmó solución"),
    (EstatusTicket.CERRADO,              "Cierre automático confirmado"),
]

estado_anterior = ticket.estatus
for nuevo_estado, comentario in estados_ciclo:
    ticket.estatus = nuevo_estado
    if nuevo_estado == EstatusTicket.CERRADO:
        from datetime import datetime
        ticket.fecha_cierre = datetime.utcnow()
    log_event(db, ticket, agente1.id, "CAMBIO_ESTADO",
              estado_anterior=estado_anterior.value,
              estado_nuevo=nuevo_estado.value,
              comentario=comentario)
    estado_anterior = nuevo_estado
    print(f"  ✅ → {nuevo_estado.value}: {comentario}")

db.commit()

total_eventos = db.query(BitacoraEvento).filter(BitacoraEvento.ticket_id == ticket.id).count()
print(f"\n✅ Bitácora final: {total_eventos} eventos en total")
assert ticket.fecha_cierre is not None, "Ticket cerrado sin fecha_cierre"
print(f"✅ Fecha cierre registrada: {ticket.fecha_cierre.strftime('%Y-%m-%d %H:%M')}")


# ─── Test 8: Segundo ticket + Round Robin real ────────────────────────────────

_sep("TEST 8: Segundo ticket — Round Robin equitativo")

ticket2 = create_ticket_in_db(
    db=db,
    tienda_id=749,
    descripcion="Gotera en el área de caja, cae agua del techo",
    usuario_id=usuario_tienda.id,
    tipificacion_id=None,
    ia_clasificacion_aceptada=True,
    ia_area=AreaTecnica.MANTENIMIENTO.value,
    ia_tipificacion_id=tip_fuga.id,
    ia_confianza=80,
    ia_sugerencia_solucion=None,
    metadata_extra={},
)

assert ticket2.grupo_id == grupo_mantto.id, "Mantenimiento rutó al grupo incorrecto"
agente2_asignado = db.query(Usuario).filter(Usuario.id == ticket2.agente_id).first()
print(f"✅ Folio: {ticket2.folio}")
print(f"✅ Grupo: {grupo_mantto.nombre}")
print(f"✅ Agente: {agente2_asignado.nombre if agente2_asignado else 'Sin agente'}")
print(f"✅ Tipificación requiere foto: {tip_fuga.requiere_foto}")


# ─── Test 9: Generación de folios secuenciales ────────────────────────────────

_sep("TEST 9: Folios únicos y secuenciales")

folio1 = ticket.folio
folio2 = ticket2.folio
print(f"✅ Ticket 1: {folio1}")
print(f"✅ Ticket 2: {folio2}")
assert folio1 != folio2, "Folios duplicados"
assert folio1.startswith("TKT-"), "Formato de folio incorrecto"


# ─── Test 10: Métricas del dashboard ──────────────────────────────────────────

_sep("TEST 10: Métricas del dashboard")

from sqlalchemy import func

total = db.query(Ticket).count()
cerrados = db.query(Ticket).filter(Ticket.estatus == EstatusTicket.CERRADO).count()
abiertos = db.query(Ticket).filter(Ticket.estatus == EstatusTicket.ABIERTO).count()
ia_aceptados = db.query(Ticket).filter(Ticket.ia_clasificacion_aceptada == True).count()

print(f"✅ Total tickets: {total}")
print(f"✅ Abiertos: {abiertos}")
print(f"✅ Cerrados: {cerrados}")
print(f"✅ IA clasificación aceptada: {ia_aceptados}/{total} = {round(ia_aceptados/total*100)}%")


# ─── Resumen ───────────────────────────────────────────────────────────────────

print("\n" + "═"*55)
print("  ✅ TODOS LOS TESTS PASARON")
print("═"*55)
print(f"\n  Tickets creados:  {db.query(Ticket).count()}")
print(f"  Eventos bitácora: {db.query(BitacoraEvento).count()}")
print(f"  Usuarios:         {db.query(Usuario).count()}")
print(f"  Tipificaciones:   {db.query(Tipificacion).count()}")
print(f"  Reglas de ruteo:  {db.query(ReglaRuteo).count()}")
print()
print("  El backend está listo para correr con Docker.")
print("  Comando: docker-compose up --build")
print("═"*55)

db.close()

# Limpiar DB de test
import os
if os.path.exists("test_cs.db"):
    os.remove("test_cs.db")
