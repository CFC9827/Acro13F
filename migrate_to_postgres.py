import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from backend.services.database import DatabaseManager

def migrate_data():
    load_dotenv()
    
    # Initialize DB schemas using the app's manager
    print("Initializing Database Schemas...")
    db = DatabaseManager()
    
    sqlite_path = os.path.join(os.path.dirname(__file__), 'backend', 'data', 'tracker.db')
    pg_url = os.environ.get("DATABASE_URL")
    
    if not pg_url:
        print("Error: DATABASE_URL not found in environment.")
        return
        
    print(f"Connecting to SQLite: {sqlite_path}")
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()
    
    print("Connecting to PostgreSQL...")
    pg_conn = psycopg2.connect(pg_url)
    pg_cur = pg_conn.cursor()

    # Define tables. We will dynamically check which columns exist in SQLite.
    tables = [
        "funds", 
        "filings", 
        "prices", 
        "fund_groups", 
        "fund_group_members", 
        "sync_status", 
        "fund_quarterly_stats"
    ]

    for table in tables:
        print(f"\nMigrating table: {table}...")
        
        # Get actual columns in SQLite
        sqlite_cur.execute(f"PRAGMA table_info({table})")
        columns = [row['name'] for row in sqlite_cur.fetchall() if row['name'] != 'id']
        
        if not columns:
            print(f"  Table not found or empty schema, skipping.")
            continue
            
        sqlite_cur.execute(f"SELECT {','.join(columns)} FROM {table}")
        rows = sqlite_cur.fetchall()
        
        if not rows:
            print(f"  Empty table, skipping.")
            continue
            
        print(f"  Found {len(rows)} rows. Inserting into PostgreSQL...")
        
        col_placeholders = ','.join(['%s'] * len(columns))
        insert_query = f"""
            INSERT INTO {table} ({','.join(columns)}) 
            VALUES %s 
            ON CONFLICT DO NOTHING
        """
        
        data_tuples = [tuple(row[col] for col in columns) for row in rows]
        
        try:
            execute_values(pg_cur, insert_query, data_tuples, page_size=1000)
            pg_conn.commit()
            print(f"  Success!")
        except Exception as e:
            pg_conn.rollback()
            print(f"  Error migrating {table}: {e}")

    # Handle the massive 'holdings' table separately in smaller chunks
    print("\nMigrating table: holdings (Chunked)...")
    
    sqlite_cur.execute(f"PRAGMA table_info(holdings)")
    holdings_cols = [row['name'] for row in sqlite_cur.fetchall() if row['name'] != 'id']
    
    sqlite_cur.execute("SELECT COUNT(*) as cnt FROM holdings")
    total_holdings = sqlite_cur.fetchone()['cnt']
    print(f"  Total holdings rows: {total_holdings}")
    
    chunk_size = 50000
    offset = 0
    
    while offset < total_holdings:
        sqlite_cur.execute(f"""
            SELECT {','.join(holdings_cols)} 
            FROM holdings 
            LIMIT {chunk_size} OFFSET {offset}
        """)
        rows = sqlite_cur.fetchall()
        
        if not rows: break
        
        data_tuples = [tuple(row[col] for col in holdings_cols) for row in rows]
        insert_query = f"""
            INSERT INTO holdings ({','.join(holdings_cols)}) 
            VALUES %s
        """
        
        try:
            execute_values(pg_cur, insert_query, data_tuples, page_size=5000)
            pg_conn.commit()
            print(f"  Inserted rows {offset} to {offset + len(rows)}...")
        except Exception as e:
            pg_conn.rollback()
            print(f"  Error migrating holdings chunk: {e}")
            break
            
        offset += chunk_size

    print("\nMigration complete! Closing connections.")
    sqlite_conn.close()
    pg_conn.close()

if __name__ == "__main__":
    migrate_data()
