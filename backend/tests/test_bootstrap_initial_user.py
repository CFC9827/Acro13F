import os
import tempfile

from backend.services.database import DatabaseManager
from backend.scripts.bootstrap_initial_user import bootstrap_initial_user


def test_bootstrap_initial_user_copies_default_tracking_and_groups_idempotently(monkeypatch):
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)
        default_user = "00000000-0000-0000-0000-000000000000"
        target_user = "11111111-1111-1111-1111-111111111111"

        db.ensure_user(target_user, "jonah@example.com")
        db.save_fund("1", "Fund One")
        db.save_fund("2", "Fund Two")
        db.track_fund(default_user, "1")
        db.track_fund(default_user, "2")
        group_id = db.create_group("Core", user_id=default_user)
        db.add_fund_to_group(group_id, "1", user_id=default_user)

        monkeypatch.setenv("INITIAL_USER_ID", target_user)
        monkeypatch.setenv("INITIAL_USER_EMAIL", "jonah@example.com")

        first = bootstrap_initial_user(db)
        second = bootstrap_initial_user(db)

        target_funds = db.get_funds(tracked_only=True, user_id=target_user)
        target_groups = db.get_groups(user_id=target_user)

        assert first["tracked_inserted"] == 2
        assert second["tracked_inserted"] == 0
        assert [fund["cik"] for fund in target_funds] == [db.normalize_cik("1"), db.normalize_cik("2")]
        assert len(target_groups) == 1
        assert target_groups[0]["name"] == "Core"
        assert target_groups[0]["member_ciks"] == [db.normalize_cik("1")]

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
