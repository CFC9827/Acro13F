import os
import psycopg2
from psycopg2.extras import RealDictCursor

db_url = "postgresql://postgres.eoamlyhoxhcbksdbykyt:KYxXeE8BD7xllj72@aws-1-us-east-1.pooler.supabase.com:6543/postgres"
user_id = "613a7374-1aab-4aa8-aa0f-da005a8b8cfb"

try:
    conn = psycopg2.connect(db_url)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Check all tracked funds for this user
        query = """
            SELECT utf.cik as tracked_cik, f.cik as fund_cik, f.name
            FROM user_tracked_funds utf
            LEFT JOIN funds f ON utf.cik = f.cik
            WHERE utf.user_id = %s
        """
        cur.execute(query, (user_id,))
        print("Tracked Funds:", cur.fetchall())
        
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
