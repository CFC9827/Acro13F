import psycopg2
import os
from dotenv import load_dotenv
load_dotenv()

conn = psycopg2.connect(dsn=os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
tables = cur.fetchall()
print("Existing tables:", [t[0] for t in tables])

# Check for data
for t in tables:
    name = t[0]
    cur.execute(f"SELECT COUNT(*) FROM {name}")
    count = cur.fetchone()[0]
    if count > 0:
        print(f"  {name}: {count} rows")

conn.close()
