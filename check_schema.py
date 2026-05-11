import sqlite3
import os
db_path = 'backend/data/tracker.db'
if not os.path.exists(db_path):
    print(f"File {db_path} not found")
else:
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name="users"')
        print("Users Table:", cur.fetchone())
        cur.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name="user_tracked_funds"')
        print("Tracked Funds Table:", cur.fetchone())
        
        cur.execute('SELECT * FROM users')
        print("Users:", cur.fetchall())
    except Exception as e:
        print(e)
    finally:
        conn.close()
