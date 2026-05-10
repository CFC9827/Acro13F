import os
import sys
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor
from dotenv import load_dotenv

sys.stdout.reconfigure(line_buffering=True)

def migrate_neon_to_supabase():
    neon_url = "postgresql://neondb_owner:npg_CihOJT7daFv0@ep-polished-hill-am78v775.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    supa_url = os.environ.get("DATABASE_URL")
    
    print("Connecting to Neon...")
    neon_conn = psycopg2.connect(neon_url)
    neon_cur = neon_conn.cursor(cursor_factory=RealDictCursor)
    
    print("Connecting to Supabase...")
    supa_conn = psycopg2.connect(supa_url)
    supa_cur = supa_conn.cursor()

    tables = [
        "users",
        "funds", 
        "user_tracked_funds",
        "filings", 
        "user_fund_groups", 
        "user_fund_group_members", 
        "sync_status", 
        "fund_quarterly_stats"
    ]

    for table in tables:
        print(f"\nMigrating table: {table}...")
        
        # Get target columns from Supabase public schema
        supa_cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' AND table_schema = 'public'")
        columns = [row[0] for row in supa_cur.fetchall()]
        
        if not columns:
            print(f"  Table not found or empty schema in Supabase public schema, skipping.")
            continue
            
        neon_cur.execute(f"SELECT {','.join(columns)} FROM {table}")
        rows = neon_cur.fetchall()
        
        if not rows:
            print(f"  Empty table, skipping.")
            continue
            
        print(f"  Found {len(rows)} rows. Inserting into Supabase...")
        
        insert_query = f"""
            INSERT INTO {table} ({','.join(columns)}) 
            VALUES %s 
            ON CONFLICT DO NOTHING
        """
        
        data_tuples = [tuple(row[col] for col in columns) for row in rows]
        
        try:
            execute_values(supa_cur, insert_query, data_tuples, page_size=1000)
            supa_conn.commit()
            print(f"  Success!")
        except Exception as e:
            supa_conn.rollback()
            print(f"  Error migrating {table}: {e}")

    def chunked_migrate(table_name, chunk_size=50000):
        print(f"\nMigrating table: {table_name} (Chunked)...")
        supa_cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}' AND table_schema = 'public'")
        cols = [row[0] for row in supa_cur.fetchall()]
        
        neon_cur.execute(f"SELECT COUNT(*) as cnt FROM {table_name}")
        total = neon_cur.fetchone()['cnt']
        print(f"  Total {table_name} rows: {total}")
        
        offset = 0
        while offset < total:
            neon_cur.execute(f"""
                SELECT {','.join(cols)} 
                FROM {table_name} 
                LIMIT {chunk_size} OFFSET {offset}
            """)
            rows = neon_cur.fetchall()
            if not rows: break
            
            data_tuples = [tuple(row[col] for col in cols) for row in rows]
            insert_query = f"""
                INSERT INTO {table_name} ({','.join(cols)}) 
                VALUES %s
                ON CONFLICT DO NOTHING
            """
            try:
                execute_values(supa_cur, insert_query, data_tuples, page_size=5000)
                supa_conn.commit()
                print(f"  Inserted rows {offset} to {offset + len(rows)}...")
            except Exception as e:
                supa_conn.rollback()
                print(f"  Error migrating {table_name} chunk: {e}")
                break
            offset += chunk_size

    chunked_migrate('holdings', 50000)
    chunked_migrate('prices', 100000)

    print("\nMigration complete! Closing connections.")
    neon_conn.close()
    supa_conn.close()

if __name__ == "__main__":
    migrate_neon_to_supabase()
