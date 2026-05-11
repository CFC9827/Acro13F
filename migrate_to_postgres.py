import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from backend.services.database import DatabaseManager

def migrate_data():
    load_dotenv()
    
    pg_url = os.environ.get("DATABASE_URL")
    if not pg_url:
        print("Error: DATABASE_URL not found in environment.")
        return

    print("Connecting to PostgreSQL to disable read-only mode...")
    try:
        temp_conn = psycopg2.connect(pg_url)
        temp_cur = temp_conn.cursor()
        temp_cur.execute("SET default_transaction_read_only = off;")
        temp_conn.commit()
        temp_conn.close()
        print("Read-only mode disabled.")
    except Exception as e:
        print(f"Warning: Could not disable read-only mode manually: {e}")

    # Initialize DB schemas using the app's manager
    print("Initializing Database Schemas...")
    db = DatabaseManager()
    
    sqlite_path = os.path.join(os.path.dirname(__file__), 'backend', 'data', 'tracker.db')
        
    print(f"Connecting to SQLite: {sqlite_path}")
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()
    
    print("Connecting to PostgreSQL...")
    pg_conn = psycopg2.connect(pg_url)
    pg_cur = pg_conn.cursor()

    # Define tables. Order matters.
    tables = [
        "funds", 
        "filings", 
        "sync_status", 
        "fund_quarterly_stats",
        "users",
        "user_tracked_funds",
        "user_fund_groups",
        "user_fund_group_members"
    ]

    for table in tables:
        print(f"\nMigrating table: {table}...")
        
        try:
            sqlite_cur.execute(f"PRAGMA table_info({table})")
            sqlite_cols = {row['name'] for row in sqlite_cur.fetchall()}
            
            pg_cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'")
            pg_cols = {row[0] for row in pg_cur.fetchall()}
            
            common_cols = sorted(list(sqlite_cols.intersection(pg_cols)))
        except Exception as e:
            print(f"  Error mapping columns for {table}: {e}")
            continue
            
        if not common_cols:
            print(f"  No common columns for {table}, skipping.")
            continue

        print(f"  Common columns: {', '.join(common_cols)}")
        sqlite_cur.execute(f"SELECT {', '.join(common_cols)} FROM {table}")
        rows = sqlite_cur.fetchall()
        
        if not rows:
            print(f"  Empty table, skipping.")
            continue
            
        print(f"  Found {len(rows)} rows. Inserting into PostgreSQL...")
        
        cols_str = ', '.join(common_cols)
        insert_query = f"INSERT INTO {table} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"
        data_tuples = [tuple(row[col] for col in common_cols) for row in rows]
        
        try:
            execute_values(pg_cur, insert_query, data_tuples, page_size=1000)
            pg_conn.commit()
            print(f"  Success!")
        except Exception as e:
            pg_conn.rollback()
            print(f"  Error migrating {table}: {e}")

    # SKIP 'prices' for now to save disk space on Supabase free tier.
    # Cloud worker can fetch them as needed.
    print("\nSkipping 'prices' table migration to conserve Supabase disk space.")

    # Handle 'holdings' in chunks
    print("\nMigrating table: holdings (Chunked)...")
    try:
        sqlite_cur.execute(f"PRAGMA table_info(holdings)")
        sqlite_h_cols = {row['name'] for row in sqlite_cur.fetchall()}
        pg_cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = 'holdings'")
        pg_h_cols = {row[0] for row in pg_cur.fetchall()}
        common_h_cols = sorted(list(sqlite_h_cols.intersection(pg_h_cols)))
    except Exception as e:
        print(f"  Error mapping holdings columns: {e}")
        common_h_cols = []

    if common_h_cols:
        sqlite_cur.execute("SELECT COUNT(*) as cnt FROM holdings")
        total_holdings = sqlite_cur.fetchone()['cnt']
        print(f"  Total holdings rows: {total_holdings}")
        
        chunk_size = 5000
        offset = 0
        while offset < total_holdings:
            sqlite_cur.execute(f"SELECT {', '.join(common_h_cols)} FROM holdings LIMIT {chunk_size} OFFSET {offset}")
            rows = sqlite_cur.fetchall()
            if not rows: break
            data_tuples = [tuple(row[col] for col in common_h_cols) for row in rows]
            insert_query = f"INSERT INTO holdings ({', '.join(common_h_cols)}) VALUES %s ON CONFLICT DO NOTHING"
            try:
                execute_values(pg_cur, insert_query, data_tuples, page_size=1000)
                pg_conn.commit()
                print(f"  Inserted rows {offset} to {offset + len(rows)}...")
            except Exception as e:
                pg_conn.rollback()
                print(f"  Error migrating holdings chunk: {e}")
            offset += chunk_size

    # Verification Step (Emoji fixed for Windows shell)
    print("\n--- Verification ---")
    for table in tables + ["holdings"]:
        try:
            sqlite_cur.execute(f"SELECT COUNT(*) FROM {table}")
            s_count = sqlite_cur.fetchone()[0]
            pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
            p_count = pg_cur.fetchone()[0]
            v_mark = "[V]" if p_count >= s_count else "[X]"
            print(f"{v_mark} {table:<25}: SQLite={s_count:<10} PG={p_count:<10}")
        except:
            print(f"[?] {table:<25}: Error counting rows.")

    print("\nMigration complete! Closing connections.")
    sqlite_conn.close()
    pg_conn.close()

    print("\nMigration complete! Closing connections.")
    sqlite_conn.close()
    pg_conn.close()

if __name__ == "__main__":
    migrate_data()
