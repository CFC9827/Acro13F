from backend.services.database import DatabaseManager
import json

db = DatabaseManager()
ticker = 'AMZN'
query = """
    WITH LatestFilings AS (
        SELECT cik, MAX(period_of_report) as latest_period
        FROM filings
        GROUP BY cik
    ),
    WhaleHoldings AS (
        SELECT h.ticker, h.value, h.shares, h.put_call, h.accession_number, f.cik
        FROM holdings h
        JOIN filings f ON h.accession_number = f.accession_number
        JOIN LatestFilings lf ON f.cik = lf.cik AND f.period_of_report = lf.latest_period
        WHERE h.ticker = ?
    ),
    FilingTotals AS (
        SELECT f.accession_number, SUM(h.value) as filing_total
        FROM holdings h
        JOIN filings f ON h.accession_number = f.accession_number
        GROUP BY f.accession_number
    )
    SELECT 
        f.name as fund_name, 
        f.cik,
        wh.shares, 
        wh.value, 
        wh.put_call,
        (CAST(wh.value AS FLOAT) * 100.0 / NULLIF(ft.filing_total, 0)) as weight
    FROM WhaleHoldings wh
    JOIN funds f ON wh.cik = f.cik
    JOIN FilingTotals ft ON wh.accession_number = ft.accession_number
    ORDER BY wh.value DESC
"""
res = db._execute(query, (ticker,), fetch='all')
print(f"Results for {ticker}:")
print(json.dumps(res, indent=2))

# If empty, let's see why WhaleHoldings is empty
query_debug = """
    WITH LatestFilings AS (
        SELECT cik, MAX(period_of_report) as latest_period
        FROM filings
        GROUP BY cik
    )
    SELECT h.ticker, f.cik, f.period_of_report, lf.latest_period
    FROM holdings h
    JOIN filings f ON h.accession_number = f.accession_number
    JOIN LatestFilings lf ON f.cik = lf.cik
    WHERE h.ticker = ?
    LIMIT 5
"""
res_debug = db._execute(query_debug, (ticker,), fetch='all')
print("\nDebug WhaleHoldings (h JOIN f JOIN lf on cik):")
print(json.dumps(res_debug, indent=2))
