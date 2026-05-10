from backend.services.database import DatabaseManager
import os
from dotenv import load_dotenv
load_dotenv()

def reset_user_tables():
    db = DatabaseManager()
    if not db.is_postgres:
        print("Not using PostgreSQL, skipping.")
        return

    print("Dropping and recreating user tables for UUID support...")
    
    # Drop in order to satisfy FKs
    tables = [
        'user_fund_group_members',
        'user_fund_groups',
        'user_tracked_funds',
        'users'
    ]
    
    with db._get_connection() as conn:
        with conn.cursor() as cur:
            for table in tables:
                try:
                    print(f"Dropping table {table}...")
                    cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
                except Exception as e:
                    print(f"Failed to drop {table}: {e}")
            conn.commit()
    
    print("Re-initializing database...")
    db._init_db()
    print("Done.")

if __name__ == "__main__":
    reset_user_tables()
