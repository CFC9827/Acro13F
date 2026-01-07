"""Inspect Pershing Square filings to understand amendment issue."""
import sqlite3

conn = sqlite3.connect('data/tracker.db')
c = conn.cursor()

cik = '0001336528'
print(f"Filings for Pershing Square (CIK {cik}):")
print("-" * 100)
c.execute("""
    SELECT accession_number, period_of_report, filing_date 
    FROM filings WHERE cik = ? 
    ORDER BY period_of_report DESC, filing_date DESC
    LIMIT 15
""", (cik,))
filings = c.fetchall()

for acc, period, filing_date in filings:
    c.execute("SELECT SUM(value), COUNT(*) FROM holdings WHERE accession_number = ?", (acc,))
    row = c.fetchone()
    total = row[0] if row[0] else 0
    count = row[1] if row[1] else 0
    print(f"Period: {period} | Filed: {filing_date} | Holdings: {count:3} | Total: ${total/1000000:.0f}M | Acc: {acc}")

# Now specifically check if there are multiple filings for Q4'24
print("\n" + "=" * 100)
print("Checking for duplicate period entries (Q4'24 = 2024-12-31):")
c.execute("""
    SELECT period_of_report, COUNT(*) as cnt 
    FROM filings WHERE cik = ? 
    GROUP BY period_of_report 
    HAVING cnt > 1
    ORDER BY period_of_report DESC
""", (cik,))
dups = c.fetchall()
if dups:
    print("DUPLICATE PERIODS FOUND:")
    for period, cnt in dups:
        print(f"  {period}: {cnt} filings")
else:
    print("No duplicate periods found.")

conn.close()
