"""Check Hertz in the older Q4'24 filing (2025-02-14)."""
import sqlite3

conn = sqlite3.connect('data/tracker.db')
c = conn.cursor()
cik = '0001336528'

print("ALL Q4'24 holdings for Pershing Square:")
print("="*80)
c.execute("""
    SELECT f.filing_date, h.issuer_name, h.value, h.shares
    FROM filings f
    JOIN holdings h ON f.accession_number = h.accession_number
    WHERE f.cik = ? AND f.period_of_report = '2024-12-31'
    ORDER BY f.filing_date ASC, h.value DESC
""", (cik,))

current_date = None
for fd, name, value, shares in c.fetchall():
    if fd != current_date:
        current_date = fd
        print(f"\nFiling: {fd}")
        print("-"*60)
    price = value / shares if shares else 0
    status = "ANOMALY!" if price > 1000 else ""
    print(f"  ${value/1000000:>10,.1f}M | {shares:>12,} shs | ${price:>8.2f}/sh | {name[:30]} {status}")

conn.close()
