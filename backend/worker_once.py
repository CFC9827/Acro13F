import logging
from pathlib import Path

from dotenv import load_dotenv

from backend.worker import BackgroundWorker

logger = logging.getLogger("worker_once")


def load_local_env():
    """Load repo .env for manual runs without overriding production env vars."""
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env", override=False)


def run_once():
    """Run one scheduled fund refresh pass and exit."""
    load_local_env()
    logger.info("Starting one-shot fund refresh...")
    worker = BackgroundWorker()
    worker.sync_funds_task()
    logger.info("One-shot fund refresh complete.")


if __name__ == "__main__":
    run_once()
