"""Crea o actualiza usuario de prueba agente.test@csn.com con password conocido."""
import psycopg2, bcrypt

DB = "postgresql://neondb_owner:npg_Cp8JnFfYvr6a@ep-rapid-term-adiwlyy2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
EMAIL = "agente.test@csn.com"
PWD   = "CSNt2026!"

print("Generando hash (puede tardar unos segundos)...")
hashed = bcrypt.hashpw(PWD.encode(), bcrypt.gensalt()).decode()
print("Hash listo, conectando a BD...")

conn = psycopg2.connect(DB)
cur  = conn.cursor()

# Discover columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print("Columnas:", cols)

pwd_col = next((c for c in cols if 'pass' in c.lower() or 'pwd' in c.lower() or 'hash' in c.lower()), None)
print(f"Columna de password: {pwd_col}")

cur.execute("SELECT id FROM usuarios WHERE email = %s", (EMAIL,))
row = cur.fetchone()

if row:
    cur.execute(f"UPDATE usuarios SET {pwd_col}=%s, activo=true WHERE email=%s", (hashed, EMAIL))
    print(f"Actualizado usuario existente ID {row[0]}")
else:
    cur.execute(
        f"INSERT INTO usuarios (email, nombre, rol, activo, {pwd_col}) VALUES (%s, 'Agente Test', 'AGENTE', true, %s) RETURNING id",
        (EMAIL, hashed)
    )
    new_id = cur.fetchone()[0]
    print(f"Creado nuevo usuario AGENTE ID {new_id}")

conn.commit()
conn.close()
print(f"\nCredenciales listas:")
print(f"  Email   : {EMAIL}")
print(f"  Password: {PWD}")
