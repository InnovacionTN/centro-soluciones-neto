"""
Seed de la región TOLUCA a partir de 'REGION TOLUCA.xlsx'.

Idempotente: se puede correr varias veces; salta lo que ya existe (por email / centro_costos / nombre de zona).
Hace, en orden:
  1) Asegura la región Toluca (usa la existente id 86 'TOLUCA').
  2) Crea las 8 zonas-coach bajo esa región.
  3) Da de alta a los 8 coaches como COORDINADOR con email firstname.lastname@soyneto.com.
  4) Reasigna las tiendas de cada coach a su zona-coach (por número = centro_costos).
  5) Crea los usuarios de áreas que NO existen (AGENTE), forzando @soyneto.com.
  6) Crea las 3 tiendas faltantes + su usuario TIENDA.

Uso:  python -m scripts.seed_toluca           (aplica)
      python -m scripts.seed_toluca --dry     (solo reporta, no escribe)
"""
import re
import sys
import unicodedata

import openpyxl

from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models.models import Tienda, Usuario, Zona, Grupo, RolUsuario

XLSX = r"E:\Users\1184321\Downloads\REGION TOLUCA.xlsx"
REGION_TOLUCA_ID = 86  # 'TOLUCA' (cat_regiones)
DEFAULT_PASSWORD = "Neto2026!"
DOMAIN = "@soyneto.com"
DRY = "--dry" in sys.argv


def norm(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(s).upper()) if unicodedata.category(c) != "Mn"
    ).strip()


def norm_lower(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn"
    ).strip()


def nombre_to_local(nombre: str) -> str:
    """'Dorisdiana Martinez Barrueta' -> 'dorisdiana.martinez'"""
    skip = {"de", "del", "la", "las", "los", "y", "e"}
    parts = [p for p in nombre.strip().split() if p.lower() not in skip]
    first = norm_lower(parts[0]) if parts else "user"
    last = norm_lower(parts[1]) if len(parts) >= 2 else ""
    local = first + ("." + last if last else "")
    return re.sub(r"[^a-z0-9.]", "", local)


def email_to_soyneto(email: str, nombre: str = "") -> str:
    """Fuerza dominio @soyneto.com. Para gmail/hotmail, genera desde el nombre."""
    email = email.strip().lower()
    if email.endswith("@soyneto.com"):
        return email
    if email.endswith("@tiendasneto.com"):
        local = email.split("@")[0]
        return local + DOMAIN
    # gmail / hotmail / otro: genera desde el nombre
    if nombre:
        return nombre_to_local(nombre) + DOMAIN
    local = email.split("@")[0]
    return re.sub(r"[^a-z0-9.]", "", local) + DOMAIN


def grupo_for(gerencia: str, puesto: str = "") -> str:
    g = norm(gerencia) or norm(puesto)
    if g.startswith("COMERCIAL") or "MARKETING" in g:
        return "Soporte Comercial"
    if "ABASTO" in g:
        return "Sistemas Abasto"
    if "SION" in g:
        return "SION Analistas"
    if "COMUNICAC" in g:
        return "Comunicaciones Soporte"
    if "RH" in g or "RECURSOS HUMANOS" in g:
        return "Recursos Humanos"
    if "MANTENIMIENTO" in g:
        return "Mantenimiento Centro-Oriente"
    if "INVENTARIOS" in g:
        return "Finanzas Inventarios"
    if "SERVICIOS FINANCIEROS" in g or "ASEGURAMIENTO" in g:
        return "Servicios Financieros"
    if "OPERACIONES" in g:
        return "Call Center Operaciones"
    return "Soporte Sistemas"


def main():
    db = SessionLocal()
    grupos = {g.nombre: g.id for g in db.query(Grupo).all()}
    rep = {"zonas": [], "coaches": [], "agentes": [], "tiendas_reasignadas": 0, "tiendas_nuevas": [], "saltados": []}

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["USUARIO ASIGNADO"]

    coaches = []   # (nombre, email_xlsx, zona_nombre, [(num, nombre_tienda)])
    personas = []  # (puesto, nombre, email_xlsx, gerencia)
    for row in ws.iter_rows(min_row=3, values_only=True):
        puesto = str(row[0] or "").strip()
        nombre = str(row[1] or "").strip()
        email_raw = str(row[2] or "").strip().lower()
        zona = str(row[4] or "").strip()
        tiendas_cell = str(row[5] or "")
        gerencia = str(row[6] or "").strip()
        if not email_raw or "@" not in email_raw:
            continue
        if norm(nombre) == norm(puesto):
            continue
        if "COACH" in puesto.upper():
            stores = []
            for line in tiendas_cell.split("\n"):
                m = re.match(r"\s*(\d{2,5})\s+(.+)", line.strip())
                if m:
                    stores.append((m.group(1).strip(), m.group(2).strip()))
            coaches.append((nombre, email_raw, zona, stores))
        else:
            personas.append((puesto, nombre, email_raw, gerencia))

    # Índice de usuarios existentes
    all_users = db.query(Usuario).all()
    existing_emails = {u.email.lower() for u in all_users}
    by_local = {u.email.split("@")[0].lower(): u for u in all_users}

    def ya_existe(email_soyneto: str, email_raw: str = ""):
        if email_soyneto in existing_emails:
            return next((u for u in all_users if u.email.lower() == email_soyneto), True)
        # También chequea local-part del email original (por si ya existe con otro dominio)
        for e in [email_soyneto, email_raw]:
            if not e:
                continue
            hit = by_local.get(e.split("@")[0].lower())
            if hit:
                return hit
        return None

    existing_zonas = {norm(z.nombre): z for z in db.query(Zona).filter(Zona.region_id == REGION_TOLUCA_ID).all()}

    # --- 1-4: zonas-coach + coaches + reasignación de tiendas ---
    for nombre, email_raw, zona_nombre, stores in coaches:
        zname = norm(zona_nombre) or norm("TOLUCA " + nombre)
        zona = existing_zonas.get(zname)
        if not zona:
            zona = Zona(region_id=REGION_TOLUCA_ID, nombre=zona_nombre.title(), activo=True)
            if not DRY:
                db.add(zona); db.flush()
            existing_zonas[zname] = zona
            rep["zonas"].append(zona_nombre)

        email = email_to_soyneto(email_raw, nombre)
        # Resolver colisión de local-part
        if email in existing_emails:
            pts = [p for p in nombre.strip().split() if p.lower() not in {"de", "del", "la"}]
            if len(pts) >= 3:
                email = (norm_lower(pts[0]) + "." + norm_lower(pts[1]) +
                         norm_lower(pts[2][0]) + DOMAIN)
                email = re.sub(r"[^a-z0-9.@]", "", email)

        ex = ya_existe(email, email_raw)
        if ex:
            db_email = ex.email if hasattr(ex, "email") else "?"
            rep["saltados"].append(f"coach {nombre} -> ya existe como {db_email}")
        else:
            u = Usuario(
                email=email, nombre=nombre.title(), hashed_password=hash_password(DEFAULT_PASSWORD),
                rol=RolUsuario.COORDINADOR, zona_id=getattr(zona, "id", None), activo=True, disponible=True,
            )
            if not DRY:
                db.add(u)
            existing_emails.add(email)
            rep["coaches"].append(f"{nombre} -> {email} | {zona_nombre} (COORDINADOR)")

        if not DRY and getattr(zona, "id", None):
            nums = [s[0] for s in stores]
            for t in db.query(Tienda).filter(Tienda.centro_costos.in_(nums)).all():
                if t.zona_id != zona.id:
                    t.zona_id = zona.id
                    rep["tiendas_reasignadas"] += 1

    # --- 5: usuarios de área (AGENTE) ---
    for puesto, nombre, email_raw, gerencia in personas:
        email = email_to_soyneto(email_raw, nombre)
        ex = ya_existe(email, email_raw)
        if ex:
            db_email = ex.email if hasattr(ex, "email") else "?"
            rol = ex.rol.value if hasattr(ex, "rol") else "?"
            rep["saltados"].append(f"{nombre} -> ya existe como {db_email} ({rol})")
            continue
        gname = grupo_for(gerencia, puesto)
        gid = grupos.get(gname)
        u = Usuario(
            email=email, nombre=nombre.title(), hashed_password=hash_password(DEFAULT_PASSWORD),
            rol=RolUsuario.AGENTE, grupo_id=gid, activo=True, disponible=True,
        )
        if not DRY:
            db.add(u)
        existing_emails.add(email)
        rep["agentes"].append(f"{nombre} [{gerencia}] -> {email} | grupo {gname}")

    # --- 6: tiendas faltantes ---
    faltantes = [
        ("1434", "Tianguis Almoloya", "TOLUCA ORIENTE"),
        ("1752", "Obregon Salazar", "TOLUCA SURESTE"),
        ("1771", "Metepec Neri", "TOLUCA SURESTE"),
    ]
    for cc, nom, zona_nombre in faltantes:
        if db.query(Tienda).filter(Tienda.centro_costos == cc).first():
            rep["saltados"].append(f"tienda {cc} (ya existe)")
            continue
        zona = existing_zonas.get(norm(zona_nombre))
        zid = getattr(zona, "id", None)
        correo = f"{cc}{DOMAIN}"
        t = Tienda(nombre=nom, centro_costos=cc, zona_id=zid, correo_corporativo=correo, activo=True)
        if not DRY:
            db.add(t); db.flush()
            if correo not in existing_emails:
                db.add(Usuario(
                    email=correo, nombre=f"Encargado {nom}", hashed_password=hash_password(DEFAULT_PASSWORD),
                    rol=RolUsuario.TIENDA, tienda_id=t.id, activo=True, disponible=True,
                ))
        rep["tiendas_nuevas"].append(f"{cc} {nom} -> {zona_nombre}")

    if not DRY:
        db.commit()
    db.close()

    print("\n==== SEED TOLUCA", "(DRY-RUN)" if DRY else "(APLICADO)", "====")
    print(f"Zonas-coach creadas ({len(rep['zonas'])}):", rep["zonas"])
    print(f"Coaches COORDINADOR ({len(rep['coaches'])}):")
    for c in rep["coaches"]: print("   +", c)
    print(f"Tiendas reasignadas a su zona-coach: {rep['tiendas_reasignadas']}")
    print(f"Agentes de area creados ({len(rep['agentes'])}):")
    for a in rep["agentes"]: print("   +", a)
    print(f"Tiendas nuevas ({len(rep['tiendas_nuevas'])}):", rep["tiendas_nuevas"])
    print(f"Saltados (ya existen): {len(rep['saltados'])}")
    for s in rep["saltados"]: print("   -", s)


if __name__ == "__main__":
    main()
