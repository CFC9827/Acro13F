
import yfinance as yf
import pandas as pd

tickers = ['LOAR', 'SGI', 'ABG', 'CPNG', 'WTW', 'META', 'LAD']

for ticker in tickers:
    print(f"\nTesting {ticker}...")
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1mo")
        if hist.empty:
            print(f"FAILED: No data for {ticker}")
        else:
            print(f"SUCCESS: Found {len(hist)} days of data. Latest price: {hist['Close'].iloc[-1]:.2f}")
    except Exception as e:
        print(f"ERROR: {e}")
