import logging

from backend.worker import BackgroundWorker

logger = logging.getLogger("worker_once")


def run_once():
    """Run one scheduled fund refresh pass and exit."""
    logger.info("Starting one-shot fund refresh...")
    worker = BackgroundWorker()
    worker.sync_funds_task()
    logger.info("One-shot fund refresh complete.")


if __name__ == "__main__":
    run_once()
