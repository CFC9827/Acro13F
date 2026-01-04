import requests
import json

cik = "0001067983" # Berkshire
url = f"http://localhost:8000/funds/{cik}/refresh"

print(f"Post to {url}...")
res = requests.post(url)
if res.ok:
    data = res.json()
    print("Keys found:", data.keys())
    print("Newly Added count:", len(data.get('newly_added', [])))
    print("Rechecked count:", len(data.get('rechecked', [])))
    print("Skipped count:", data.get('skipped_count'))
    # Show first rechecked period
    if data.get('rechecked'):
        print("First rechecked period:", data['rechecked'][0]['period'])
else:
    print("Error:", res.status_code, res.text)
