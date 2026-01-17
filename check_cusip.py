import sqlite3
conn = sqlite3.connect('backend/data/tracker.db')
c = conn.cursor()
c.execute("SELECT issuer_name, ticker FROM holdings WHERE cusip='83200N103' LIMIT 1")
print(c.fetchone())
