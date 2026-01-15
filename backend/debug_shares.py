"""Debug script to check share counts in database vs SEC filing."""
from services.database import DatabaseManager
import sys

# Redirect to file
with open('debug_output.txt', 'w') as f:
    db = DatabaseManager()
    conn = db._get_connection()
    cur = conn.cursor()

    # Get all filings for Night Owl Capital (CIK 1410833)
    cur.execute("""
        SELECT accession_number, period_of_report, filing_date 
        FROM filings 
        WHERE cik = %s AND user_id = %s
        ORDER BY period_of_report DESC
        LIMIT 5
    """, ('0001410833', 'public_user'))
    filings = cur.fetchall()
    f.write("Recent filings for Night Owl Capital (CIK 0001410833):\n")
    for fil in filings:
        f.write(f"  Accession: {fil[0]} | Period: {fil[1]} | Filed: {fil[2]}\n")

    # Get the latest accession number (Q3'25)
    latest_acc = filings[0][0] if filings else None
    if latest_acc:
        # Check for duplicate CUSIPs
        cur.execute("""
            SELECT cusip, issuer_name, COUNT(*) as cnt, SUM(shares) as total_shares
            FROM holdings 
            WHERE accession_number = %s
            GROUP BY cusip, issuer_name
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
            LIMIT 20
        """, (latest_acc,))
        
        dups = cur.fetchall()
        if dups:
            f.write(f"\nDuplicate CUSIPs in {latest_acc}:\n")
            f.write("-" * 90 + "\n")
            for d in dups:
                f.write(f"  CUSIP: {d[0]} | {d[1][:30]} | Count: {d[2]} | Total Shares: {d[3]:,}\n")
        else:
            f.write("\nNo duplicate CUSIPs found\n")
        
        # Also show ALPHABET specifically
        cur.execute("""
            SELECT cusip, issuer_name, shares, value, user_id
            FROM holdings 
            WHERE accession_number = %s AND (issuer_name LIKE '%%ALPHABET%%' OR issuer_name LIKE '%%GOOGLE%%')
        """, (latest_acc,))
        
        f.write(f"\nALPHABET entries in {latest_acc}:\n")
        for h in cur.fetchall():
            f.write(f"  CUSIP: {h[0]} | {h[1][:35]} | Shares: {h[2]:,} | Value: ${h[3]:,} | User: {h[4]}\n")
        
        # Count total and unique
        cur.execute('SELECT COUNT(*) FROM holdings WHERE accession_number = %s', (latest_acc,))
        total = cur.fetchone()[0]
        cur.execute('SELECT COUNT(DISTINCT cusip) FROM holdings WHERE accession_number = %s', (latest_acc,))
        unique = cur.fetchone()[0]
        f.write(f"\nTotal entries: {total} | Unique CUSIPs: {unique}\n")

    cur.close()
    conn.close()

print("Output written to debug_output.txt")
