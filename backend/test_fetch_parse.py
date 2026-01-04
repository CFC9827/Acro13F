from services.sec_client import SECClient
from services.parser import InfTableParser
import json

def run_test():
    client = SECClient(user_agent="StockTracker/1.0 (test@example.com)")
    parser = InfTableParser()
    
    # Alkeon Capital Management CIK from user's link
    cik = "1410833" 
    
    # User's provided XML link components:
    # 000141083325000008
    # inftable.xml
    
    url = client.get_filing_url(cik, "0001410833-25-000008", "inftable.xml")
    print(f"Fetching: {url}")
    
    try:
        xml_data = client.download_xml(url)
        holdings = parser.parse(xml_data)
        
        print(f"\nSuccessfully parsed {len(holdings)} holdings.")
        print("-" * 30)
        
        # Show top 5 by value
        top_5 = sorted(holdings, key=lambda x: x['value'], reverse=True)[:5]
        for h in top_5:
            print(f"Issuer: {h['issuer_name']}")
            print(f"CUSIP: {h['cusip']}")
            print(f"Value: ${h['value']:,}")
            print(f"Shares: {h['shares']:,}")
            print("---")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_test()
