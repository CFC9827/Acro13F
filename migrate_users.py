import sqlite3
import os

db_path = 'backend/data/tracker.db'
if not os.path.exists(db_path):
    print(f"File {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    print("Migrating users table...")
    # 1. Rename old tables
    cur.execute("ALTER TABLE users RENAME TO users_old")
    cur.execute("ALTER TABLE user_tracked_funds RENAME TO user_tracked_funds_old")
    
    # 2. Create new tables with correct schema
    cur.execute("""
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            created_at TEXT
        )
    """)
    
    cur.execute("""
        CREATE TABLE user_tracked_funds (
            user_id TEXT,
            cik TEXT,
            PRIMARY KEY (user_id, cik),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (cik) REFERENCES funds(cik) ON DELETE CASCADE
        )
    """)
    
    # 3. Copy data back (casting to TEXT)
    # We'll skip copying the 'default' user with ID 1 because we want to use the UUID string
    cur.execute("INSERT INTO users (id, email, created_at) SELECT CAST(id AS TEXT), email, created_at FROM users_old WHERE id != 1")
    
    # For user_tracked_funds, we might have rows with user_id=1. Let's map them to the default UUID if they exist
    DEFAULT_UUID = "00000000-0000-0000-0000-000000000000"
    cur.execute("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, datetime('now'))", (DEFAULT_UUID, 'default@abrams13f.local'))
    
    cur.execute(f"INSERT INTO user_tracked_funds (user_id, cik) SELECT CASE WHEN user_id = 1 THEN '{DEFAULT_UUID}' ELSE CAST(user_id AS TEXT) END, cik FROM user_tracked_funds_old")
    
    # 4. Drop old tables
    cur.execute("DROP TABLE users_old")
    cur.execute("DROP TABLE user_tracked_funds_old")
    
    conn.commit()
    print("Migration successful!")
except Exception as e:
    conn.rollback()
    print(f"Migration failed: {e}")
finally:
    conn.close()
