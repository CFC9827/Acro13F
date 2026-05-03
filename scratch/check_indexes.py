import sqlite3
import os

db_path = r'backend\data\tracker.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='holdings'")
indexes = cur.fetchall()
for name, sql in indexes:
    print(f"Index: {name}\nSQL: {sql}\n")
conn.close()
