import os
import psycopg2
from psycopg2.extras import RealDictCursor

db_url = "postgresql://postgres.eoamlyhoxhcbksdbykyt:KYxXeE8BD7xllj72@aws-1-us-east-1.pooler.supabase.com:6543/postgres"
user_id = "613a7374-1aab-4aa8-aa0f-da005a8b8cfb"
cik = "0001647251"

try:
    conn = psycopg2.connect(db_url)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Run the subquery logic directly
        query = """
            SELECT f.name, f.cik,
                   EXISTS (SELECT 1 FROM user_tracked_funds utf WHERE utf.cik = f.cik AND utf.user_id = %s) as is_tracked
            FROM funds f
            WHERE f.cik = %s
        """
        cur.execute(query, (user_id, cik))
        print("Result:", cur.fetchone())
        
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
