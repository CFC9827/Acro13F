import os
import sqlite3
from backend.services.database import DatabaseManager

db = DatabaseManager()

def check_amzn_holders():
    ticker = 'AMZN'
    print(f"Checking holders for {ticker}...")
    
    with db._get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Get all holdings for AMZN from latest filings of all funds
        cur.execute("""
            WITH LatestFilings AS (
                SELECT cik, MAX(period_of_report) as latest_period
                FROM filings
                GROUP BY cik
            ),
            LatestAcc AS (
                SELECT f.cik, f.accession_number
                FROM filings f
                JOIN LatestFilings lf ON f.cik = lf.cik AND f.period_of_report = lf.latest_period
            )
            SELECT f.name, f.cik, f.is_tracked, h.shares, h.value,
                   (SELECT COUNT(*) FROM fund_group_members m WHERE m.cik = f.cik) as group_count
            FROM holdings h
            JOIN LatestAcc la ON h.accession_number = la.accession_number
            JOIN funds f ON la.cik = f.cik
            WHERE h.ticker = ?
            ORDER BY h.value DESC
        """, (ticker,))
        
        rows = cur.fetchall()
        print(f"Total holders in DB for {ticker}: {len(rows)}")
        print(f"{'Fund Name':<40} | {'CIK':<10} | {'Tracked':<7} | {'Groups':<7} | {'Shares':<12} | {'Value':<12}")
        print("-" * 100)
        for r in rows:
            print(f"{r['name'][:40]:<40} | {r['cik']:<10} | {r['is_tracked']:<7} | {r['group_count']:<7} | {r['shares']:<12,} | {r['value']:<12,}")

if __name__ == "__main__":
    check_amzn_holders()
