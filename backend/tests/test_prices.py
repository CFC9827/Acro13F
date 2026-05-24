from backend.services.prices import price_backfill_enabled


def test_price_backfill_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ENABLE_PRICE_SYNC", raising=False)

    assert price_backfill_enabled() is False


def test_price_backfill_can_be_enabled(monkeypatch):
    monkeypatch.setenv("ENABLE_PRICE_SYNC", "1")

    assert price_backfill_enabled() is True
