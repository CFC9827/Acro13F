import requests

api_url = "http://localhost:8000/api/explorer/search"
# Use the known user_id via a fake token if possible, or just call it if it's local
# Actually, I can't easily get a valid Supabase token here without credentials.

# But wait! I have the database.py tool!
# I can run the exact logic the backend runs.

from services.database import db_manager

user_id = "613a7374-1aab-4aa8-aa0f-da005a8b8cfb"
criteria = {
    "filters": [
        {"logic": "AND", "metric": "total_aum", "op": "gt", "val": 1000000000}
    ],
    "global_logic": "AND"
}

try:
    results = db_manager.search_explorer(criteria, user_id=user_id)
    if results:
        # Find TCI Fund
        tci = next((r for r in results if r['cik'] == '0001647251'), None)
        print("TCI Result:", tci)
    else:
        print("No results")
except Exception as e:
    print(f"Error: {e}")
