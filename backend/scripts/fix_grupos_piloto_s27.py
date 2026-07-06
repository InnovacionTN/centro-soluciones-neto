"""
Corrección de grupos de agentes — Piloto Toluca S27
Basado en lista oficial recibida semana 27.

Cambios:
- Soporte Sistemas: queda con 5 (Juan Carlos, Alexander, Guadalupe, Joshua, Omar Reyes)
- Call Center Operaciones: pasa a 8 (Karen, Alejandro Marcial, Erika, Melanie, Diana, Zohara, Stephany, Donovan)
- Soporte Comercial: queda con 8 (sale Diana y Michell)
- Mantenimiento: queda con 1 (Omar Rodriguez)
- Servicios Financieros: queda con 1 (Emmanuel)

Uso:
    python -m scripts.fix_grupos_piloto_s27          # aplica
    python -m scripts.fix_grupos_piloto_s27 --dry    # solo reporta
"""
import sys
from app.db.session import SessionLocal
from app.models.models import Usuario, Grupo

DRY = "--dry" in sys.argv

# Grupos en BD
GRUPOS = {
    "Soporte Sistemas":           1,
    "SION Analistas":             2,
    "SION Desarrollo":            3,
    "Comunicaciones Soporte":     4,
    "Call Center Operaciones":    5,
    "Servicios Financieros":      6,
    "Sistemas Abasto":            7,
    "Finanzas Inventarios":       8,
    "Soporte Comercial":          9,
    "Recursos Humanos":          10,
    "Mantenimiento Sureste":     11,
    "Mantenimiento Veracruz":    12,
    "Mantenimiento Centro-Oriente": 13,
    "Mantenimiento Poniente":    14,
}

# email → nuevo grupo
REASIGNACIONES = {
    # → Call Center Operaciones (vienen de Soporte Sistemas)
    "karen.aboytes@soyneto.com":       "Call Center Operaciones",
    "alejandro.marcial@soyneto.com":   "Call Center Operaciones",
    "erika.contrerasg@soyneto.com":    "Call Center Operaciones",
    "melanie.balvanera@soyneto.com":   "Call Center Operaciones",
    # → Call Center Operaciones (vienen de Comercial / Mantenimiento / SION)
    "diana.villanueva@soyneto.com":    "Call Center Operaciones",
    "zohara.valdes@soyneto.com":       "Call Center Operaciones",
    "stephany.vazquez@soyneto.com":    "Call Center Operaciones",
    "donovan.avila@soyneto.com":       "Call Center Operaciones",
    # → Soporte Sistemas (viene de Comunicaciones Soporte)
    "omar.reyesm@soyneto.com":         "Soporte Sistemas",
}

def main():
    db = SessionLocal()
    cambios = []
    no_encontrados = []

    for email, nuevo_grupo in REASIGNACIONES.items():
        u = db.query(Usuario).filter(Usuario.email == email).first()
        if not u:
            no_encontrados.append(email)
            continue
        gid_actual = u.grupo_id
        gid_nuevo = GRUPOS[nuevo_grupo]
        gname_actual = next((k for k, v in GRUPOS.items() if v == gid_actual), f"id={gid_actual}")
        if gid_actual == gid_nuevo:
            print(f"  = {u.nombre} ya está en {nuevo_grupo}")
            continue
        cambios.append((u.nombre, email, gname_actual, nuevo_grupo))
        if not DRY:
            u.grupo_id = gid_nuevo

    if not DRY and cambios:
        db.commit()
    db.close()

    print(f"\n{'[DRY-RUN] ' if DRY else ''}=== GRUPOS PILOTO S27 ===")
    print(f"\nCambios {'pendientes' if DRY else 'aplicados'} ({len(cambios)}):")
    for nombre, email, de, a in cambios:
        print(f"  {nombre:<40} {de} -> {a}")
    if no_encontrados:
        print(f"\nNo encontrados ({len(no_encontrados)}):")
        for e in no_encontrados:
            print(f"  {e}")

if __name__ == "__main__":
    main()
