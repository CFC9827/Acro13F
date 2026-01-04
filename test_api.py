import requests
import time
import subprocess
import os

def test_api():
    # Start the server in the background
    print("Starting FastAPI server...")
    server_process = subprocess.Popen(
        ["python", "backend/main.py"],
        cwd="c:/Users/abram/.gemini/antigravity/scratch/Stock Screener",
        env={**os.environ, "PYTHONPATH": "."}
    )
    
    time.sleep(3) # Wait for server to start
    
    try:
        # 1. Check root
        print("Testing root endpoint...")
        res = requests.get("http://localhost:8000/")
        print(f"Root: {res.json()}")
        
        # 2. Refresh a fund (Berkshire Hathaway: 1067983)
        print("Refreshing Berkshire Hathaway (1067983)...")
        res = requests.post("http://localhost:8000/funds/1067983/refresh")
        print(f"Refresh result: {res.json()}")
        
        # 3. Get funds
        print("Fetching funds list...")
        res = requests.get("http://localhost:8000/funds")
        print(f"Funds: {res.json()}")
        
        # 4. Get holdings
        print("Fetching holdings for 1067983...")
        res = requests.get("http://localhost:8000/funds/1067983/holdings")
        holdings = res.json()
        print(f"Found {len(holdings)} holdings.")
        if holdings:
            print(f"Top holding: {holdings[0]['issuer_name']} ({holdings[0]['ticker'] or 'No Ticker'})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Terminating server...")
        server_process.terminate()

if __name__ == "__main__":
    test_api()
