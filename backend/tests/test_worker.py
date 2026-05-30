def test_worker_does_not_schedule_price_sync_by_default_on_postgres(monkeypatch):
    from backend import worker as worker_module

    jobs = []

    class FakeScheduler:
        def add_job(self, func, *args, **kwargs):
            jobs.append(func.__name__)

        def start(self):
            return None

    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)
    monkeypatch.delenv("ENABLE_PRICE_METRICS_SYNC", raising=False)
    monkeypatch.delenv("PRICE_WAREHOUSE_BACKEND", raising=False)
    monkeypatch.setattr(worker_module, "BlockingScheduler", FakeScheduler)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker_module.BackgroundWorker.run(worker)

    assert "sync_funds_task" in jobs
    assert "sync_missing_stats_task" in jobs
    assert "sync_prices_task" not in jobs
    assert "sync_price_metrics_task" not in jobs


def test_worker_uses_configured_fund_refresh_schedule(monkeypatch):
    from backend import worker as worker_module

    jobs = {}

    class FakeScheduler:
        def add_job(self, func, *args, **kwargs):
            jobs[func.__name__] = {"args": args, "kwargs": kwargs}

        def start(self):
            return None

    monkeypatch.setenv("FUND_REFRESH_INTERVAL_HOURS", "4")
    monkeypatch.setattr(worker_module, "BlockingScheduler", FakeScheduler)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker_module.BackgroundWorker.run(worker)

    assert jobs["sync_funds_task"]["args"] == ("interval",)
    assert jobs["sync_funds_task"]["kwargs"]["hours"] == 4


def test_sync_funds_task_uses_configured_stale_hours_and_limit(monkeypatch):
    from backend import worker as worker_module

    calls = []
    processed = []

    class FakeDb:
        def get_stale_funds(self, hours, limit, tracked_only):
            calls.append({"hours": hours, "limit": limit, "tracked_only": tracked_only})
            return [{"cik": "0000000001", "name": "Fund One"}]

        def update_fund_sync_status(self, cik, status):
            calls.append({"status": status, "cik": cik})

        def update_fund_last_synced(self, cik):
            calls.append({"last_synced": cik})

    class FakeOrchestrator:
        def process_fund(self, cik):
            processed.append(cik)

    monkeypatch.setenv("FUND_REFRESH_STALE_HOURS", "36")
    monkeypatch.setenv("FUND_REFRESH_LIMIT", "2")
    monkeypatch.setattr(worker_module.time, "sleep", lambda seconds: None)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker.db = FakeDb()
    worker.orchestrator = FakeOrchestrator()

    worker_module.BackgroundWorker.sync_funds_task(worker)

    assert calls[0] == {"hours": 36, "limit": 2, "tracked_only": True}
    assert processed == ["0000000001"]


def test_worker_can_schedule_price_sync_when_explicitly_enabled(monkeypatch):
    from backend import worker as worker_module

    jobs = []

    class FakeScheduler:
        def add_job(self, func, *args, **kwargs):
            jobs.append(func.__name__)

        def start(self):
            return None

    monkeypatch.setenv("ENABLE_PRICE_SYNC", "1")
    monkeypatch.setattr(worker_module, "BlockingScheduler", FakeScheduler)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker_module.BackgroundWorker.run(worker)

    assert "sync_prices_task" in jobs


def test_worker_can_schedule_price_metrics_refresh_when_explicitly_enabled(monkeypatch):
    from backend import worker as worker_module

    jobs = {}

    class FakeScheduler:
        def add_job(self, func, *args, **kwargs):
            jobs[func.__name__] = {"args": args, "kwargs": kwargs}

        def start(self):
            return None

    monkeypatch.setenv("ENABLE_PRICE_METRICS_SYNC", "1")
    monkeypatch.setattr(worker_module, "BlockingScheduler", FakeScheduler)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker_module.BackgroundWorker.run(worker)

    assert "sync_price_metrics_task" in jobs
    assert jobs["sync_price_metrics_task"]["args"] == ("interval",)
    assert jobs["sync_price_metrics_task"]["kwargs"]["hours"] == 24


def test_worker_uses_configured_price_metrics_refresh_hours(monkeypatch):
    from backend import worker as worker_module

    jobs = {}

    class FakeScheduler:
        def add_job(self, func, *args, **kwargs):
            jobs[func.__name__] = {"args": args, "kwargs": kwargs}

        def start(self):
            return None

    monkeypatch.setenv("ENABLE_PRICE_METRICS_SYNC", "1")
    monkeypatch.setenv("PRICE_METRICS_REFRESH_HOURS", "12")
    monkeypatch.setattr(worker_module, "BlockingScheduler", FakeScheduler)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker_module.BackgroundWorker.run(worker)

    assert jobs["sync_price_metrics_task"]["kwargs"]["hours"] == 12


def test_sync_price_metrics_task_uses_configured_limit(monkeypatch):
    from backend import worker as worker_module

    calls = []

    def fake_build_recent_price_metrics_for_worker(db, limit):
        calls.append({"db": db, "limit": limit})
        return [{"cik": "0000000001"}]

    monkeypatch.setenv("PRICE_METRICS_REFRESH_LIMIT", "7")
    monkeypatch.setattr(worker_module, "build_recent_price_metrics_for_worker", fake_build_recent_price_metrics_for_worker)

    worker = worker_module.BackgroundWorker.__new__(worker_module.BackgroundWorker)
    worker.db = object()

    worker_module.BackgroundWorker.sync_price_metrics_task(worker)

    assert calls[0]["db"] is worker.db
    assert calls[0]["limit"] == 7


def test_price_metrics_sync_requires_s3_config_when_s3_backend_enabled(monkeypatch):
    from backend import worker as worker_module

    monkeypatch.setenv("ENABLE_PRICE_METRICS_SYNC", "1")
    monkeypatch.setenv("PRICE_WAREHOUSE_BACKEND", "s3")
    monkeypatch.delenv("PRICE_WAREHOUSE_BUCKET", raising=False)
    monkeypatch.delenv("PRICE_WAREHOUSE_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("PRICE_WAREHOUSE_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("PRICE_WAREHOUSE_SECRET_ACCESS_KEY", raising=False)

    assert worker_module.price_metrics_sync_enabled() is False
