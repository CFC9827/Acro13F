import requests
import json

def test_prices():
    ticker = "AAPL"
    print(f"Testing prices for {ticker}...")
    try:
        response = requests.get(f"http://localhost:8000/prices/{ticker}?start=2024-01-01")
        if response.status_code == 200:
            data = response.json()
            print(f"Success! Received {len(data)} price points.")
            if len(data) > 0:
                print(f"First point: {data[0]}")
                print(f"Last point: {data[-1]}")
        else:
            print(f"Failed with status code: {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_prices()
