from backend.services.database import DatabaseManager
import os
from dotenv import load_dotenv
load_dotenv()

def run_migration():
    db = DatabaseManager()
    if not db.is_postgres:
        print("Not using PostgreSQL, skipping migration script.")
        return

    print("Running PostgreSQL migrations for UUID user_id support...")
    
    tables_to_migrate = [
        ('user_tracked_funds', 'user_id'),
        ('user_fund_groups', 'user_id'),
        ('user_fund_group_members', 'user_id')
    ]
    
    for table, column in tables_to_migrate:
        try:
            print(f"Altering {table}.{column} to TEXT...")
            # We use USING to convert if necessary, though it might be empty
            db._execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT USING {column}::TEXT")
            print(f"Successfully migrated {table}")
        except Exception as e:
            print(f"Failed to migrate {table}: {e}")

    # Also need to handle users table if it exists as integer (unlikely but possible)
    try:
        print("Altering users.id to TEXT...")
        db._execute("ALTER TABLE users ALTER COLUMN id TYPE TEXT USING id::TEXT")
        print("Successfully migrated users")
    except Exception as e:
        print(f"Failed to migrate users: {e}")

if __name__ == "__main__":
    run_migration()
