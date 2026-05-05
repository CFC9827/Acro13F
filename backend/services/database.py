import sqlite3
import os
import logging
from contextlib import contextmanager
from datetime import datetime
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, db_path: str = None):
        self.db_url = os.environ.get("DATABASE_URL")
        self._pool = None
        if not self.db_url:
            if db_path is None:
                # Default to 'data/tracker.db' relative to the 'backend' root
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                self.db_path = os.path.join(base_dir, "data", "tracker.db")
            else:
                self.db_path = db_path
            self.is_postgres = False
        else:
            self.is_postgres = True
            self._pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2, maxconn=10, dsn=self.db_url
            )
            logger.info("PostgreSQL connection pool initialized (2-10 connections)")
            
        self._init_db()
        self._migrate()

    @contextmanager
    def _get_connection(self):
        """Context manager that yields a connection. For PG, uses the pool."""
        if self.is_postgres:
            conn = self._pool.getconn()
            try:
                yield conn
            finally:
                self._pool.putconn(conn)
        else:
            conn = sqlite3.connect(self.db_path)
            try:
                yield conn
            finally:
                conn.close()

    def _execute(self, query: str, params: tuple = (), fetch: str = None) -> Any:
        """Helper to execute queries and handle connection/cursor cleanup."""
        with self._get_connection() as conn:
            if self.is_postgres:
                # Use RealDictCursor for PostgreSQL to match sqlite3.Row behavior
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query.replace('?', '%s'), params)
                    if fetch == 'one':
                        return cur.fetchone()
                    if fetch == 'all':
                        return cur.fetchall()
                    conn.commit()
            else:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(query, params)
                if fetch == 'one':
                    res = cur.fetchone()
                    return dict(res) if res else None
                if fetch == 'all':
                    return [dict(row) for row in cur.fetchall()]
                conn.commit()

    def normalize_cik(self, cik: str) -> str:
        """Ensure CIK is a 10-digit padded string (SEC standard)."""
        if not cik: return ""
        return str(cik).strip().zfill(10)

    def _init_db(self):
        if not self.is_postgres:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        # Table definitions with cross-platform compatibility
        # Note: id SERIAL for PG, id INTEGER PRIMARY KEY AUTOINCREMENT for SQLite
        
        id_type = "SERIAL PRIMARY KEY" if self.is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
        
        queries = [
            """
            CREATE TABLE IF NOT EXISTS funds (
                cik TEXT PRIMARY KEY,
                name TEXT,
                sort_order INTEGER DEFAULT 0,
                is_tracked INTEGER DEFAULT 0
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS filings (
                accession_number TEXT PRIMARY KEY,
                cik TEXT,
                period_of_report TEXT,
                filing_date TEXT,
                FOREIGN KEY (cik) REFERENCES funds (cik)
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS holdings (
                id {id_type},
                accession_number TEXT,
                issuer_name TEXT,
                cusip TEXT,
                ticker TEXT,
                shares BIGINT,
                value BIGINT,
                put_call TEXT,
                sector TEXT,
                FOREIGN KEY (accession_number) REFERENCES filings (accession_number)
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS prices (
                id {id_type},
                ticker TEXT,
                date TEXT,
                price REAL,
                dividends REAL DEFAULT 0,
                UNIQUE(ticker, date)
            )
            """,
            f"""
            CREATE TABLE IF NOT EXISTS fund_groups (
                id {id_type},
                name TEXT UNIQUE,
                sort_order INTEGER DEFAULT 0
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS fund_group_members (
                group_id INTEGER,
                cik TEXT,
                PRIMARY KEY (group_id, cik),
                FOREIGN KEY (group_id) REFERENCES fund_groups (id) ON DELETE CASCADE,
                FOREIGN KEY (cik) REFERENCES funds (cik) ON DELETE CASCADE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sync_status (
                cik TEXT PRIMARY KEY,
                status TEXT, -- 'pending', 'processing', 'completed', 'failed'
                last_sync TEXT,
                error_message TEXT,
                newly_added_count INTEGER DEFAULT 0
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS ticker_metadata (
                ticker TEXT PRIMARY KEY,
                status TEXT,
                last_updated TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS fund_quarterly_stats (
                cik TEXT,
                period_of_report TEXT,
                accession_number TEXT,
                total_aum BIGINT,
                position_count INTEGER,
                top_10_concentration REAL,
                avg_position_size REAL,
                primary_sector TEXT,
                primary_sector_weight REAL,
                mega_cap_pct REAL,
                mid_cap_pct REAL,
                small_cap_pct REAL,
                portfolio_turnover REAL,
                avg_holding_period REAL,
                herding_score REAL,
                PRIMARY KEY (cik, period_of_report)
            );
            """
        ]

        # Performance Indexes
        index_queries = [
            "CREATE INDEX IF NOT EXISTS idx_filings_cik ON filings(cik)",
            "CREATE INDEX IF NOT EXISTS idx_holdings_accession ON holdings(accession_number)",
            "CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker)",
            "CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date)",
            "CREATE INDEX IF NOT EXISTS idx_stats_cik ON fund_quarterly_stats(cik)"
        ]
        
        with self._get_connection() as conn:
            if self.is_postgres:
                with conn.cursor() as cur:
                    for q in queries:
                        cur.execute(q)
                    for idx_q in index_queries:
                        cur.execute(idx_q)
                conn.commit()
            else:
                for q in queries:
                    conn.execute(q)
                for idx_q in index_queries:
                    conn.execute(idx_q)
                conn.commit()

    def _migrate(self):
        """Handle migrations and data normalization."""
        # 0. Add is_tracked column if missing
        if self.is_postgres:
            # PostgreSQL: check information_schema before ALTER
            col_exists = self._execute("""
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'funds' AND column_name = 'is_tracked'
            """, fetch='one')
            if not col_exists:
                self._execute("ALTER TABLE funds ADD COLUMN is_tracked INTEGER DEFAULT 0")
            
            # Check for dividends column in prices
            price_col_exists = self._execute("""
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'prices' AND column_name = 'dividends'
            """, fetch='one')
            if not price_col_exists:
                self._execute("ALTER TABLE prices ADD COLUMN dividends REAL DEFAULT 0")
        else:
            try:
                self._execute("ALTER TABLE funds ADD COLUMN is_tracked INTEGER DEFAULT 0")
            except Exception:
                pass
                
            try:
                self._execute("ALTER TABLE prices ADD COLUMN dividends REAL DEFAULT 0")
            except Exception:
                # Column likely already exists
                pass

        # 1. Normalize CIKs
        funds = self._execute("SELECT cik FROM funds", fetch='all')
        if funds:
            for row in funds:
                old_cik = row['cik']
                new_cik = self.normalize_cik(old_cik)
                if old_cik != new_cik:
                    self._execute("UPDATE funds SET cik = ? WHERE cik = ?", (new_cik, old_cik))
                    self._execute("UPDATE filings SET cik = ? WHERE cik = ?", (new_cik, old_cik))

        # 2. Normalize Put/Call
        self._execute("UPDATE holdings SET put_call = UPPER(put_call) WHERE put_call IS NOT NULL")

    def save_fund(self, cik: str, name: str, is_tracked: int = 0):
        cik = self.normalize_cik(cik)
        if self.is_postgres:
            self._execute("""
                INSERT INTO funds (cik, name, is_tracked) VALUES (?, ?, ?)
                ON CONFLICT (cik) DO UPDATE SET 
                    name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE funds.name END,
                    is_tracked = EXCLUDED.is_tracked
            """, (cik, name, is_tracked))
        else:
            # SQLite doesn't have a simple way to conditionally update without overwriting
            exists = self._execute("SELECT name, is_tracked FROM funds WHERE cik = ?", (cik,), fetch='one')
            if exists:
                final_name = name if name != "" else exists['name']
                self._execute("UPDATE funds SET name = ?, is_tracked = ? WHERE cik = ?", (final_name, is_tracked, cik))
            else:
                self._execute("INSERT INTO funds (cik, name, is_tracked) VALUES (?, ?, ?)", (cik, name, is_tracked))

    def save_filing(self, accession_number: str, cik: str, period: str, date: str):
        cik = self.normalize_cik(cik)
        if self.is_postgres:
            self._execute("""
                INSERT INTO filings (accession_number, cik, period_of_report, filing_date)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (accession_number) DO UPDATE SET 
                    cik = EXCLUDED.cik, 
                    period_of_report = EXCLUDED.period_of_report, 
                    filing_date = EXCLUDED.filing_date
            """, (accession_number, cik, period, date))
        else:
            self._execute("""
                INSERT OR REPLACE INTO filings (accession_number, cik, period_of_report, filing_date)
                VALUES (?, ?, ?, ?)
            """, (accession_number, cik, period, date))

    def filing_exists(self, accession_number: str) -> bool:
        res = self._execute("SELECT 1 FROM filings WHERE accession_number = ?", (accession_number,), fetch='one')
        return res is not None

    def has_filings(self, cik: str) -> bool:
        cik = self.normalize_cik(cik)
        res = self._execute("SELECT 1 FROM filings WHERE cik = ? LIMIT 1", (cik,), fetch='one')
        return res is not None

    def save_holdings(self, accession_number: str, holdings: List[Dict]):
        # Clear old holdings for this specific filing if re-running
        self._execute("DELETE FROM holdings WHERE accession_number = ?", (accession_number,))
        
        with self._get_connection() as conn:
            cur = conn.cursor()
            query = """
                INSERT INTO holdings (accession_number, issuer_name, cusip, ticker, shares, value, put_call)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """ if self.is_postgres else """
                INSERT INTO holdings (accession_number, issuer_name, cusip, ticker, shares, value, put_call)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            
            data = [
                (accession_number, h['issuer_name'], h['cusip'], h.get('ticker'), h['shares'], h['value'], h.get('put_call'))
                for h in holdings
            ]
            cur.executemany(query, data)
            conn.commit()

    def backfill_tickers(self, mapper_func) -> int:
        missing_cusips = self._execute("SELECT DISTINCT cusip FROM holdings WHERE ticker IS NULL OR ticker = ''", fetch='all')
        if not missing_cusips: return 0
        
        count = 0
        for row in missing_cusips:
            cusip = row['cusip']
            if not cusip: continue
            ticker = mapper_func(cusip)
            if ticker:
                self._execute("UPDATE holdings SET ticker = ? WHERE cusip = ? AND (ticker IS NULL OR ticker = '')", (ticker, cusip))
                count += 1
        return count

    def get_funds(self, tracked_only: bool = True) -> List[Dict]:
        query = "SELECT * FROM funds"
        if tracked_only:
            query += " WHERE is_tracked = 1 OR cik IN (SELECT cik FROM fund_group_members)"
        query += " ORDER BY sort_order, name"
        return self._execute(query, fetch='all')

    def reorder_funds(self, orders: Dict[str, int]):
        for cik, order in orders.items():
            self._execute("UPDATE funds SET sort_order = ? WHERE cik = ?", (order, cik))

    def get_latest_holdings(self, cik: str) -> List[Dict]:
        cik = self.normalize_cik(cik)
        res = self._execute("""
            SELECT accession_number FROM filings 
            WHERE cik = ? 
            ORDER BY filing_date DESC LIMIT 1
        """, (cik,), fetch='one')
        if not res: return []
        
        acc = res['accession_number']
        return self._execute("SELECT * FROM holdings WHERE accession_number = ?", (acc,), fetch='all')

    def delete_fund(self, cik: str):
        cik = self.normalize_cik(cik)
        filings = self._execute("SELECT accession_number FROM filings WHERE cik = ?", (cik,), fetch='all')
        if filings:
            for row in filings:
                self._execute("DELETE FROM holdings WHERE accession_number = ?", (row['accession_number'],))
        
        self._execute("DELETE FROM filings WHERE cik = ?", (cik,))
        self._execute("DELETE FROM funds WHERE cik = ?", (cik,))

    def get_historical_holdings(self, cik: str) -> List[Dict]:
        cik = self.normalize_cik(cik)
        # 1. Get all holdings with filing metadata
        all_holdings = self._execute("""
            SELECT h.*, f.period_of_report, f.filing_date, f.cik, f.accession_number as filing_accession
            FROM holdings h
            JOIN filings f ON h.accession_number = f.accession_number
            WHERE f.cik = ?
            ORDER BY f.period_of_report ASC, f.filing_date ASC
        """, (cik,), fetch='all')
        
        if not all_holdings: return []

        # 2. Get filing counts per period to detect amendments
        period_stats = self._execute("""
            SELECT f.period_of_report, f.accession_number, f.filing_date, COUNT(h.id) as holding_count
            FROM filings f
            LEFT JOIN holdings h ON f.accession_number = h.accession_number
            WHERE f.cik = ?
            GROUP BY f.period_of_report, f.accession_number, f.filing_date
            ORDER BY f.period_of_report ASC, f.filing_date ASC
        """, (cik,), fetch='all')

        period_filings = {}
        for row in period_stats:
            p = row['period_of_report']
            if p not in period_filings: period_filings[p] = []
            period_filings[p].append(row)

        period_active_filings = {}
        amended_periods = set()
        period_all_filings = {}

        for period, filings in period_filings.items():
            sorted_f = sorted(filings, key=lambda x: x['filing_date'], reverse=True)
            period_all_filings[period] = [
                {'accession_number': f['accession_number'], 'is_amendment': i == 0 and len(sorted_f) > 1}
                for i, f in enumerate(sorted_f)
            ]

            if len(filings) == 1:
                period_active_filings[period] = {filings[0]['accession_number']}
            else:
                amended_periods.add(period)
                orig, latest = filings[0], filings[-1]
                if latest['holding_count'] >= orig['holding_count'] * 0.5:
                    period_active_filings[period] = {latest['accession_number']}
                else:
                    period_active_filings[period] = {f['accession_number'] for f in filings}

        # Step 1: Aggregate and filter
        filing_aggregated = {}
        for h in all_holdings:
            if h['accession_number'] not in period_active_filings.get(h['period_of_report'], set()):
                continue
            key = (h['accession_number'], h['cusip'], h.get('put_call'))
            if key not in filing_aggregated:
                filing_aggregated[key] = h.copy()
            else:
                filing_aggregated[key]['shares'] += h['shares']
                filing_aggregated[key]['value'] += h['value']

        # Step 2: Merge periods
        merged = {}
        # Need to ensure stable sort for overwrite logic
        sorted_agg = sorted(filing_aggregated.values(), key=lambda x: (x['period_of_report'], x['filing_date']))
        for h in sorted_agg:
            period = h['period_of_report']
            key = (period, h['cusip'], h.get('put_call'))
            merged[key] = h
            merged[key]['has_amendment'] = period in amended_periods
            merged[key]['period_filings'] = period_all_filings.get(period, [])

        result = list(merged.values())
        result.sort(key=lambda x: x['period_of_report'])
        
        # Recalculate %
        period_totals = {}
        for h in result:
            p = h['period_of_report']
            period_totals[p] = period_totals.get(p, 0) + h['value']
        for h in result:
            total = period_totals.get(h['period_of_report'], 1)
            h['percent_portfolio'] = (h['value'] * 100.0 / total) if total > 0 else 0
        
        return result

    def get_filing_range(self, cik: str) -> Dict:
        cik = self.normalize_cik(cik)
        res = self._execute("""
            SELECT MIN(period_of_report) as earliest, MAX(period_of_report) as latest, COUNT(*) as total
            FROM filings WHERE cik = ?
        """, (cik,), fetch='one')
        if not res or res['earliest'] is None:
            return {"earliest": None, "latest": None, "total": 0}
        return res

    def save_prices(self, ticker: str, price_data: List[Dict]):
        with self._get_connection() as conn:
            cur = conn.cursor()
            query = """
                INSERT INTO prices (ticker, date, price, dividends) VALUES (%s, %s, %s, %s)
                ON CONFLICT (ticker, date) DO UPDATE SET 
                    price = EXCLUDED.price,
                    dividends = EXCLUDED.dividends
            """ if self.is_postgres else """
                INSERT OR REPLACE INTO prices (ticker, date, price, dividends) VALUES (?, ?, ?, ?)
            """
            data = [(ticker, p['date'], p['price'], p.get('dividends', 0)) for p in price_data]
            cur.executemany(query, data)
            conn.commit()

    def create_group(self, name: str) -> int:
        min_order_res = self._execute("SELECT MIN(sort_order) as min_order FROM fund_groups", fetch='one')
        min_order = min_order_res['min_order'] if min_order_res else None
        new_order = (min_order - 1) if min_order is not None else 0
        
        if self.is_postgres:
            res = self._execute("INSERT INTO fund_groups (name, sort_order) VALUES (?, ?) RETURNING id", (name, new_order), fetch='one')
            return res['id']
        else:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute("INSERT INTO fund_groups (name, sort_order) VALUES (?, ?)", (name, new_order))
                conn.commit()
                return cur.lastrowid

    def get_groups(self):
        groups = self._execute("SELECT * FROM fund_groups ORDER BY sort_order ASC, id ASC", fetch='all')
        if not groups: return []
        for g in groups:
            members = self._execute("SELECT cik FROM fund_group_members WHERE group_id = ?", (g['id'],), fetch='all')
            g['member_ciks'] = [m['cik'] for m in members]
        return groups

    def get_dashboard_summary(self, group_id: int = None) -> Dict:
        # Re-implement using self._execute for all sub-queries
        # To save space and time, I will keep the logic same but wrapped in _execute
        
        def aggregate_holdings(holdings: List[Dict]) -> List[Dict]:
            aggregated = {}
            for h in holdings:
                key = (h.get('cusip'), h.get('put_call'))
                if key not in aggregated:
                    aggregated[key] = h.copy()
                else:
                    aggregated[key]['shares'] += h['shares']
                    aggregated[key]['value'] += h['value']
            return list(aggregated.values())

        if group_id:
            all_funds = self._execute("""
                SELECT f.* FROM funds f
                JOIN fund_group_members m ON f.cik = m.cik
                WHERE m.group_id = ?
            """, (group_id,), fetch='all')
        else:
            all_funds = self.get_funds()

        summary = {
            "fund_highlights": [], "big_movers": [], "portfolio_shifts": [],
            "latest_period": None, "prior_period": None, "fund_periods": [], "periods_aligned": True,
            "kpis": {"fund_count": len(all_funds), "total_aum": 0, "prior_aum": 0, "new_positions": 0, "exited_positions": 0},
            "crowding_signals": {"most_held": [], "gaining_funds": [], "losing_funds": []},
            "new_positions": [], "ticker_fund_activity": {}
        }

        all_latest_periods = set()
        current_ticker_funds = {} # {ticker: {funds: set((name, cik)), ticker: str, issuer: str, total_value: float}}
        prior_ticker_funds = {}   # {ticker: set(cik)}
        all_new_positions = []
        all_exited_positions = []

        for fund in all_funds:
            cik = fund['cik']
            # Window function works in both SQLite 3.25+ and Postgres
            filings = self._execute("""
                SELECT accession_number, period_of_report, filing_date
                FROM (
                    SELECT accession_number, period_of_report, filing_date,
                           ROW_NUMBER() OVER (PARTITION BY period_of_report ORDER BY filing_date DESC) as rn
                    FROM filings WHERE cik = ?
                ) t
                WHERE rn = 1
                ORDER BY period_of_report DESC
                LIMIT 2
            """, (cik,), fetch='all')
            
            if not filings: continue

            latest_acc = filings[0]['accession_number']
            latest_period = filings[0]['period_of_report']
            prev_acc = filings[1]['accession_number'] if len(filings) > 1 else None
            prev_period = filings[1]['period_of_report'] if len(filings) > 1 else None

            all_latest_periods.add(latest_period)
            if summary["latest_period"] is None or latest_period > summary["latest_period"]:
                summary["latest_period"] = latest_period
            if summary["prior_period"] is None and prev_period:
                summary["prior_period"] = prev_period

            latest_holdings_raw = self._execute("SELECT issuer_name, ticker, cusip, shares, value, put_call FROM holdings WHERE accession_number = ?", (latest_acc,), fetch='all')
            latest_holdings = aggregate_holdings(latest_holdings_raw)
            total_value = sum(h['value'] for h in latest_holdings)
            summary["kpis"]["total_aum"] += total_value

            top_3_raw = sorted(latest_holdings, key=lambda x: x['value'], reverse=True)[:3]
            top_3 = []
            concentration = 0
            for h in top_3_raw:
                weight = (h['value'] * 100.0 / total_value) if total_value else 0
                concentration += weight
                top_3.append({**h, "weight": weight})
            
            fund_highlight = {
                "cik": cik, "name": fund['name'], "total_value": total_value, "prior_value": 0,
                "value_change": 0, "value_change_pct": 0, "period": latest_period,
                "position_count": len(latest_holdings), "concentration": concentration,
                "concentration_change": 0, "new_count": 0, "exit_count": 0, "top_add": None, "top_holdings": top_3
            }
            summary["fund_highlights"].append(fund_highlight)

            if prev_acc:
                prev_holdings_raw = self._execute("SELECT issuer_name, ticker, cusip, shares, value, put_call FROM holdings WHERE accession_number = ?", (prev_acc,), fetch='all')
                prev_holdings_list = aggregate_holdings(prev_holdings_raw)
                prev_total_value = sum(h['value'] for h in prev_holdings_list)
                summary["kpis"]["prior_aum"] += prev_total_value
                fund_highlight["prior_value"] = prev_total_value
                fund_highlight["value_change"] = total_value - prev_total_value
                fund_highlight["value_change_pct"] = ((total_value - prev_total_value) * 100.0 / prev_total_value) if prev_total_value else 0
                
                prev_map_simple = { (h['ticker'] or h['cusip']): h for h in prev_holdings_list }
                for th in fund_highlight["top_holdings"]:
                    key = th.get('ticker') or th.get('cusip')
                    prev_h = prev_map_simple.get(key)
                    if prev_h and prev_total_value:
                        th["weight_change"] = th["weight"] - (prev_h['value'] * 100.0 / prev_total_value)
                    else:
                        th["weight_change"] = th["weight"]

                prev_map = { ((h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')): h for h in prev_holdings_list }
                latest_keys = set(((h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')) for h in latest_holdings)
                prev_keys = set(prev_map.keys())

                # Base keys for new/exited (ignoring put/call)
                latest_base_keys = set((h['ticker'] or h['cusip']).strip().upper() for h in latest_holdings if h.get('ticker') or h.get('cusip'))
                prev_base_keys = set((h['ticker'] or h['cusip']).strip().upper() for h in prev_holdings_list if h.get('ticker') or h.get('cusip'))
                new_base_keys = latest_base_keys - prev_base_keys
                exited_base_keys = prev_base_keys - latest_base_keys

                for h in latest_holdings:
                    t_raw = h.get('ticker') or h.get('cusip')
                    if not t_raw: continue
                    key = t_raw.strip().upper()
                    if key not in current_ticker_funds:
                        current_ticker_funds[key] = {
                            "funds": set(), "ticker": h['ticker'], "issuer": h['issuer_name'], 
                            "total_value": 0, "weights": [], "max_weight": 0, "top_holder": None
                        }
                    current_ticker_funds[key]["funds"].add((fund['name'], fund['cik']))
                    current_ticker_funds[key]["total_value"] += h['value']
                    
                    w = (h['value'] * 100.0 / total_value) if total_value else 0
                    current_ticker_funds[key]["weights"].append(w)
                    if w > current_ticker_funds[key]["max_weight"]:
                        current_ticker_funds[key]["max_weight"] = w
                        current_ticker_funds[key]["top_holder"] = fund['name']

                for h in prev_holdings_list:
                    t_raw = h.get('ticker') or h.get('cusip')
                    if not t_raw: continue
                    key = t_raw.strip().upper()
                    if key not in prior_ticker_funds: prior_ticker_funds[key] = set()
                    prior_ticker_funds[key].add(fund['cik'])

                new_keys, exited_keys = latest_keys - prev_keys, prev_keys - latest_keys
                summary["kpis"]["new_positions"] += len(new_base_keys)
                summary["kpis"]["exited_positions"] += len(exited_base_keys)
                fund_highlight["new_count"], fund_highlight["exit_count"] = len(new_base_keys), len(exited_base_keys)

                prev_top_3_raw = sorted(prev_holdings_list, key=lambda x: x['value'], reverse=True)[:3]
                prev_concentration = (sum(h['value'] for h in prev_top_3_raw) * 100.0 / prev_total_value) if prev_total_value else 0
                fund_highlight["concentration_change"] = concentration - prev_concentration

                for h in latest_holdings:
                    key = (h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')
                    prev_h = prev_map.get(key)
                    curr_w = (h['value'] * 100.0 / total_value) if total_value else 0
                    prev_w = (prev_h['value'] * 100.0 / prev_total_value) if prev_h and prev_total_value else 0
                    w_delta = curr_w - prev_w
                    
                    if w_delta > 0:
                        if fund_highlight["top_add"] is None or w_delta > fund_highlight["top_add"]["weight_change"]:
                            fund_highlight["top_add"] = {"ticker": h['ticker'], "issuer_name": h['issuer_name'], "weight_change": w_delta, "curr_weight": curr_w}

                    if (key in new_keys):
                        all_new_positions.append({"ticker": h['ticker'], "issuer_name": h['issuer_name'], "fund_name": fund['name'], "cik": fund['cik'], "value": h['value'], "weight": curr_w})

                    summary["big_movers"].append({
                        "fund_name": fund['name'], "cik": fund['cik'], "ticker": f"{h['ticker']} {h['put_call']}" if h.get('put_call') else h['ticker'],
                        "issuer_name": h['issuer_name'], "val_change": h['value'] - (prev_h['value'] if prev_h else 0),
                        "shares_change": h['shares'] - (prev_h['shares'] if prev_h else 0),
                        "pct_of_fund": w_delta, "curr_weight": curr_w, "shares": h['shares'], "value": h['value']
                    })

                    t_raw = h.get('ticker') or h.get('cusip')
                    if not t_raw: continue
                    t_key = t_raw.strip().upper()
                    
                    if t_key not in summary["ticker_fund_activity"]:
                        summary["ticker_fund_activity"][t_key] = {
                            "buying": 0, "selling": 0, 
                            "ticker": h['ticker'], "issuer": h['issuer_name'], 
                            "buying_funds": [], "selling_funds": [],
                            "new_buyers": [], "exited_sellers": []
                        }
                    v_change = h['value'] - (prev_h['value'] if prev_h else 0)
                    if v_change > 0:
                        summary["ticker_fund_activity"][t_key]["buying"] += 1
                        summary["ticker_fund_activity"][t_key]["buying_funds"].append({"name": fund['name'], "cik": fund['cik']})
                        if t_key in new_base_keys:
                            summary["ticker_fund_activity"][t_key]["new_buyers"].append({"name": fund['name'], "cik": fund['cik']})
                    elif v_change < 0:
                        summary["ticker_fund_activity"][t_key]["selling"] += 1
                        summary["ticker_fund_activity"][t_key]["selling_funds"].append({"name": fund['name'], "cik": fund['cik']})

                    if abs(w_delta) >= 3.0:
                        summary["portfolio_shifts"].append({"fund_name": fund['name'], "cik": fund['cik'], "ticker": h['ticker'], "issuer_name": h['issuer_name'], "weight_delta": w_delta, "curr_weight": curr_w, "prev_weight": prev_w})

                for h in prev_holdings_list:
                    t_key = h['ticker'] or h['cusip']
                    key = t_key + ('_' + h['put_call'] if h.get('put_call') else '')
                    if key in exited_keys:
                        all_exited_positions.append({"ticker": h['ticker'], "issuer_name": h.get('issuer_name', 'Unknown'), "fund_name": fund['name'], "cik": fund['cik'], "value": h['value'], "weight": (h['value'] * 100.0 / prev_total_value) if prev_total_value else 0})
                        if t_key not in summary["ticker_fund_activity"]:
                             summary["ticker_fund_activity"][t_key] = {
                                "buying": 0, "selling": 0, 
                                "ticker": h['ticker'], "issuer": h.get('issuer_name', 'Unknown'), 
                                "buying_funds": [], "selling_funds": [],
                                "new_buyers": [], "exited_sellers": []
                            }
                        if t_key in exited_base_keys:
                            # Only add to exited_sellers if they exited the name entirely
                            if {"name": fund['name'], "cik": fund['cik']} not in summary["ticker_fund_activity"][t_key]["exited_sellers"]:
                                summary["ticker_fund_activity"][t_key]["exited_sellers"].append({"name": fund['name'], "cik": fund['cik']})

        summary["big_movers"] = sorted(summary["big_movers"], key=lambda x: abs(x['val_change']), reverse=True)[:20]
        summary["portfolio_shifts"].sort(key=lambda x: abs(x['weight_delta']), reverse=True)
        
        most_held = sorted(current_ticker_funds.items(), key=lambda x: len(x[1]["funds"]), reverse=True)[:5]
        summary["crowding_signals"]["most_held"] = [{"ticker": v["ticker"], "issuer_name": v["issuer"], "fund_count": len(v["funds"]), "funds": [{"name": f[0], "cik": f[1]} for f in v["funds"]]} for k, v in most_held]
        
        # Crowding signals based on absolute new entries/exits
        activity_list = []
        for t, act in summary["ticker_fund_activity"].items():
            activity_list.append({
                "ticker": act["ticker"],
                "issuer_name": act["issuer"],
                "new_buyers_count": len(act["new_buyers"]),
                "exited_sellers_count": len(act["exited_sellers"])
            })

        summary["crowding_signals"]["gaining_funds"] = sorted(
            [x for x in activity_list if x["new_buyers_count"] > 0],
            key=lambda x: x["new_buyers_count"],
            reverse=True
        )[:5]
        # Map back to the expected format for the UI
        summary["crowding_signals"]["gaining_funds"] = [
            {"ticker": x["ticker"], "issuer_name": x["issuer_name"], "change": x["new_buyers_count"]}
            for x in summary["crowding_signals"]["gaining_funds"]
        ]

        summary["crowding_signals"]["losing_funds"] = sorted(
            [x for x in activity_list if x["exited_sellers_count"] > 0],
            key=lambda x: x["exited_sellers_count"],
            reverse=True
        )[:5]
        summary["crowding_signals"]["losing_funds"] = [
            {"ticker": x["ticker"], "issuer_name": x["issuer_name"], "change": -x["exited_sellers_count"]}
            for x in summary["crowding_signals"]["losing_funds"]
        ]
        
        summary["new_positions"] = sorted(all_new_positions, key=lambda x: x["value"], reverse=True)[:100]
        summary["exited_positions"] = sorted(all_exited_positions, key=lambda x: x["value"], reverse=True)[:100]
        
        # Build full consensus list for the new tab
        consensus_list = []
        for ticker_key, data in current_ticker_funds.items():
            cc = len(data["funds"])
            pc = len(prior_ticker_funds.get(ticker_key, []))
            avg_w = sum(data["weights"]) / cc if cc > 0 else 0
            # Conviction score: 40% breadth (min 10 funds), 60% depth (min 15% avg weight)
            score = (min(cc / 10.0, 1.0) * 40.0) + (min(avg_w / 15.0, 1.0) * 60.0)
            
            consensus_list.append({
                "ticker": data["ticker"],
                "issuer_name": data["issuer"],
                "fund_count": cc,
                "prev_fund_count": pc,
                "change": cc - pc,
                "total_value": data["total_value"],
                "avg_weight": avg_w,
                "max_weight": data["max_weight"],
                "top_holder": data["top_holder"],
                "conviction_score": round(score, 1),
                "funds": list(data["funds"])
            })
        
        # Sort by fund count descending, then value
        summary["consensus_stocks"] = sorted(consensus_list, key=lambda x: (x["fund_count"], x["total_value"]), reverse=True)
        
        summary["fund_periods"] = sorted(list(all_latest_periods), reverse=True)
        summary["periods_aligned"] = len(all_latest_periods) <= 1
        return summary

    def get_prices(self, ticker: str, start_date: str = None) -> List[Dict]:
        """Returns historical prices for a ticker."""
        query = "SELECT date, price, dividends FROM prices WHERE ticker = ?"
        params = [ticker]
        if start_date:
            query += " AND date >= ?"
            params.append(start_date)
        query += " ORDER BY date ASC"
        return self._execute(query, tuple(params), fetch='all')

    def save_prices(self, ticker: str, prices: List[Dict]):
        """Bulk saves price data for a ticker."""
        if not prices:
            return

        # Prepare records for insertion
        records = [(ticker, p['date'], p['price'], p.get('dividends', 0)) for p in prices]
        
        if self.is_postgres:
            # PostgreSQL batch insert with conflict handling
            # Use a smaller template to reduce string processing overhead
            query = """
                INSERT INTO prices (ticker, date, price, dividends)
                VALUES %s
                ON CONFLICT (ticker, date) DO UPDATE SET 
                    price = EXCLUDED.price,
                    dividends = EXCLUDED.dividends
            """
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    from psycopg2.extras import execute_values
                    # execute_values is faster, but we'll use a page_size to manage memory
                    execute_values(cur, query, records, page_size=1000)
                conn.commit()
        else:
            # SQLite batch insert
            self._execute_many("""
                INSERT OR REPLACE INTO prices (ticker, date, price, dividends)
                VALUES (?, ?, ?, ?)
            """, records)

    def _execute_many(self, query: str, params_list: List[tuple]):
        """Helper for bulk SQLite inserts."""
        with self._get_connection() as conn:
            conn.executemany(query, params_list)
            conn.commit()

    def delete_group(self, group_id: int):
        self._execute("DELETE FROM fund_groups WHERE id = ?", (group_id,))

    def reorder_groups(self, orders: Dict[int, int]):
        for group_id, sort_order in orders.items():
            self._execute("UPDATE fund_groups SET sort_order = ? WHERE id = ?", (sort_order, group_id))

    def add_fund_to_group(self, group_id: int, cik: str):
        cik = self.normalize_cik(cik)
        if self.is_postgres:
            self._execute("INSERT INTO fund_group_members (group_id, cik) VALUES (?, ?) ON CONFLICT DO NOTHING", (group_id, cik))
        else:
            self._execute("INSERT OR IGNORE INTO fund_group_members (group_id, cik) VALUES (?, ?)", (group_id, cik))

    def remove_fund_from_group(self, group_id: int, cik: str):
        cik = self.normalize_cik(cik)
        self._execute("DELETE FROM fund_group_members WHERE group_id = ? AND cik = ?", (group_id, cik))

    def update_sync_status(self, cik: str, status: str, error: str = None, newly_added: int = 0):
        cik = self.normalize_cik(cik)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if self.is_postgres:
            self._execute("""
                INSERT INTO sync_status (cik, status, last_sync, error_message, newly_added_count)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (cik) DO UPDATE SET 
                    status = EXCLUDED.status,
                    last_sync = EXCLUDED.last_sync,
                    error_message = EXCLUDED.error_message,
                    newly_added_count = EXCLUDED.newly_added_count
            """, (cik, status, now, error, newly_added))
        else:
            self._execute("""
                INSERT OR REPLACE INTO sync_status (cik, status, last_sync, error_message, newly_added_count)
                VALUES (?, ?, ?, ?, ?)
            """, (cik, status, now, error, newly_added))

    def get_sync_status(self, cik: str) -> Optional[Dict]:
        cik = self.normalize_cik(cik)
        return self._execute("SELECT * FROM sync_status WHERE cik = ?", (cik,), fetch='one')

    def get_ticker_metadata(self, ticker: str) -> Optional[Dict]:
        return self._execute("SELECT * FROM ticker_metadata WHERE ticker = ?", (ticker,), fetch='one')

    def save_ticker_metadata(self, ticker: str, status: str):
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if self.is_postgres:
            self._execute("""
                INSERT INTO ticker_metadata (ticker, status, last_updated)
                VALUES (?, ?, ?)
                ON CONFLICT (ticker) DO UPDATE SET 
                    status = EXCLUDED.status,
                    last_updated = EXCLUDED.last_updated
            """, (ticker, status, now))
        else:
            self._execute("""
                INSERT OR REPLACE INTO ticker_metadata (ticker, status, last_updated)
                VALUES (?, ?, ?)
            """, (ticker, status, now))

    def delete_ticker_metadata(self, ticker: str):
        self._execute("DELETE FROM ticker_metadata WHERE ticker = ?", (ticker,))

    def save_quarterly_stats(self, stats: Dict):
        """Persist or update quarterly summary statistics for a fund."""
        cik = self.normalize_cik(stats["cik"])
        
        fields = [
            "cik", "period_of_report", "accession_number", "total_aum", 
            "position_count", "top_10_concentration", "avg_position_size", 
            "primary_sector", "primary_sector_weight", "mega_cap_pct", 
            "mid_cap_pct", "small_cap_pct", "portfolio_turnover", 
            "avg_holding_period", "herding_score"
        ]
        
        placeholders = ", ".join(["?" for _ in fields])
        columns = ", ".join(fields)
        
        if self.is_postgres:
            update_clause = ", ".join([f"{f} = EXCLUDED.{f}" for f in fields if f not in ["cik", "period_of_report"]])
            query = f"""
                INSERT INTO fund_quarterly_stats ({columns})
                VALUES ({placeholders})
                ON CONFLICT (cik, period_of_report) DO UPDATE SET {update_clause}
            """
        else:
            query = f"INSERT OR REPLACE INTO fund_quarterly_stats ({columns}) VALUES ({placeholders})"
            
        params = tuple(stats.get(f) for f in fields)
        # Ensure CIK is normalized in params
        params = (cik,) + params[1:]
        
        self._execute(query, params)

    def search_explorer(self, criteria: Dict) -> List[Dict]:
        """
        Executes a complex multi-factor search for the Institutional Explorer.
        Supports global logic (Match All/Any) and row-level logic (AND/OR).
        """
        global_logic = criteria.get("global_logic", criteria.get("logic", "AND")).upper()
        if global_logic not in ["AND", "OR"]:
            global_logic = "AND"
            
        filters = criteria.get("filters", [])
        
        # Valid columns to prevent SQL injection
        valid_metrics = [
            "total_aum", "position_count", "top_10_concentration", 
            "avg_position_size", "primary_sector", "primary_sector_weight", 
            "mega_cap_pct", "mid_cap_pct", "small_cap_pct", 
            "portfolio_turnover", "avg_holding_period", "herding_score",
            "holds_ticker"
        ]

        op_map = {
            "gt": ">", "lt": "<", "ge": ">=", "le": "<=", 
            "eq": "=", "ne": "!=", "contains": "LIKE", "not_contains": "NOT LIKE"
        }

        if not filters:
            # Return latest stats for all funds if no filters
            return self._execute("""
                SELECT f.name, f.cik, f.is_tracked, s.*
                FROM fund_quarterly_stats s
                JOIN funds f ON s.cik = f.cik
                WHERE s.period_of_report = (SELECT MAX(period_of_report) FROM fund_quarterly_stats)
                ORDER BY s.total_aum DESC
                LIMIT 100
            """, fetch='all')

        query_parts = []
        params = []
        
        for i, f in enumerate(filters):
            metric = f.get("metric")
            if metric not in valid_metrics: continue
            
            op_key = f.get("op")
            op = op_map.get(op_key, "=")
            val = f.get("val")
            
            # Row level logic (AND/OR) connects this filter to the PREVIOUS one
            row_logic = f.get("logic", global_logic).upper()
            if row_logic not in ["AND", "OR"]:
                row_logic = global_logic
            
            prefix = ""
            if i > 0:
                prefix = f" {row_logic} "
            
            # Handle non-numeric vs numeric
            if metric == "primary_sector":
                if op_key in ["contains", "not_contains"]:
                    query_parts.append(f"{prefix}UPPER(s.{metric}) {op} ?")
                    params.append(f"%{str(val).upper()}%")
                else:
                    query_parts.append(f"{prefix}UPPER(s.{metric}) {op} ?")
                    params.append(str(val).upper())
            elif metric == "holds_ticker":
                # Special sub-query for ticker check in the specific filing
                query_parts.append(f"""
                    {prefix}EXISTS (
                        SELECT 1 FROM holdings h2 
                        WHERE h2.accession_number = s.accession_number 
                        AND UPPER(h2.ticker) = ?
                    )
                """)
                params.append(str(val).upper())
            else:
                try:
                    num_val = float(val)
                    query_parts.append(f"{prefix}s.{metric} {op} ?")
                    params.append(num_val)
                except (ValueError, TypeError):
                    continue

        if not query_parts:
            return []

        where_clause = "".join(query_parts)
        
        # Optimization: Use a CTE to find latest periods instead of a correlated subquery
        query = f"""
            WITH LatestStats AS (
                SELECT cik, MAX(period_of_report) as latest_period
                FROM fund_quarterly_stats
                GROUP BY cik
            )
            SELECT f.name, f.cik, f.is_tracked, s.*
            FROM fund_quarterly_stats s
            JOIN funds f ON s.cik = f.cik
            JOIN LatestStats ls ON s.cik = ls.cik AND s.period_of_report = ls.latest_period
            WHERE ({where_clause})
            ORDER BY s.total_aum DESC
            LIMIT 200
        """
        return self._execute(query, tuple(params), fetch='all')

    def get_whale_favorites(self, limit: int = 100) -> List[Dict]:
        """
        Finds the most popular stocks across all funds in their latest filings.
        Returns ticker, issuer, count of funds, total value, and avg weight.
        """
        # Rewritten to avoid correlated subquery referencing outer CTE (PG-incompatible)
        query = """
            WITH LatestFilings AS (
                SELECT cik, MAX(period_of_report) as latest_period
                FROM filings
                GROUP BY cik
            ),
            WhaleHoldings AS (
                SELECT h.ticker, h.issuer_name, h.value, h.accession_number
                FROM holdings h
                JOIN filings f ON h.accession_number = f.accession_number
                JOIN LatestFilings lf ON f.cik = lf.cik AND f.period_of_report = lf.latest_period
                WHERE h.ticker IS NOT NULL
            ),
            TickerStats AS (
                SELECT 
                    wh.ticker, 
                    MAX(wh.issuer_name) as issuer_name,
                    COUNT(DISTINCT wh.accession_number) as whale_count,
                    SUM(wh.value) as total_value,
                    AVG(CASE WHEN qs.total_aum > 0 
                        THEN CAST(wh.value AS FLOAT) * 100.0 / qs.total_aum 
                        ELSE 0 END) as avg_weight
                FROM WhaleHoldings wh
                LEFT JOIN fund_quarterly_stats qs ON wh.accession_number = qs.accession_number
                GROUP BY wh.ticker
            )
            SELECT * FROM TickerStats
            ORDER BY whale_count DESC, total_value DESC
            LIMIT ?
        """
        return self._execute(query, (limit,), fetch='all')

    def get_stock_holders(self, ticker: str, group_id: int = None) -> List[Dict]:
        """
        Returns a list of funds that hold the given ticker in their latest filing.
        If group_id is provided, only returns funds in that group.
        Otherwise, only returns funds that are marked as 'is_tracked'.
        """
        ticker = str(ticker).strip().upper()
        
        # Build the dynamic filtering clause
        filter_clause = "WHERE UPPER(h.ticker) = ?"
        params = [ticker]
        
        if group_id:
            filter_clause += " AND lf.cik IN (SELECT cik FROM fund_group_members WHERE group_id = ?)"
            params.append(group_id)
        else:
            filter_clause += " AND f.is_tracked = 1"

        query = f"""
            WITH LatestPeriods AS (
                SELECT cik, MAX(period_of_report) as max_p
                FROM filings
                GROUP BY cik
            ),
            LatestFilings AS (
                SELECT f.cik, MAX(f.accession_number) as latest_acc
                FROM filings f
                JOIN LatestPeriods lp ON f.cik = lp.cik AND f.period_of_report = lp.max_p
                GROUP BY f.cik
            ),
            AggregatedHoldings AS (
                SELECT 
                    lf.cik,
                    lf.latest_acc as accession_number,
                    SUM(h.shares) as total_shares,
                    SUM(h.value) as total_value,
                    MAX(h.put_call) as put_call
                FROM holdings h
                JOIN LatestFilings lf ON h.accession_number = lf.latest_acc
                LEFT JOIN funds f ON lf.cik = f.cik
                {filter_clause}
                GROUP BY lf.cik, lf.latest_acc
            )
            SELECT 
                COALESCE(f.name, 'Unknown Fund (' || ah.cik || ')') as fund_name,
                ah.cik,
                ah.total_shares as shares,
                ah.total_value as value,
                ah.put_call,
                qs.primary_sector,
                qs.portfolio_turnover,
                (CAST(ah.total_value AS FLOAT) * 100.0 / NULLIF(qs.total_aum, 0)) as weight
            FROM AggregatedHoldings ah
            LEFT JOIN funds f ON ah.cik = f.cik
            LEFT JOIN fund_quarterly_stats qs ON ah.accession_number = qs.accession_number
            ORDER BY ah.total_value DESC
        """
        return self._execute(query, tuple(params), fetch='all')

    def search_all(self, query: str) -> Dict:
        """Global search for funds and tickers."""
        query = query.strip().upper()
        if not query:
            return {"funds": [], "tickers": []}

        # 1. Search Funds
        funds = self._execute("""
            SELECT cik, name FROM funds 
            WHERE UPPER(name) LIKE ? OR cik LIKE ?
            LIMIT 10
        """, (f"%{query}%", f"%{query}%"), fetch='all')

        # 2. Search Tickers (latest holdings only)
        # We find which funds hold this ticker in their most recent filing
        tickers = self._execute("""
            SELECT DISTINCT h.ticker, h.issuer_name
            FROM holdings h
            WHERE UPPER(h.ticker) LIKE ? OR UPPER(h.issuer_name) LIKE ?
            LIMIT 10
        """, (f"%{query}%", f"%{query}%"), fetch='all')

        # For each ticker, find who holds it
        ticker_results = []
        for t in tickers:
            symbol = t['ticker']
            if not symbol: continue
            
            holders = self._execute("""
                SELECT f.name, f.cik, h.value, h.shares
                FROM holdings h
                JOIN filings fl ON h.accession_number = fl.accession_number
                JOIN funds f ON fl.cik = f.cik
                WHERE h.ticker = ?
                AND fl.accession_number = (
                    SELECT accession_number FROM filings 
                    WHERE cik = f.cik 
                    ORDER BY period_of_report DESC LIMIT 1
                )
                ORDER BY h.value DESC
                LIMIT 5
            """, (symbol,), fetch='all')
            
            ticker_results.append({
                "ticker": symbol,
                "issuer": t['issuer_name'],
                "holders": holders
            })

        return {
            "funds": funds,
            "tickers": ticker_results
        }

    def get_sector_attribution(self, cik: str):
        """Calculates portfolio weighting by sector across all periods."""
        cik = self.normalize_cik(cik)
        # 1. Get all holdings with their period and sector
        holdings = self._execute("""
            SELECT fl.period_of_report, h.sector, SUM(h.value) as sector_value
            FROM filings fl
            JOIN holdings h ON fl.accession_number = h.accession_number
            WHERE fl.cik = ?
            GROUP BY fl.period_of_report, h.sector
            ORDER BY fl.period_of_report ASC
        """, (cik,), fetch='all')

        if not holdings:
            return []

        # 2. Group by period to calculate percentages
        periods = {}
        for h in holdings:
            period = h['period_of_report']
            if period not in periods:
                periods[period] = {"total_value": 0, "sectors": {}}
            
            sector = h['sector'] or "Unknown"
            periods[period]["total_value"] += h['sector_value']
            periods[period]["sectors"][sector] = h['sector_value']

        # 3. Format result and calculate shifts
        result = []
        sorted_periods = sorted(periods.keys())
        
        for i, period in enumerate(sorted_periods):
            p_data = periods[period]
            total = p_data["total_value"]
            
            sector_list = []
            for sector, val in p_data["sectors"].items():
                percent = (val / total * 100) if total > 0 else 0
                
                # Calculate shift from previous period
                shift = 0
                if i > 0:
                    prev_period = sorted_periods[i-1]
                    prev_p_data = periods[prev_period]
                    prev_total = prev_p_data["total_value"]
                    prev_val = prev_p_data["sectors"].get(sector, 0)
                    prev_percent = (prev_val / prev_total * 100) if prev_total > 0 else 0
                    shift = percent - prev_percent

                sector_list.append({
                    "sector": sector,
                    "value": val,
                    "percent": percent,
                    "shift": shift
                })
            
            result.append({
                "period": period,
                "total_value": total,
                "attribution": sorted(sector_list, key=lambda x: x['percent'], reverse=True)
            })

        return result
    def get_all_funds_performance(self, group_id: int = None) -> Dict:
        """Calculates TWR performance for all funds (or group) over time for comparison."""
        if group_id:
            all_funds = self._execute("""
                SELECT f.* FROM funds f
                JOIN fund_group_members m ON f.cik = m.cik
                WHERE m.group_id = ?
            """, (group_id,), fetch='all')
        else:
            all_funds = self.get_funds()
        performance_data = {} # cik -> data
        all_periods = set()

        for fund in all_funds:
            cik = fund['cik']
            history = self.get_historical_holdings(cik)
            if not history: continue

            # Group by period
            periods_map = {}
            for h in history:
                p = h['period_of_report']
                if p not in periods_map: periods_map[p] = []
                periods_map[p].append(h)
            
            sorted_periods = sorted(periods_map.keys())
            if len(sorted_periods) < 2: continue

            fund_series = []
            cum_ret = 0.0
            
            # Initial point
            fund_series.append({
                "period": sorted_periods[0],
                "return": 0.0,
                "total_value": sum(h['value'] for h in periods_map[sorted_periods[0]])
            })
            all_periods.add(sorted_periods[0])

            for i in range(1, len(sorted_periods)):
                curr_p = sorted_periods[i]
                prev_p = sorted_periods[i-1]
                
                curr_holdings = periods_map[curr_p]
                prev_holdings = periods_map[prev_p]
                
                total_val_t = sum(h['value'] for h in curr_holdings)
                total_val_prev = sum(h['value'] for h in prev_holdings)
                
                if total_val_prev == 0: continue

                # Calculate Net Flow for TWR calculation
                # Flow = (Shares_t - Shares_prev) * Price_t
                prev_shares_map = { (h['ticker'] or h['cusip']): h['shares'] for h in prev_holdings }
                net_flow = 0.0
                
                for h in curr_holdings:
                    key = h['ticker'] or h['cusip']
                    shares_t = h['shares']
                    shares_prev = prev_shares_map.get(key, 0)
                    price_t = h['value'] / h['shares'] if h['shares'] > 0 else 0
                    
                    flow = (shares_t - shares_prev) * price_t
                    net_flow += flow
                
                # Check for exits
                curr_keys = { (h['ticker'] or h['cusip']) for h in curr_holdings }
                for h in prev_holdings:
                    key = h['ticker'] or h['cusip']
                    if key not in curr_keys:
                        net_flow += -h['value']

                period_ret = (total_val_t - net_flow) / total_val_prev - 1
                cum_ret = (1 + cum_ret) * (1 + period_ret) - 1
                
                fund_series.append({
                    "period": curr_p,
                    "return": cum_ret * 100.0,
                    "total_value": total_val_t
                })
                all_periods.add(curr_p)

            performance_data[cik] = {
                "name": fund['name'],
                "series": fund_series
            }

        # Format into a cross-sectional list for charts
        sorted_all_periods = sorted(list(all_periods))
        
        # Add Benchmark (SPY)
        from backend.services.benchmark import get_quarterly_benchmark
        benchmark_data = []
        if sorted_all_periods:
            benchmark_raw = get_quarterly_benchmark(sorted_all_periods[0])
            benchmark_map = { b['period']: b['return'] for b in benchmark_raw }
        else:
            benchmark_map = {}

        chart_data = []
        for p in sorted_all_periods:
            row = {"period": p}
            # Add funds
            for cik, fund_data in performance_data.items():
                match = next((s for s in fund_data["series"] if s["period"] == p), None)
                if match:
                    row[fund_data["name"]] = match["return"]
                else:
                    row[fund_data["name"]] = None
            
            # Add Benchmark
            row["S&P 500"] = benchmark_map.get(p)
            chart_data.append(row)

        return {
            "chart_data": chart_data,
            "funds": [f['name'] for f in all_funds if f['cik'] in performance_data]
        }



if __name__ == "__main__":
    db = DatabaseManager()
    print("Database initialized at:", db.db_path)
