import sqlite3
import os
from typing import List, Dict

class DatabaseManager:
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to 'data/tracker.db' relative to the 'backend' root
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.db_path = os.path.join(base_dir, "data", "tracker.db")
        else:
            self.db_path = db_path
        self._init_db()
        self._migrate_ciks()
        self._migrate_put_call()
        self._normalize_put_call_casing()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def normalize_cik(self, cik: str) -> str:
        """Ensure CIK is a 10-digit padded string (SEC standard)."""
        if not cik: return ""
        return str(cik).strip().zfill(10)

    def _migrate_ciks(self):
        """One-time migration to ensure all existing CIKs are 10-digit padded."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Get all funds
            cursor.execute("SELECT cik FROM funds")
            for (old_cik,) in cursor.fetchall():
                new_cik = self.normalize_cik(old_cik)
                if old_cik != new_cik:
                    conn.execute("UPDATE funds SET cik = ? WHERE cik = ?", (new_cik, old_cik))
                    conn.execute("UPDATE filings SET cik = ? WHERE cik = ?", (new_cik, old_cik))
            conn.commit()

    def _migrate_put_call(self):
        """Add put_call column to holdings table if it doesn't exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Check if column exists
            cursor.execute("PRAGMA table_info(holdings)")
            columns = [row[1] for row in cursor.fetchall()]
            if 'put_call' not in columns:
                cursor.execute("ALTER TABLE holdings ADD COLUMN put_call TEXT")
                conn.commit()

    def _normalize_put_call_casing(self):
        """Standardize all existing Put/Call/PUT/CALL entries to uppercase."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Check if column exists first to avoid errors on fresh DBs before _migrate_put_call runs
            cursor.execute("PRAGMA table_info(holdings)")
            columns = [row[1] for row in cursor.fetchall()]
            if 'put_call' in columns:
                cursor.execute("UPDATE holdings SET put_call = UPPER(put_call) WHERE put_call IS NOT NULL")
                conn.commit()

    def _init_db(self):
        # Ensure directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Funds table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS funds (
                    cik TEXT PRIMARY KEY,
                    name TEXT
                )
            """)
            
            # Filings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS filings (
                    accession_number TEXT PRIMARY KEY,
                    cik TEXT,
                    period_of_report TEXT,
                    filing_date TEXT,
                    FOREIGN KEY (cik) REFERENCES funds (cik)
                )
            """)
            
            # Holdings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS holdings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    accession_number TEXT,
                    issuer_name TEXT,
                    cusip TEXT,
                    ticker TEXT,
                    shares INTEGER,
                    value INTEGER,
                    put_call TEXT,
                    FOREIGN KEY (accession_number) REFERENCES filings (accession_number)
                )
            """)
            
            # Prices table for historical data
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS prices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT,
                    date TEXT,
                    price REAL,
                    UNIQUE(ticker, date)
                )
            """)
            conn.commit()

    def save_fund(self, cik: str, name: str):
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.execute("INSERT OR REPLACE INTO funds (cik, name) VALUES (?, ?)", (cik, name))

    def save_filing(self, accession_number: str, cik: str, period: str, date: str):
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO filings (accession_number, cik, period_of_report, filing_date)
                VALUES (?, ?, ?, ?)
            """, (accession_number, cik, period, date))

    def filing_exists(self, accession_number: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM filings WHERE accession_number = ?", (accession_number,))
            return cursor.fetchone() is not None

    def has_filings(self, cik: str) -> bool:
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM filings WHERE cik = ? LIMIT 1", (cik,))
            return cursor.fetchone() is not None

    def save_holdings(self, accession_number: str, holdings: List[Dict]):
        with self._get_connection() as conn:
            # Clear old holdings for this specific filing if re-running
            conn.execute("DELETE FROM holdings WHERE accession_number = ?", (accession_number,))
            
            data = [
                (accession_number, h['issuer_name'], h['cusip'], h.get('ticker'), h['shares'], h['value'], h.get('put_call'))
                for h in holdings
            ]
            conn.executemany("""
                INSERT INTO holdings (accession_number, issuer_name, cusip, ticker, shares, value, put_call)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, data)

    def backfill_tickers(self, mapper_func) -> int:
        """retroactively maps NULL tickers using the provided mapper function."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT cusip FROM holdings WHERE ticker IS NULL OR ticker = ''")
            missing_cusips = cursor.fetchall()
            
            updates = []
            for (cusip,) in missing_cusips:
                if not cusip: continue
                ticker = mapper_func(cusip)
                if ticker:
                    updates.append((ticker, cusip))
            
            if updates:
                cursor.executemany("UPDATE holdings SET ticker = ? WHERE cusip = ? AND (ticker IS NULL OR ticker = '')", updates)
                conn.commit()
            return len(updates)

    def get_funds(self) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM funds")
            return [dict(row) for row in cursor.fetchall()]

    def get_latest_holdings(self, cik: str) -> List[Dict]:
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Get the most recent filing for this CIK
            cursor.execute("""
                SELECT accession_number FROM filings 
                WHERE cik = ? 
                ORDER BY filing_date DESC LIMIT 1
            """, (cik,))
            res = cursor.fetchone()
            if not res:
                return []
            
            acc = res['accession_number']
            cursor.execute("SELECT * FROM holdings WHERE accession_number = ?", (acc,))
            return [dict(row) for row in cursor.fetchall()]

    def delete_fund(self, cik: str):
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # 1. Find all filings for this CIK
            cursor.execute("SELECT accession_number FROM filings WHERE cik = ?", (cik,))
            filings = cursor.fetchall()
            
            # 2. Delete holdings for each filing
            for (accession_number,) in filings:
                cursor.execute("DELETE FROM holdings WHERE accession_number = ?", (accession_number,))
            
            # 3. Delete filings for the fund
            cursor.execute("DELETE FROM filings WHERE cik = ?", (cik,))
            
            # 4. Delete the fund itself
            cursor.execute("DELETE FROM funds WHERE cik = ?", (cik,))
            conn.commit()

    def get_historical_holdings(self, cik: str) -> List[Dict]:
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Get all holdings for this fund, joined with filing metadata for time/period
            # Get all holdings for this fund, joined with filing metadata for time/period
            # Also calculate percentage of portfolio for each holding dynamically
            cursor.execute("""
                SELECT h.*, f.period_of_report, f.filing_date, f.cik,
                       (h.value * 100.0 / total_vals.total_value) as percent_portfolio
                FROM holdings h
                JOIN filings f ON h.accession_number = f.accession_number
                JOIN (
                    SELECT accession_number, SUM(value) as total_value
                    FROM holdings
                    GROUP BY accession_number
                ) total_vals ON h.accession_number = total_vals.accession_number
                WHERE f.cik = ?
                ORDER BY f.period_of_report ASC
            """, (cik,))
            return [dict(row) for row in cursor.fetchall()]

    def get_filing_range(self, cik: str) -> Dict:
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT MIN(period_of_report), MAX(period_of_report), COUNT(*)
                FROM filings 
                WHERE cik = ?
            """, (cik,))
            res = cursor.fetchone()
            if not res or res[0] is None:
                return {"earliest": None, "latest": None, "total": 0}
            return {
                "earliest": res[0],
                "latest": res[1],
                "total": res[2]
            }

    def save_prices(self, ticker: str, price_data: List[Dict]):
        """Saves historical prices. price_data should be list of {'date': 'YYYY-MM-DD', 'price': float}"""
        with self._get_connection() as conn:
            data = [(ticker, p['date'], p['price']) for p in price_data]
            conn.executemany("""
                INSERT OR REPLACE INTO prices (ticker, date, price)
                VALUES (?, ?, ?)
            """, data)

    def get_prices(self, ticker: str, start_date: str = None) -> List[Dict]:
        """Returns historical prices for a ticker."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            query = "SELECT date, price FROM prices WHERE ticker = ?"
            params = [ticker]
            
            if start_date:
                query += " AND date >= ?"
                params.append(start_date)
            
            query += " ORDER BY date ASC"
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

if __name__ == "__main__":
    db = DatabaseManager()
    print("Database initialized at:", db.db_path)
