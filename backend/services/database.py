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

            # Fund groups
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS fund_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE
                )
            """)

            # Group members
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS fund_group_members (
                    group_id INTEGER,
                    cik TEXT,
                    PRIMARY KEY (group_id, cik),
                    FOREIGN KEY (group_id) REFERENCES fund_groups (id) ON DELETE CASCADE,
                    FOREIGN KEY (cik) REFERENCES funds (cik) ON DELETE CASCADE
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
        """
        Get merged historical holdings for a fund.
        
        SEC amendments (13F-HR/A) only contain securities that need updating,
        not the full portfolio. So we MERGE holdings across all filings per period:
        - First, AGGREGATE holdings by CUSIP within each filing (sum shares/values)
        - Then, for each CUSIP, use the value from the MOST RECENT filing containing it
        - This correctly applies amendment "patches" to the original filing
        """
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get all holdings with filing metadata, ordered by filing_date
            cursor.execute("""
                SELECT h.*, f.period_of_report, f.filing_date, f.cik, f.accession_number as filing_accession
                FROM holdings h
                JOIN filings f ON h.accession_number = f.accession_number
                WHERE f.cik = ?
                ORDER BY f.period_of_report ASC, f.filing_date ASC
            """, (cik,))
            all_holdings = [dict(row) for row in cursor.fetchall()]
            
            # Check which periods have amendments (multiple filings)
            cursor.execute("""
                SELECT period_of_report, COUNT(*) as filing_count
                FROM filings WHERE cik = ?
                GROUP BY period_of_report
                HAVING filing_count > 1
            """, (cik,))
            amended_periods = {row[0] for row in cursor.fetchall()}
            
            # Step 1: Aggregate holdings by CUSIP within each filing
            # Key: (accession_number, cusip, put_call) -> aggregated holding
            filing_aggregated = {}
            for h in all_holdings:
                acc = h['accession_number']
                key = (acc, h['cusip'], h.get('put_call'))
                
                if key not in filing_aggregated:
                    # First occurrence - copy the holding
                    filing_aggregated[key] = h.copy()
                else:
                    # Same CUSIP in same filing - SUM shares and values
                    filing_aggregated[key]['shares'] += h['shares']
                    filing_aggregated[key]['value'] += h['value']
            
            # Step 2: Apply "latest filing wins" logic per period
            # Key: (period, cusip, put_call) -> holding data from most recent filing
            merged = {}
            for h in filing_aggregated.values():
                period = h['period_of_report']
                key = (period, h['cusip'], h.get('put_call'))
                
                # Since we ordered by filing_date ASC, later entries overwrite earlier ones
                # This means amendments (later filings) correctly override original values
                merged[key] = h
                
                # Add amendment flag
                merged[key]['has_amendment'] = period in amended_periods
            
            # Convert back to list, sorted by period
            result = list(merged.values())
            result.sort(key=lambda x: x['period_of_report'])
            
            # Recalculate percent_portfolio after merging
            # Group by period and calculate totals
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

    # --- Fund Grouping Methods ---

    def create_group(self, name: str) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO fund_groups (name) VALUES (?)", (name,))
            conn.commit()
            return cursor.lastrowid

    def delete_group(self, group_id: int):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM fund_groups WHERE id = ?", (group_id,))
            conn.commit()

    def get_groups(self) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM fund_groups ORDER BY name")
            groups = [dict(row) for row in cursor.fetchall()]
            
            for g in groups:
                cursor.execute("SELECT cik FROM fund_group_members WHERE group_id = ?", (g['id'],))
                g['member_ciks'] = [r[0] for r in cursor.fetchall()]
            return groups

    def add_fund_to_group(self, group_id: int, cik: str):
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.execute("INSERT OR IGNORE INTO fund_group_members (group_id, cik) VALUES (?, ?)", (group_id, cik))
            conn.commit()

    def remove_fund_from_group(self, group_id: int, cik: str):
        cik = self.normalize_cik(cik)
        with self._get_connection() as conn:
            conn.execute("DELETE FROM fund_group_members WHERE group_id = ? AND cik = ?", (group_id, cik))
            conn.commit()

    def get_dashboard_summary(self, group_id: int = None) -> Dict:
        """Returns aggregated data across all funds (or group) for the global dashboard."""
        
        def aggregate_holdings(holdings: List[Dict]) -> List[Dict]:
            """Aggregate holdings by CUSIP (sum shares and values for same security)."""
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
            all_funds = []
            with self._get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT f.* FROM funds f
                    JOIN fund_group_members m ON f.cik = m.cik
                    WHERE m.group_id = ?
                """, (group_id,))
                all_funds = [dict(row) for row in cursor.fetchall()]
        else:
            all_funds = self.get_funds()
        summary = {
            "fund_highlights": [],
            "big_movers": [], # Top absolute value changes
            "portfolio_shifts": [], # Top weight changes (>3%)
            "latest_period": None,
            "prior_period": None,
            "fund_periods": [],  # List of unique periods across funds
            "periods_aligned": True,  # False if funds have different latest periods
            "kpis": {
                "fund_count": len(all_funds),
                "total_aum": 0,
                "prior_aum": 0,
                "new_positions": 0,
                "exited_positions": 0
            },
            "crowding_signals": {
                "most_held": [],        # Top 5 by current fund count
                "gaining_funds": [],    # Top 5 gaining fund count
                "losing_funds": []      # Top 5 losing fund count
            },
            "new_positions": [],  # New positions spotlight
            "ticker_fund_activity": {}  # Aggregated buying/selling by ticker
        }

        # Track all fund periods for alignment detection
        all_latest_periods = set()

        # Track ticker ownership across funds (for crowding signals)
        current_ticker_funds = {}  # ticker -> set of fund names
        prior_ticker_funds = {}    # ticker -> set of fund names
        all_new_positions = []     # For new positions spotlight
        all_exited_positions = []  # For exited positions spotlight

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            for fund in all_funds:
                cik = fund['cik']
                # Get latest 2 DISTINCT periods, using most recent filing for each
                # (amendments have same period_of_report but later filing_date)
                cursor.execute("""
                    SELECT accession_number, period_of_report, filing_date
                    FROM (
                        SELECT accession_number, period_of_report, filing_date,
                               ROW_NUMBER() OVER (PARTITION BY period_of_report ORDER BY filing_date DESC) as rn
                        FROM filings WHERE cik = ?
                    )
                    WHERE rn = 1
                    ORDER BY period_of_report DESC
                    LIMIT 2
                """, (cik,))
                filings = cursor.fetchall()
                if not filings: continue

                latest_acc = filings[0]['accession_number']
                latest_period = filings[0]['period_of_report']
                prev_acc = filings[1]['accession_number'] if len(filings) > 1 else None
                prev_period = filings[1]['period_of_report'] if len(filings) > 1 else None

                # Track this fund's period for alignment detection
                all_latest_periods.add(latest_period)

                # Track global latest/prior periods (use most recent across all funds)
                if summary["latest_period"] is None or latest_period > summary["latest_period"]:
                    summary["latest_period"] = latest_period
                if summary["prior_period"] is None and prev_period:
                    summary["prior_period"] = prev_period

                # Get holdings for latest (aggregated by CUSIP)
                cursor.execute("SELECT issuer_name, ticker, cusip, shares, value, put_call FROM holdings WHERE accession_number = ?", (latest_acc,))
                latest_holdings_raw = [dict(h) for h in cursor.fetchall()]
                latest_holdings = aggregate_holdings(latest_holdings_raw)
                total_value = sum(h['value'] for h in latest_holdings)
                summary["kpis"]["total_aum"] += total_value

                # Track current ticker ownership for crowding
                for h in latest_holdings:
                    key = h['ticker'] or h['cusip']
                    if key not in current_ticker_funds:
                        current_ticker_funds[key] = {"funds": set(), "ticker": h['ticker'], "issuer": h['issuer_name'], "total_value": 0}
                    current_ticker_funds[key]["funds"].add(fund['name'])
                    current_ticker_funds[key]["total_value"] += h['value']

                # Top 3 with weights
                top_3_raw = sorted(latest_holdings, key=lambda x: x['value'], reverse=True)[:3]
                top_3 = []
                concentration = 0
                for h in top_3_raw:
                    weight = (h['value'] * 100.0 / total_value) if total_value else 0
                    concentration += weight
                    top_3.append({
                        **h,
                        "weight": weight
                    })
                
                # Position count
                position_count = len(latest_holdings)
                
                # Store fund highlight (prior_value will be added after we process prev filing)
                fund_highlight = {
                    "cik": cik,
                    "name": fund['name'],
                    "total_value": total_value,
                    "prior_value": 0,
                    "value_change": 0,
                    "value_change_pct": 0,
                    "period": latest_period,
                    "position_count": position_count,
                    "concentration": concentration,
                    "concentration_change": 0, 
                    "new_count": 0,
                    "exit_count": 0,
                    "top_add": None,
                    "top_holdings": top_3
                }
                summary["fund_highlights"].append(fund_highlight)

                # If we have a previous filing, calculate movers and shifts
                if prev_acc:
                    cursor.execute("SELECT issuer_name, ticker, cusip, shares, value, put_call FROM holdings WHERE accession_number = ?", (prev_acc,))
                    prev_holdings_raw = [dict(h) for h in cursor.fetchall()]
                    prev_holdings_list = aggregate_holdings(prev_holdings_raw)
                    prev_total_value = sum(h['value'] for h in prev_holdings_list)
                    summary["kpis"]["prior_aum"] += prev_total_value
                    
                    # Update fund_highlight with prior value info
                    fund_highlight["prior_value"] = prev_total_value
                    fund_highlight["value_change"] = total_value - prev_total_value
                    fund_highlight["value_change_pct"] = ((total_value - prev_total_value) * 100.0 / prev_total_value) if prev_total_value else 0
                    
                    # Also add weight changes for top holdings
                    prev_map_simple = { (h['ticker'] or h['cusip']): h for h in prev_holdings_list }
                    for th in fund_highlight["top_holdings"]:
                        key = th.get('ticker') or th.get('cusip')
                        prev_h = prev_map_simple.get(key)
                        if prev_h and prev_total_value:
                            prev_weight = (prev_h['value'] * 100.0 / prev_total_value)
                            th["weight_change"] = th["weight"] - prev_weight
                        else:
                            th["weight_change"] = th["weight"]  # New position
                    
                    # Include put_call in key to distinguish stock vs options
                    prev_map = { ((h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')): h for h in prev_holdings_list }
                    latest_keys = set(((h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')) for h in latest_holdings)
                    prev_keys = set(prev_map.keys())

                    # Track prior ticker ownership for crowding
                    for h in prev_holdings_list:
                        key = h['ticker'] or h['cusip']
                        if key not in prior_ticker_funds:
                            prior_ticker_funds[key] = set()
                        prior_ticker_funds[key].add(fund['name'])

                    # Count new and exited positions
                    new_keys = latest_keys - prev_keys
                    exited_keys = prev_keys - latest_keys
                    summary["kpis"]["new_positions"] += len(new_keys)
                    summary["kpis"]["exited_positions"] += len(exited_keys)
                    
                    fund_highlight["new_count"] = len(new_keys)
                    fund_highlight["exit_count"] = len(exited_keys)

                    # Calculate concentration change
                    prev_top_3_raw = sorted(prev_holdings_list, key=lambda x: x['value'], reverse=True)[:3]
                    prev_concentration = (sum(h['value'] for h in prev_top_3_raw) * 100.0 / prev_total_value) if prev_total_value else 0
                    fund_highlight["concentration_change"] = concentration - prev_concentration

                    # Track new positions for spotlight
                    for h in latest_holdings:
                        key = h['ticker'] or h['cusip']
                        if key in new_keys:
                            weight = (h['value'] * 100.0 / total_value) if total_value else 0
                            all_new_positions.append({
                                "ticker": h['ticker'],
                                "issuer_name": h['issuer_name'],
                                "fund_name": fund['name'],
                                "value": h['value'],
                                "weight": weight
                            })

                    # Track exited positions for spotlight
                    exited_keys = prev_keys - latest_keys
                    for h in prev_holdings_list:
                        key = h['ticker'] or h['cusip']
                        if key in exited_keys:
                            weight = (h['value'] * 100.0 / prev_total_value) if prev_total_value else 0
                            all_exited_positions.append({
                                "ticker": h['ticker'],
                                "issuer_name": h.get('issuer_name', 'Unknown'),
                                "fund_name": fund['name'],
                                "value": h['value'],
                                "weight": weight
                            })

                    for h in latest_holdings:
                        key = (h['ticker'] or h['cusip']) + ('_' + h['put_call'] if h.get('put_call') else '')
                        prev_h = prev_map.get(key)
                        
                        curr_weight = (h['value'] * 100.0 / total_value) if total_value else 0
                        prev_weight = (prev_h['value'] * 100.0 / prev_total_value) if prev_h and prev_total_value else 0
                        
                        # Display ticker with PUT/CALL suffix if applicable
                        display_ticker = h['ticker']
                        if h.get('put_call'):
                            display_ticker = f"{h['ticker']} {h['put_call']}"
                        
                        val_change = h['value'] - (prev_h['value'] if prev_h else 0)
                        weight_delta = curr_weight - prev_weight
                        pct_of_fund = (val_change * 100.0 / total_value) if total_value else 0

                        # Track top add for the fund
                        if weight_delta > 0:
                            if fund_highlight["top_add"] is None or weight_delta > fund_highlight["top_add"]["weight_change"]:
                                fund_highlight["top_add"] = {
                                    "ticker": h['ticker'],
                                    "issuer_name": h['issuer_name'],
                                    "weight_change": weight_delta,
                                    "curr_weight": curr_weight
                                }

                        # Track big movers (absolute value change)
                        summary["big_movers"].append({
                            "fund_name": fund['name'],
                            "ticker": display_ticker,
                            "issuer_name": h['issuer_name'],
                            "val_change": val_change,
                            "pct_of_fund": weight_delta,  # Use weight delta as % metric
                            "curr_weight": curr_weight,
                            "shares": h['shares'],
                            "value": h['value']
                        })

                        # Track buying/selling activity per ticker
                        ticker_key = h['ticker'] or h['cusip']
                        if ticker_key not in summary["ticker_fund_activity"]:
                            summary["ticker_fund_activity"][ticker_key] = {
                                "buying": 0, 
                                "selling": 0, 
                                "ticker": h['ticker'], 
                                "issuer": h['issuer_name'],
                                "buying_funds": [],
                                "selling_funds": []
                            }
                        if val_change > 0:
                            summary["ticker_fund_activity"][ticker_key]["buying"] += 1
                            summary["ticker_fund_activity"][ticker_key]["buying_funds"].append(fund['name'])
                        elif val_change < 0:
                            summary["ticker_fund_activity"][ticker_key]["selling"] += 1
                            summary["ticker_fund_activity"][ticker_key]["selling_funds"].append(fund['name'])

                        # Track portfolio shifts (weight delta > 3% or < -3%)
                        if abs(weight_delta) >= 3.0:
                            summary["portfolio_shifts"].append({
                                "fund_name": fund['name'],
                                "ticker": h['ticker'],
                                "issuer_name": h['issuer_name'],
                                "weight_delta": weight_delta,
                                "curr_weight": curr_weight,
                                "prev_weight": prev_weight
                            })

            # Sort and limit big movers
            summary["big_movers"].sort(key=lambda x: abs(x['val_change']), reverse=True)
            summary["big_movers"] = summary["big_movers"][:20]

            # Sort portfolio shifts
            summary["portfolio_shifts"].sort(key=lambda x: abs(x['weight_delta']), reverse=True)

            # Compute crowding signals
            # Most widely held (by fund count)
            most_held = sorted(
                [(k, v) for k, v in current_ticker_funds.items()],
                key=lambda x: len(x[1]["funds"]),
                reverse=True
            )[:5]
            summary["crowding_signals"]["most_held"] = [
                {"ticker": v["ticker"], "issuer_name": v["issuer"], "fund_count": len(v["funds"]), "funds": list(v["funds"])}
                for k, v in most_held
            ]

            # Gaining/losing fund count
            fund_count_changes = []
            for ticker, data in current_ticker_funds.items():
                curr_count = len(data["funds"])
                prev_count = len(prior_ticker_funds.get(ticker, set()))
                change = curr_count - prev_count
                fund_count_changes.append({
                    "ticker": data["ticker"],
                    "issuer_name": data["issuer"],
                    "curr_count": curr_count,
                    "prev_count": prev_count,
                    "change": change
                })
            
            gaining = sorted([x for x in fund_count_changes if x["change"] > 0], key=lambda x: x["change"], reverse=True)[:5]
            losing = sorted([x for x in fund_count_changes if x["change"] < 0], key=lambda x: x["change"])[:5]
            summary["crowding_signals"]["gaining_funds"] = gaining
            summary["crowding_signals"]["losing_funds"] = losing

            # New positions spotlight (top 10 by value)
            all_new_positions.sort(key=lambda x: x["value"], reverse=True)
            summary["new_positions"] = all_new_positions[:10]

            # Exited positions spotlight (top 10 by value)
            all_exited_positions.sort(key=lambda x: x["value"], reverse=True)
            summary["exited_positions"] = all_exited_positions[:10]

            # Calculate period alignment status
            summary["fund_periods"] = sorted(list(all_latest_periods), reverse=True)
            summary["periods_aligned"] = len(all_latest_periods) <= 1

        return summary
    def get_all_funds_performance(self, group_id: int = None) -> Dict:
        """Calculates TWR performance for all funds (or group) over time for comparison."""
        if group_id:
            all_funds = []
            with self._get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT f.* FROM funds f
                    JOIN fund_group_members m ON f.cik = m.cik
                    WHERE m.group_id = ?
                """, (group_id,))
                all_funds = [dict(row) for row in cursor.fetchall()]
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
        chart_data = []
        for p in sorted_all_periods:
            row = {"period": p}
            for cik, fund_data in performance_data.items():
                match = next((s for s in fund_data["series"] if s["period"] == p), None)
                if match:
                    row[fund_data["name"]] = match["return"]
                else:
                    row[fund_data["name"]] = None
            chart_data.append(row)

        return {
            "chart_data": chart_data,
            "funds": [f['name'] for f in all_funds if f['cik'] in performance_data]
        }

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
