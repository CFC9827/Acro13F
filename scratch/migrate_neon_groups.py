"""
Migrate Neon Postgres from old fund_groups to user_fund_groups.
Copies existing group data to user-scoped tables for user_id=1.
"""
import psycopg2
import os
from dotenv import load_dotenv
load_dotenv()

conn = psycopg2.connect(dsn=os.environ["DATABASE_URL"])
cur = conn.cursor()

# 1. Copy fund_groups -> user_fund_groups for user 1
print("Migrating fund_groups -> user_fund_groups...")
cur.execute("SELECT id, name, sort_order FROM fund_groups")
groups = cur.fetchall()
for g in groups:
    gid, name, sort_order = g
    cur.execute(
        "INSERT INTO user_fund_groups (user_id, name, sort_order) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id",
        (1, name, sort_order)
    )
    new_row = cur.fetchone()
    new_id = new_row[0] if new_row else None
    if new_id:
        # Copy members for this group
        cur.execute("SELECT cik FROM fund_group_members WHERE group_id = %s", (gid,))
        members = cur.fetchall()
        for m in members:
            cur.execute(
                "INSERT INTO user_fund_group_members (group_id, user_id, cik) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (new_id, 1, m[0])
            )
        print(f"  Group '{name}' (old id={gid} -> new id={new_id}): {len(members)} members")
    else:
        print(f"  Group '{name}' already exists, skipping")

conn.commit()

# 2. Verify
cur.execute("SELECT COUNT(*) FROM user_fund_groups WHERE user_id = 1")
print(f"\nuser_fund_groups count: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM user_fund_group_members WHERE user_id = 1")
print(f"user_fund_group_members count: {cur.fetchone()[0]}")

# 3. Verify tracked funds
cur.execute("SELECT COUNT(*) FROM user_tracked_funds WHERE user_id = 1")
print(f"user_tracked_funds count: {cur.fetchone()[0]}")

conn.close()
print("\nDone! Old tables (fund_groups, fund_group_members) can be dropped later.")
