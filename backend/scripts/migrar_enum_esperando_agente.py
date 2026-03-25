from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(
        text("ALTER TYPE estatusticket ADD VALUE IF NOT EXISTS 'ESPERANDO_AGENTE'")
    )
    conn.commit()
    print("OK — ESPERANDO_AGENTE agregado al enum estatusticket")
