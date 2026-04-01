import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.models import Usuario
from app.core.security import verify_password

def run():
    db = SessionLocal()
    users = db.query(Usuario).all()
    print(f"Total users: {len(users)}")
    for u in users:
        print(f"- {u.email} (Activo: {u.activo}) (Rol: {u.rol})")
        if u.email == "admin@soyneto.com":
            is_valid = verify_password("Neto2024!", u.hashed_password)
            print(f"   Password 'Neto2024!' isValid: {is_valid}")
            
    db.close()

if __name__ == "__main__":
    run()
