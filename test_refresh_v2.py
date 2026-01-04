import requests
import json
import time

# Give server a moment to start
time.sleep(1)

cik = "0001067983" # Berkshire
url = f"http://localhost:8000/funds/{cik}/refresh"

print(f"Post to {url}...")
try:
    res = requests.post(url)
    if res.ok:
        data = res.json()
        print("Response JSON:", json.dumps(data, indent=2))
        print("--- SUMMARY ---")
        print(f"Newly Added: {len(data.get('newly_added', []))}")
        print(f"Verified Existing: {data.get('verified_count')}")
    else:
        print("Error:", res.status_code, res.text)
except Exception as e:
    print("Request failed:", e)
