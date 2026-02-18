import requests
import os
import time
from typing import List, Dict, Optional
from dotenv import load_dotenv

class SECClient:
    """
    Client for interacting with the SEC EDGAR API.
    SEC rules require a declared User-Agent: Name (email)
    """
    
    BASE_DATA_URL = "https://data.sec.gov/submissions"
    BASE_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data"

    def __init__(self, user_agent: Optional[str] = None):
        # SEC rules require a declared User-Agent: Name (email)
        # We prioritize the passed argument, then environment variable, then a placeholder.
        self.user_agent = user_agent or os.environ.get("SEC_USER_AGENT", "MyTrackerApp/1.0 (contact@example.com)")
        self.headers = {
            "User-Agent": self.user_agent,
            "Accept-Encoding": "gzip, deflate"
        }

    def get_submissions(self, cik: str) -> Dict:
        """Fetches the latest submissions for a given CIK (padded to 10 digits)."""
        time.sleep(0.1) # SEC rate limiting (max 10 req/sec)
        cik_padded = cik.zfill(10)
        url = f"{self.BASE_DATA_URL}/CIK{cik_padded}.json"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_filing_url(self, cik: str, accession_number: str, filename: str) -> str:
        """Constructs the URL for a specific filing document."""
        cik_clean = cik.lstrip('0')
        accession_clean = accession_number.replace('-', '')
        return f"{self.BASE_ARCHIVE_URL}/{cik_clean}/{accession_clean}/{filename}"

    def get_xml_filename(self, cik: str, accession_number: str) -> str:
        """Attempts to find the correct XML filename for the 13F information table."""
        cik_clean = cik.lstrip('0')
        accession_clean = accession_number.replace('-', '')
        # SEC provides an index.json for each filing directory
        time.sleep(0.1) # SEC rate limiting
        url = f"{self.BASE_ARCHIVE_URL}/{cik_clean}/{accession_clean}/index.json"
        
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        data = response.json()
        
        # Look for files that look like information tables
        # They usually end in .xml and contain 'table' or 'inftable'
        for file in data.get('directory', {}).get('item', []):
            name = file.get('name', '').lower()
            if name.endswith('.xml'):
                # Prioritize 'inftable' or 'informationtable'
                if 'inftable' in name or 'informationtable' in name:
                    return file['name']
        
        # Fallback: any XML that isn't the primary doc (if we can distinguish)
        # For 13F, the primary doc is often .txt or a different .xml
        for file in data.get('directory', {}).get('item', []):
            name = file.get('name', '').lower()
            if name.endswith('.xml') and name != 'primary_doc.xml':
                return file['name']
                
        raise ValueError(f"Could not find information table XML in filing {accession_number}")

    def download_xml(self, url: str) -> str:
        """Downloads the XML content of a filing."""
        time.sleep(0.1) # SEC rate limiting
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.text

if __name__ == "__main__":
    load_dotenv()
    # Test with Berkshire Hathaway CIK: 0001067983
    client = SECClient()
    try:
        data = client.get_submissions("1067983")
        print(f"Name: {data.get('name')}")
        print("Latest Submissions Found.")
    except Exception as e:
        print(f"Error: {e}")
