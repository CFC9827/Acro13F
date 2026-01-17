import sqlite3

conn = sqlite3.connect('backend/data/tracker.db')
cursor = conn.cursor()
# Search for the numeric label from the user's screenshot
# 112585104
cursor.execute('SELECT issuer_name, cusip, ticker FROM holdings WHERE ticker="112585104" OR cusip LIKE "%112585104%" OR issuer_name LIKE "%TRUPANION%" LIMIT 1')
row = cursor.fetchone()
print(f"Database Result: {row}")

# Check for UBER as well
cursor.execute('SELECT issuer_name, cusip, ticker FROM holdings WHERE ticker="UBER" OR cusip LIKE "%90353T100%" LIMIT 1')
row = cursor.fetchone()
print(f"UBER Result: {row}")

conn.close()
