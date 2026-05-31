import os

from dotenv import load_dotenv

from backend.services.database import DatabaseManager

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000"


def bootstrap_initial_user(db=None):
    load_dotenv(override=False)
    target_user_id = os.environ.get("INITIAL_USER_ID", "").strip()
    target_email = os.environ.get("INITIAL_USER_EMAIL", "").strip() or None

    if not target_user_id:
        raise ValueError("INITIAL_USER_ID is required")

    db = db or DatabaseManager()
    db.ensure_user(target_user_id, target_email)

    default_funds = db._execute(
        "SELECT cik FROM user_tracked_funds WHERE user_id = ? ORDER BY cik",
        (DEFAULT_USER_ID,),
        fetch="all",
    )
    tracked_inserted = 0
    for row in default_funds:
        before = db._execute(
            "SELECT 1 FROM user_tracked_funds WHERE user_id = ? AND cik = ?",
            (target_user_id, row["cik"]),
            fetch="one",
        )
        db.track_fund(target_user_id, row["cik"])
        if not before:
            tracked_inserted += 1

    default_groups = db.get_groups(user_id=DEFAULT_USER_ID)
    groups_inserted = 0
    for group in default_groups:
        existing = db._execute(
            "SELECT id FROM user_fund_groups WHERE user_id = ? AND name = ?",
            (target_user_id, group["name"]),
            fetch="one",
        )
        if existing:
            target_group_id = existing["id"]
        else:
            target_group_id = db.create_group(group["name"], user_id=target_user_id)
            groups_inserted += 1

        for cik in group["member_ciks"]:
            db.add_fund_to_group(target_group_id, cik, user_id=target_user_id)

    return {
        "target_user_id": target_user_id,
        "tracked_inserted": tracked_inserted,
        "groups_inserted": groups_inserted,
    }


if __name__ == "__main__":
    result = bootstrap_initial_user()
    print(result)
