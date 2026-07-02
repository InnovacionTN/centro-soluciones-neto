import psycopg2, os

DB = os.environ["DATABASE_URL"]
conn = psycopg2.connect(DB)
cur = conn.cursor()
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
print("Tables:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT id, email, nombre FROM usuarios WHERE rol = 'AGENTE' AND activo = true ORDER BY id LIMIT 5")
for r in cur.fetchall():
    print(r)
conn.close()
