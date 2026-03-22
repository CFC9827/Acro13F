from typing import List, Dict
from backend.services.database import DatabaseManager

class SummaryEngine:
    def __init__(self, db: DatabaseManager):
        self.db = db

    def precompute_fund_summaries(self, cik: str):
        """Pre-computes and caches summary data for a specific fund across its history."""
        # This will populate a summary table (if we add one) or just ensure efficient aggregation
        # Given we want <100ms load, we should create a 'fund_summaries' table
        pass

    def run_all(self):
        """Runs pre-computation for all funds in the database."""
        funds = self.db.get_funds()
        for fund in funds:
            self.precompute_fund_summaries(fund['cik'])

# We need to add the fund_summaries table to DatabaseManager
