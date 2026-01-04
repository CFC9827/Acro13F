import logging
from datetime import datetime
import random
import math

logger = logging.getLogger(__name__)

def get_benchmark_data(start_date: str, end_date: str = None):
    """
    Fetches S&P 500 (SPY) data for the given date range.
    Falls back to synthetic data if yfinance is not installed.
    """
    try:
        import yfinance as yf
        logger.info(f"Fetching SPY data from {start_date} to {end_date}")
        spy = yf.Ticker("SPY")
        # Ensure we fetch enough data
        hist = spy.history(start=start_date, end=end_date)
        
        benchmark_data = []
        if not hist.empty:
            # Calculate cumulative return based on the first available price
            start_price = hist['Close'].iloc[0]
            
            for date, row in hist.iterrows():
                # Store as a simplified object matching our chart needs
                benchmark_data.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "value": row['Close'],
                    "return": (row['Close'] - start_price) / start_price
                })
            return benchmark_data
            
    except ImportError:
        logger.warning("yfinance not found. Using synthetic benchmark data.")
    except Exception as e:
        logger.error(f"Error fetching benchmark data: {e}")

    # Fallback: Generate synthetic S&P-like curve (approx 10% annual return with volatility)
    logger.info("Generating synthetic benchmark data")
    return generate_synthetic_benchmark(start_date, end_date)

def generate_synthetic_benchmark(start_date_str: str, end_date_str: str = None):
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    if end_date_str:
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    else:
        end_date = datetime.now()
        
    days = (end_date - start_date).days
    data = []
    
    # Starting "price"
    current_value = 100.0
    
    # 10% annual drift roughly per day
    daily_drift = 0.10 / 252 
    daily_volatility = 0.01 # 1% daily volatility
    
    for i in range(days + 1):
        # Add some random walk
        change = random.normalvariate(daily_drift, daily_volatility)
        current_value *= (1 + change)
        
        current_date = datetime.fromtimestamp(start_date.timestamp() + i * 86400)
        
        # Only include weekdays to mimic stock market
        if current_date.weekday() < 5:
            data.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "value": current_value,
                # Normalized return (0-based) for the chart
                "return": (current_value - 100.0) / 100.0
            })
            
    return data
