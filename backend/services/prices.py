import yfinance as yf
import logging
import requests
import os
from datetime import datetime
from backend.services.database import DatabaseManager

logger = logging.getLogger(__name__)

def get_historical_prices(ticker: str, db: DatabaseManager, start_date: str = None):
    """
    Returns historical prices for a ticker. 
    First checks the database, then fetches from Yahoo Finance if needed.
    """
    if not ticker:
        return []
    
    # Normalize ticker for Yahoo Finance (e.g., BRK/A -> BRK-A, BF.B -> BF-B)
    original_ticker = ticker
    ticker = ticker.replace('/', '-').replace('.', '-')

    # 1. Try to get from DB first
    # Use the original ticker for DB lookup as that's how it's stored in holdings
    prices = db.get_prices(original_ticker, start_date)
    
    # If not in DB, also check if we have it under the normalized ticker
    if not prices and ticker != original_ticker:
        prices = db.get_prices(ticker, start_date)
        if prices:
            # If found under normalized, return it
            return prices
    
    # Check if we have a "failed" marker or old data
    with db._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS ticker_metadata (ticker TEXT PRIMARY KEY, status TEXT, last_updated TEXT)")
        cursor.execute("SELECT last_updated FROM ticker_metadata WHERE ticker = ? AND status = 'failed'", (ticker,))
        fail_res = cursor.fetchone()
        if fail_res:
            last_fail = datetime.strptime(fail_res[0], "%Y-%m-%d %H:%M:%S")
            # If we failed within the last 30 days, don't try again
            if (datetime.now() - last_fail).days < 30:
                logger.debug(f"Skipping recently failed ticker: {ticker}")
                return prices

    # Check if cached data is usable:
    if prices:
        latest_date_str = prices[-1]['date']
        earliest_date_str = prices[0]['date']
        latest_date = datetime.strptime(latest_date_str, "%Y-%m-%d")
        earliest_date = datetime.strptime(earliest_date_str, "%Y-%m-%d")
        days_old = (datetime.now() - latest_date).days
        
        # Check if we need earlier data than what's cached
        need_earlier_data = False
        if start_date:
            requested_start = datetime.strptime(start_date, "%Y-%m-%d")
            # If requested start is more than 5 days before our earliest cached date, refetch
            if (earliest_date - requested_start).days > 5:
                need_earlier_data = True
                logger.info(f"Cached data for {ticker} starts at {earliest_date_str}, but need {start_date}")
        
        if days_old < 7 and not need_earlier_data:
            logger.info(f"Using cached prices for {ticker} ({len(prices)} points)")
            return prices

    # 2. Fetch from Yahoo Finance
    try:
        logger.info(f"Fetching historical prices for {ticker} from Yahoo Finance")
        
        # Identify the request
        user_agent = os.environ.get("SEC_USER_AGENT", "MyTrackerApp/1.0 (contact@example.com)")
        session = requests.Session()
        session.headers.update({'User-Agent': user_agent})
        
        stock = yf.Ticker(ticker, session=session)
        
        # If no start date, fetch a reasonable history (e.g. 10 years)
        fetch_start = start_date if start_date else "2015-01-01"
        
        hist = stock.history(start=fetch_start)
        
        if hist.empty:
            logger.warning(f"No price data found for {ticker}")
            # Mark as failed in metadata
            with db._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("CREATE TABLE IF NOT EXISTS ticker_metadata (ticker TEXT PRIMARY KEY, status TEXT, last_updated TEXT)")
                cursor.execute("INSERT OR REPLACE INTO ticker_metadata (ticker, status, last_updated) VALUES (?, ?, ?)", 
                               (ticker, 'failed', datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            return prices # Return whatever we had in DB (even if empty)
        
        # Clear failure marker if it exists
        with db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ticker_metadata WHERE ticker = ?", (ticker,))

        new_prices = []
        for date, row in hist.iterrows():
            new_prices.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(float(row['Close']), 2),
                "dividends": round(float(row.get('Dividends', 0)), 4)
            })
        
        # 3. Save to DB for next time
        db.save_prices(ticker, new_prices)
        
        return db.get_prices(ticker, start_date)

    except Exception as e:
        logger.error(f"Error fetching prices for {ticker}: {e}")
        return prices # Fallback to DB data if fetch fails
