import sys
from pathlib import Path

# Añadir ruta para importar módulos
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy import text
from app.db.session import engine

def main():
    print("Iniciando migración manual para añadir columnas CSAT...")
    
    queries = [
        "ALTER TABLE tickets ADD COLUMN csat_score INTEGER;",
        "ALTER TABLE tickets ADD COLUMN csat_comentario TEXT;",
        "ALTER TABLE tickets ADD COLUMN csat_fecha TIMESTAMP;"
    ]
    
    for q in queries:
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(text(q))
            print(f"Éxito: {q}")
        except Exception as e:
            print(f"Error o ya existe ({q.split(' ')[4]}): {e}")

    print("Migración completada.")

if __name__ == "__main__":
    main()
