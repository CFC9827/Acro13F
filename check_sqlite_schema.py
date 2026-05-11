import sqlite3
import os

db_path = 'backend/data/tracker.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

tables = ['user_fund_groups', 'user_fund_group_members', 'users', 'user_tracked_funds']

for table in tables:
    print(f"\nSchema for {table}:")
    cur.execute(f"PRAGMA table_info({table})")
    for row in cur.fetchall():
        print(row)

conn.close()
