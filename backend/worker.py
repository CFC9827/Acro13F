import os
import logging
import time
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from backend.services.database import DatabaseManager
from backend.services.orchestrator import Orchestrator
from backend.services.prices import get_historical_prices

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('worker.log')
    ]
)
logger = logging.getLogger("worker")

class BackgroundWorker:
    def __init__(self):
        self.db = DatabaseManager()
        self.orchestrator = Orchestrator()
        logger.info("BackgroundWorker initialized with Supabase connectivity.")

    def sync_funds_task(self):
        """Task to sync stale funds from the SEC."""
        logger.info("Starting sync_funds_task...")
        stale_funds = self.db.get_stale_funds(hours=12) # Check every 12 hours
        
        if not stale_funds:
            logger.info("No stale funds found.")
            return

        logger.info(f"Found {len(stale_funds)} stale funds to sync.")
        
        for fund in stale_funds:
            cik = fund['cik']
            name = fund['name']
            try:
                logger.info(f"Syncing fund: {name} (CIK: {cik})")
                self.db.update_fund_sync_status(cik, 'syncing')
                
                # Process the fund - this handles SEC scraping, holdings, and stats
                self.orchestrator.process_fund(cik)
                
                self.db.update_fund_last_synced(cik)
                logger.info(f"Successfully synced {name}")
                
                # Sleep to respect SEC rate limits (10 req/sec)
                # process_fund makes several requests, so we sleep a bit more
                time.sleep(2) 
            except Exception as e:
                logger.error(f"Failed to sync {name}: {str(e)}")
                self.db.update_fund_sync_status(cik, 'failed')

    def sync_prices_task(self):
        """Task to proactively update stock prices."""
        logger.info("Starting sync_prices_task...")
        tickers = self.db.get_all_tickers()
        
        if not tickers:
            logger.info("No tickers found in database.")
            return

        logger.info(f"Syncing prices for {len(tickers)} tickers.")
        
        for ticker in tickers:
            try:
                logger.info(f"Updating price: {ticker}")
                # get_historical_prices naturally fetches latest and saves to DB
                get_historical_prices(ticker, self.db)
                
                # Sleep to be polite to Yahoo Finance
                time.sleep(0.5)
            except Exception as e:
                logger.error(f"Failed to update price for {ticker}: {str(e)}")

    def sync_missing_stats_task(self):
        """Ensure all filings have their quarterly stats calculated."""
        logger.info("Starting sync_missing_stats_task...")
        # Find filings that don't have stats yet
        query = """
        SELECT f.cik, f.accession_number, f.period_of_report, funds.name
        FROM filings f
        JOIN funds ON f.cik = funds.cik
        LEFT JOIN fund_quarterly_stats s ON f.accession_number = s.accession_number
        WHERE s.accession_number IS NULL
        ORDER BY f.period_of_report DESC
        """
        missing = self.db._execute(query, fetch='all')
        
        if not missing:
            logger.info("No missing stats found.")
            return

        logger.info(f"Found {len(missing)} filings missing stats.")
        from backend.services.whale_index import WhaleIndexService
        whale_svc = WhaleIndexService(self.db)

        for m in missing:
            try:
                logger.info(f"Calculating stats for {m['name']} ({m['period_of_report']})")
                metrics = whale_svc.calculate_fund_metrics(m['cik'], m['accession_number'])
                if metrics:
                    whale_svc.save_metrics(metrics)
                time.sleep(0.1)
            except Exception as e:
                logger.error(f"Failed to calculate stats for {m['accession_number']}: {str(e)}")

    def run(self):
        """Start the scheduler."""
        scheduler = BlockingScheduler()
        
        # Sync funds every 12 hours
        scheduler.add_job(self.sync_funds_task, 'interval', hours=12, next_run_time=datetime.now())
        
        # Sync prices every 24 hours (run at 11:00 PM EST / 03:00 UTC)
        scheduler.add_job(self.sync_prices_task, 'cron', hour=23)

        # Cleanup: Ensure stats are calculated every 6 hours
        scheduler.add_job(self.sync_missing_stats_task, 'interval', hours=6)
        
        logger.info("Scheduler started. Background tasks are now running.")
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Worker shutting down...")

if __name__ == "__main__":
    worker = BackgroundWorker()
    worker.run()
