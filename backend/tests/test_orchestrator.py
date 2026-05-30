import os
import sys


os.environ["DATABASE_URL"] = ""
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.orchestrator import Orchestrator


def test_process_fund_does_not_sync_prices_when_price_sync_disabled(monkeypatch):
    price_sync_calls = []

    class FakeDb:
        def normalize_cik(self, cik):
            return str(cik).zfill(10)

        def has_filings(self, cik):
            return False

        def save_fund(self, cik, name):
            pass

        def filing_exists(self, accession_number):
            return False

        def save_filing(self, accession_number, cik, period_of_report, filing_date):
            pass

        def save_holdings(self, accession_number, holdings):
            pass

        def _execute(self, *args, **kwargs):
            return []

    class FakeClient:
        def get_submissions(self, cik):
            return {
                "name": "Test Fund",
                "filings": {
                    "recent": {
                        "form": ["13F-HR"],
                        "accessionNumber": ["0000000000-26-000001"],
                        "reportDate": ["2026-03-31"],
                        "filingDate": ["2026-05-15"],
                    }
                },
            }

        def get_xml_filename(self, cik, accession_number):
            return "infotable.xml"

        def get_filing_url(self, cik, accession_number, filename):
            return "https://example.test/infotable.xml"

        def download_xml(self, url):
            return "<xml />"

    class FakeParser:
        def parse(self, xml_data):
            return [{"cusip": "02079K305", "shares": 10, "value": 1000}]

    class FakeMapper:
        def get_ticker(self, cusip):
            return "GOOGL"

    class FakeWhaleIndexService:
        def __init__(self, db):
            pass

        def calculate_fund_metrics(self, cik, accession_number):
            return None

    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)
    monkeypatch.setattr("backend.services.orchestrator.WhaleIndexService", FakeWhaleIndexService)

    orch = Orchestrator(FakeDb())
    orch.client = FakeClient()
    orch.parser = FakeParser()
    orch.mapper = FakeMapper()
    orch.sync_fund_prices = lambda cik: price_sync_calls.append(cik)

    result = orch.process_fund("1")

    assert result["newly_added"] == [{"period": "2026-03-31", "count": 1}]
    assert price_sync_calls == []

