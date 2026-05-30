import os
import logging
import time
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from backend.services.database import DatabaseManager
from backend.services.orchestrator import Orchestrator

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

def price_sync_enabled() -> bool:
    """Full historical prices are too large for the default Neon tier."""
    return os.environ.get("ENABLE_PRICE_SYNC", "").lower() in {"1", "true", "yes", "on"}

def price_metrics_sync_enabled() -> bool:
    """Derived price metrics are refreshed only when the warehouse path is configured."""
    enabled = os.environ.get("ENABLE_PRICE_METRICS_SYNC", "").lower() in {"1", "true", "yes", "on"}
    if not enabled:
        return False

    backend = os.environ.get("PRICE_WAREHOUSE_BACKEND", "local").lower()
    if backend in {"s3", "r2"}:
        required = [
            "PRICE_WAREHOUSE_BUCKET",
            "PRICE_WAREHOUSE_ENDPOINT_URL",
            "PRICE_WAREHOUSE_ACCESS_KEY_ID",
            "PRICE_WAREHOUSE_SECRET_ACCESS_KEY",
        ]
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            logger.warning("Price metrics sync disabled; missing warehouse config: %s", ", ".join(missing))
            return False

    return True

def price_metrics_refresh_limit() -> int:
    try:
        return max(1, int(os.environ.get("PRICE_METRICS_REFRESH_LIMIT", "25")))
    except ValueError:
        return 25

def price_metrics_refresh_hours() -> int:
    try:
        return max(1, int(os.environ.get("PRICE_METRICS_REFRESH_HOURS", "24")))
    except ValueError:
        return 24

def _positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default

def fund_refresh_interval_hours() -> int:
    return _positive_int_env("FUND_REFRESH_INTERVAL_HOURS", 12)

def fund_refresh_stale_hours() -> int:
    return _positive_int_env("FUND_REFRESH_STALE_HOURS", 12)

def fund_refresh_limit() -> int:
    return _positive_int_env("FUND_REFRESH_LIMIT", 25)

def fund_refresh_tracked_only() -> bool:
    return os.environ.get("FUND_REFRESH_TRACKED_ONLY", "1").lower() not in {"0", "false", "no", "off"}

def fetch_historical_prices_for_worker(ticker, db):
    from backend.services.prices import get_historical_prices

    return get_historical_prices(ticker, db)

def build_recent_price_metrics_for_worker(db, limit: int):
    from backend.services.price_warehouse import PriceWarehouse
    from backend.scripts.build_price_derived_metrics import build_recent_price_metrics

    return build_recent_price_metrics(db, PriceWarehouse(), limit=limit)

class BackgroundWorker:
    def __init__(self):
        self.db = DatabaseManager()
        self.orchestrator = Orchestrator()
        logger.info("BackgroundWorker initialized.")

    def sync_funds_task(self):
        """Task to sync stale funds from the SEC."""
        logger.info("Starting sync_funds_task...")
        stale_hours = fund_refresh_stale_hours()
        limit = fund_refresh_limit()
        tracked_only = fund_refresh_tracked_only()
        stale_funds = self.db.get_stale_funds(hours=stale_hours, limit=limit, tracked_only=tracked_only)
        
        if not stale_funds:
            logger.info("No stale funds found.")
            return

        logger.info(
            f"Found {len(stale_funds)} stale funds to sync "
            f"(stale_hours={stale_hours}, limit={limit}, tracked_only={tracked_only})."
        )
        
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
        if not price_sync_enabled():
            logger.info("Price sync skipped. Set ENABLE_PRICE_SYNC=1 to enable scheduled price backfills.")
            return

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
                fetch_historical_prices_for_worker(ticker, self.db)
                
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

    def sync_price_metrics_task(self):
        """Refresh compact price-derived metrics from the Parquet warehouse into Neon."""
        limit = price_metrics_refresh_limit()
        logger.info(f"Starting sync_price_metrics_task for {limit} recent filings...")
        try:
            results = build_recent_price_metrics_for_worker(self.db, limit=limit)
            logger.info(f"Built {len(results)} fund price metric rows.")
        except Exception as e:
            logger.error(f"Failed to refresh fund price metrics: {str(e)}")
            raise

    def run(self):
        """Start the scheduler."""
        scheduler = BlockingScheduler()
        
        scheduler.add_job(self.sync_funds_task, 'interval', hours=fund_refresh_interval_hours(), next_run_time=datetime.now())
        
        # Sync prices every 24 hours only when explicitly enabled.
        if price_sync_enabled():
            scheduler.add_job(self.sync_prices_task, 'cron', hour=23)
        else:
            logger.info("Scheduled price sync disabled. Set ENABLE_PRICE_SYNC=1 to enable it.")

        # Cleanup: Ensure stats are calculated every 6 hours
        scheduler.add_job(self.sync_missing_stats_task, 'interval', hours=6)

        if price_metrics_sync_enabled():
            scheduler.add_job(self.sync_price_metrics_task, 'interval', hours=price_metrics_refresh_hours())
        else:
            logger.info("Scheduled price metrics refresh disabled. Set ENABLE_PRICE_METRICS_SYNC=1 to enable it.")
        
        logger.info("Scheduler started. Background tasks are now running.")
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Worker shutting down...")

if __name__ == "__main__":
    worker = BackgroundWorker()
    worker.run()
