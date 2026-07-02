"""
add_admins.py — Agrega usuarios ADMIN al sistema CSN
Uso: python -m scripts.add_admins
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.models import Usuario, RolUsuario
from app.core.security import hash_password as get_password_hash

ADMINS = [
    {"email": "alejandro.sanchezvi@tiendasneto.com", "nombre": "Alejandro Sanchez"},
    {"email": "dvazquezc@soyneto.com",               "nombre": "Daniel Vazquez"},
    {"email": "cristian.argenispu@soyneto.com",      "nombre": "Cristian Argenis"},
]

# Contraseña temporal — solo para tener el campo requerido; el login real es vía Slack
TEMP_PASSWORD = "CsnAdmin2024!"

def main():
    db = SessionLocal()
    try:
        hashed = get_password_hash(TEMP_PASSWORD)
        for adm in ADMINS:
            existing = db.query(Usuario).filter(Usuario.email == adm["email"]).first()
            if existing:
                existing.rol = RolUsuario.ADMIN
                existing.activo = True
                db.commit()
                print(f"  ACTUALIZADO  {adm['email']} -> ADMIN")
            else:
                u = Usuario(
                    email=adm["email"],
                    nombre=adm["nombre"],
                    hashed_password=hashed,
                    rol=RolUsuario.ADMIN,
                    activo=True,
                )
                db.add(u)
                db.commit()
                print(f"  CREADO       {adm['email']} -> ADMIN")
        print("\nListo. Los usuarios pueden iniciar sesión con Slack.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
