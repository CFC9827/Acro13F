import yfinance as yf
import logging
import requests
import os
from datetime import datetime
from services.database import DatabaseManager

logger = logging.getLogger(__name__)

def get_historical_prices(ticker: str, db: DatabaseManager, start_date: str = None):
    """
    Returns historical prices for a ticker. 
    First checks the database, then fetches from Yahoo Finance if needed.
    """
    if not ticker:
        return []

    # 1. Try to get from DB first
    prices = db.get_prices(ticker, start_date)
    
    # Check if cached data is usable:
    # - Must have data
    # - Must be fresh (latest date within 7 days)
    # - Must cover the requested start date
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
        
        stock = yf.Ticker(ticker)
        
        # If no start date, fetch a reasonable history (e.g. 10 years)
        fetch_start = start_date if start_date else "2015-01-01"
        
        hist = stock.history(start=fetch_start)
        
        if hist.empty:
            logger.warning(f"No price data found for {ticker}")
            return prices # Return whatever we had in DB (even if empty)

        new_prices = []
        for date, row in hist.iterrows():
            new_prices.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(float(row['Close']), 2)
            })
        
        # 3. Save to DB for next time
        db.save_prices(ticker, new_prices)
        
        # Merge or just return newest? 
        # Since we use INSERT OR REPLACE, the DB is the source of truth now.
        return db.get_prices(ticker, start_date)

    except Exception as e:
        logger.error(f"Error fetching prices for {ticker}: {e}")
        return prices # Fallback to DB data if fetch fails
