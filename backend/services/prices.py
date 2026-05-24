import yfinance as yf
import logging
import requests
import os
from datetime import datetime
from backend.services.database import DatabaseManager
from backend.services.price_warehouse import PriceWarehouse

logger = logging.getLogger(__name__)


def price_backfill_enabled() -> bool:
    return os.environ.get("ENABLE_PRICE_SYNC", "").lower() in {"1", "true", "yes", "on"}


def warehouse_prices_enabled() -> bool:
    return os.environ.get("PRICE_WAREHOUSE_BACKEND", "local").lower() in {"s3", "r2"}


def get_warehouse_prices(ticker: str, start_date: str = None, warehouse=None):
    if not warehouse_prices_enabled() and warehouse is None:
        return []

    try:
        source = warehouse or PriceWarehouse()
        return [
            {
                "date": row["date"],
                "price": row["close"],
                "dividends": row.get("dividends", 0.0),
            }
            for row in source.read_prices(ticker, start=start_date)
        ]
    except Exception as e:
        logger.warning(f"Failed to read warehouse prices for {ticker}: {e}")
        return []


def get_historical_prices(ticker: str, db: DatabaseManager, start_date: str = None, warehouse=None):
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
    fail_res = db.get_ticker_metadata(ticker)
    if fail_res and fail_res.get('status') == 'failed':
        last_fail = datetime.strptime(fail_res['last_updated'], "%Y-%m-%d %H:%M:%S")
        # If we failed within the last 1 day, don't try again
        if (datetime.now() - last_fail).days < 1:
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

    warehouse_prices = get_warehouse_prices(ticker, start_date, warehouse=warehouse)
    if warehouse_prices:
        return warehouse_prices

    if not price_backfill_enabled():
        logger.info("Price backfill disabled; returning cached prices only.")
        return prices

    # 2. Fetch from Yahoo Finance
    try:
        logger.info(f"Fetching historical prices for {ticker} from Yahoo Finance")
        
        # Let yfinance handle its own session for anti-bot protection
        stock = yf.Ticker(ticker)
        
        # Add a small delay to avoid rate limiting
        import time
        time.sleep(0.5) 
        
        # If no start date, fetch a reasonable history (e.g. 10 years)
        fetch_start = start_date if start_date else "2015-01-01"
        
        hist = stock.history(start=fetch_start)
        
        if hist.empty:
            logger.warning(f"No price data found for {ticker}")
            # Mark as failed in metadata
            db.save_ticker_metadata(ticker, 'failed')
            return prices # Return whatever we had in DB (even if empty)
        
        # Clear failure marker if it exists
        db.delete_ticker_metadata(ticker)

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
