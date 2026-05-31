# Accounts Auth V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Supabase email/password account support so Tracked Funds, groups, and Explorer `is_tracked` state are scoped to the signed-in user.

**Architecture:** Supabase Auth remains the identity provider. The React app stores the Supabase session and sends the access token to FastAPI. FastAPI verifies the token, upserts the user into Neon, and all user-owned rows continue using the Supabase user id in existing `user_id` columns.

**Tech Stack:** React 18, Vite, `@supabase/supabase-js`, FastAPI, Supabase Python client, Neon/Postgres via `DatabaseManager`, pytest.

---

## File Structure

- Modify `backend/services/auth.py`: make token verification easier to test, preserve dev fallback outside production, and return clean auth errors.
- Modify `backend/main.py`: add `/api/me` so the frontend can verify the session/user boundary.
- Modify `backend/tests/test_auth.py`: add production valid-token and invalid-token tests.
- Modify `backend/tests/test_database_explorer.py`: add per-user isolation regression tests for tracked funds and Explorer `is_tracked`.
- Create `backend/scripts/bootstrap_initial_user.py`: copy the default dev user's tracked funds and groups to a configured Supabase user id.
- Create `backend/tests/test_bootstrap_initial_user.py`: prove bootstrap is idempotent and preserves groups.
- Modify `ui/src/contexts/AuthContext.tsx`: distinguish local dev fallback from production missing-auth configuration.
- Modify `ui/src/components/LoginPage.tsx`: handle missing production auth config without rendering a broken form.
- Modify `ui/src/App.tsx`: keep sign-in boundary explicit and display signed-in email when available.
- Modify `DEPLOY.md` and `.env.example`: document `INITIAL_USER_ID` and production auth env requirements.

---

### Task 1: Backend Auth Verification Boundary

**Files:**
- Modify: `backend/services/auth.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing valid-token test**

Append this test to `backend/tests/test_auth.py`:

```python
def test_production_auth_accepts_supabase_user_and_ensures_neon_user(monkeypatch):
    from types import SimpleNamespace
    import backend.services.auth as auth_module

    ensured = []

    class FakeAuthClient:
        def get_user(self, token):
            assert token == "valid-token"
            return SimpleNamespace(
                user=SimpleNamespace(
                    id="11111111-1111-1111-1111-111111111111",
                    email="jonah@example.com",
                )
            )

    class FakeSupabase:
        auth = FakeAuthClient()

    class FakeDb:
        def ensure_user(self, user_id, email):
            ensured.append({"user_id": user_id, "email": email})

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(auth_module, "supabase", FakeSupabase())
    monkeypatch.setattr(auth_module, "db_manager", FakeDb())

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
    user = asyncio.run(auth_module.get_current_user(credentials))

    assert user == {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "jonah@example.com",
    }
    assert ensured == [
        {
            "user_id": "11111111-1111-1111-1111-111111111111",
            "email": "jonah@example.com",
        }
    ]
```

- [ ] **Step 2: Write the failing invalid-token test**

Append this test to `backend/tests/test_auth.py`:

```python
def test_production_auth_rejects_supabase_response_without_user(monkeypatch):
    from types import SimpleNamespace
    import backend.services.auth as auth_module

    class FakeAuthClient:
        def get_user(self, token):
            assert token == "expired-token"
            return SimpleNamespace(user=None)

    class FakeSupabase:
        auth = FakeAuthClient()

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(auth_module, "supabase", FakeSupabase())

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired-token")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_module.get_current_user(credentials))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid or expired token"
```

- [ ] **Step 3: Run tests and verify at least one fails**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\test_auth.py -q -p no:cacheprovider
```

Expected before implementation: the invalid-token test fails because `HTTPException` is caught and rewrapped with an `Authentication failed:` prefix, or the valid-token test exposes another auth-boundary issue.

- [ ] **Step 4: Implement clean auth exception handling**

In `backend/services/auth.py`, replace the `except Exception as e:` block with:

```python
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
```

Keep the existing Supabase `get_user(token)` verification and `db_manager.ensure_user(user_id, user_email)` call.

- [ ] **Step 5: Add `/api/me` endpoint**

In `backend/main.py`, below `/api/config`, add:

```python
@api.get("/me")
async def get_me(user: Dict[str, str] = Depends(get_current_user)):
    return user
```

- [ ] **Step 6: Run focused auth tests**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\test_auth.py -q -p no:cacheprovider
```

Expected: all auth tests pass.

- [ ] **Step 7: Commit backend auth boundary**

Run:

```bash
git add backend/services/auth.py backend/main.py backend/tests/test_auth.py
git commit -m "Harden Supabase auth boundary"
```

---

### Task 2: Per-User Data Isolation Regressions

**Files:**
- Modify: `backend/tests/test_database_explorer.py`
- Modify if required by failing tests: `backend/services/database.py`

- [ ] **Step 1: Write tracked-funds isolation test**

Append this test to `backend/tests/test_database_explorer.py`:

```python
def test_get_funds_returns_only_user_tracked_funds():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)

        db.ensure_user("user-a", "a@example.com")
        db.ensure_user("user-b", "b@example.com")
        db.save_fund("1", "Fund One")
        db.save_fund("2", "Fund Two")
        db.track_fund("user-a", "1")
        db.track_fund("user-b", "2")

        user_a_funds = db.get_funds(tracked_only=True, user_id="user-a")
        user_b_funds = db.get_funds(tracked_only=True, user_id="user-b")

        assert [fund["cik"] for fund in user_a_funds] == [db.normalize_cik("1")]
        assert [fund["cik"] for fund in user_b_funds] == [db.normalize_cik("2")]

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
```

- [ ] **Step 2: Write Explorer `is_tracked` isolation test**

Append this test to `backend/tests/test_database_explorer.py`:

```python
def test_explorer_search_marks_is_tracked_for_requesting_user_only():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        db = DatabaseManager(db_path=db_path)

        db.ensure_user("user-a", "a@example.com")
        db.ensure_user("user-b", "b@example.com")
        db.save_fund("1", "Fund One")
        db.save_filing("acc-1", db.normalize_cik("1"), "2026-03-31", "2026-05-15")
        db.save_fund_quarterly_stats({
            "cik": db.normalize_cik("1"),
            "period_of_report": "2026-03-31",
            "accession_number": "acc-1",
            "total_aum": 1000000000,
            "position_count": 10,
            "top_10_concentration": 50.0,
            "avg_position_size": 100000000,
            "primary_sector": "Technology",
            "primary_sector_weight": 40.0,
            "mega_cap_pct": 80.0,
            "mid_cap_pct": 10.0,
            "small_cap_pct": 10.0,
            "portfolio_turnover": 12.0,
            "avg_holding_period": 4.0,
            "herding_score": 30.0,
        })
        db.track_fund("user-a", "1")

        criteria = {"logic": "AND", "filters": []}
        user_a_results = db.search_explorer(criteria, user_id="user-a")
        user_b_results = db.search_explorer(criteria, user_id="user-b")

        assert user_a_results[0]["is_tracked"] == 1
        assert user_b_results[0]["is_tracked"] == 0

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
```

- [ ] **Step 3: Run isolation tests and verify failures or pass**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\test_database_explorer.py -q -p no:cacheprovider
```

Expected: if current code already isolates correctly, tests pass. If either test fails, fix only `backend/services/database.py` methods involved in the failing assertion.

- [ ] **Step 4: Commit isolation tests and any required fix**

Run:

```bash
git add backend/tests/test_database_explorer.py backend/services/database.py
git commit -m "Add user data isolation regressions"
```

---

### Task 3: Bootstrap Existing Tracked Funds to the First Real User

**Files:**
- Create: `backend/scripts/bootstrap_initial_user.py`
- Create: `backend/tests/test_bootstrap_initial_user.py`
- Modify: `.env.example`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Write idempotent bootstrap test**

Create `backend/tests/test_bootstrap_initial_user.py`:

```python
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
        assert [member["cik"] for member in target_groups[0]["members"]] == [db.normalize_cik("1")]

    finally:
        DatabaseManager._instance = None
        DatabaseManager._initialized = False
        if os.path.exists(db_path):
            os.remove(db_path)
```

- [ ] **Step 2: Run bootstrap test and verify it fails**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\test_bootstrap_initial_user.py -q -p no:cacheprovider
```

Expected before implementation: import fails because `backend.scripts.bootstrap_initial_user` does not exist.

- [ ] **Step 3: Implement bootstrap script**

Create `backend/scripts/bootstrap_initial_user.py`:

```python
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

        for member in group["members"]:
            db.add_fund_to_group(target_group_id, member["cik"], user_id=target_user_id)

    return {
        "target_user_id": target_user_id,
        "tracked_inserted": tracked_inserted,
        "groups_inserted": groups_inserted,
    }


if __name__ == "__main__":
    result = bootstrap_initial_user()
    print(result)
```

- [ ] **Step 4: Document bootstrap env vars**

Append to `.env.example`:

```env
# Optional one-time account bootstrap. Copies default dev tracked funds to this Supabase user id.
INITIAL_USER_ID=
INITIAL_USER_EMAIL=
```

Add to `DEPLOY.md` under Auth setup:

```markdown
To preserve the existing shared tracked dashboard for the first real account, set `INITIAL_USER_ID` to the Supabase Auth user id and run:

```bash
python -m backend.scripts.bootstrap_initial_user
```

The script is idempotent and can be run again without duplicating tracked funds or groups.
```
```

- [ ] **Step 5: Run bootstrap test**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\test_bootstrap_initial_user.py -q -p no:cacheprovider
```

Expected: bootstrap test passes.

- [ ] **Step 6: Commit bootstrap script**

Run:

```bash
git add backend/scripts/bootstrap_initial_user.py backend/tests/test_bootstrap_initial_user.py .env.example DEPLOY.md
git commit -m "Add initial user bootstrap script"
```

---

### Task 4: Frontend Production Auth Boundary

**Files:**
- Modify: `ui/src/contexts/AuthContext.tsx`
- Modify: `ui/src/components/LoginPage.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Update AuthContext type and configuration flags**

In `ui/src/contexts/AuthContext.tsx`, replace the top configuration block with:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const authEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const devAuthEnabled = !import.meta.env.PROD && !authEnvConfigured;
const authConfigError = import.meta.env.PROD && !authEnvConfigured;
```

Update `AuthContextType`:

```typescript
interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    devAuthEnabled: boolean;
    authConfigError: boolean;
    signOut: () => Promise<void>;
}
```

Update provider value:

```tsx
<AuthContext.Provider value={{ user, session, loading, devAuthEnabled, authConfigError, signOut }}>
    {children}
</AuthContext.Provider>
```

- [ ] **Step 2: Handle production missing auth configuration**

In the `useEffect` in `AuthProvider`, add this before the `devAuthEnabled` block:

```typescript
if (authConfigError) {
    setUser(null);
    setSession(null);
    setLoading(false);
    return;
}
```

Remove the `console.log` calls from `AuthContext.tsx` to keep production logs quiet.

- [ ] **Step 3: Make signOut safe when Supabase is not configured**

Replace `signOut` with:

```typescript
const signOut = async () => {
    if (!supabase) {
        return;
    }

    await supabase.auth.signOut();
};
```

- [ ] **Step 4: Add LoginPage configuration error state**

In `ui/src/components/LoginPage.tsx`, import `useAuth`:

```typescript
import { supabase, useAuth } from '../contexts/AuthContext';
```

Inside `LoginPage`, add:

```typescript
const { authConfigError } = useAuth();
```

Before the `<form>`, render this block when `authConfigError` is true:

```tsx
{authConfigError ? (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '14px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: '10px',
        color: '#fca5a5',
        fontSize: '0.95rem',
        lineHeight: 1.5
    }}>
        <AlertCircle size={18} />
        Production auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.
    </div>
) : (
    null
)}
```

When applying this, replace `null` with the current form block from `LoginPage.tsx`, beginning at `<form onSubmit={handleAuth}` and ending at the matching `</form>`. Move the existing form block as-is into the false branch; do not change the email input, password input, error block, submit button, or sign-in/sign-up toggle in this step.

- [ ] **Step 5: Guard handleAuth when Supabase client is absent**

At the start of `handleAuth`, after `setError(null);`, add:

```typescript
if (!supabase) {
    setError('Authentication is not configured for this deployment.');
    setLoading(false);
    return;
}
```

- [ ] **Step 6: Show signed-in email in App header**

In `ui/src/App.tsx`, find the top bar actions near the Sign Out button. Add this text before the sign-out button:

```tsx
{user?.email && (
    <span className="user-email" title={user.email}>
        {user.email}
    </span>
)}
```

If there is no matching class, use inline styles consistent with the header:

```tsx
style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}
```

- [ ] **Step 7: Run frontend build**

Run:

```bash
cd ui
npm run build
```

Expected: build succeeds. The current chunk-size warning is acceptable.

- [ ] **Step 8: Commit frontend auth boundary**

Run:

```bash
git add ui/src/contexts/AuthContext.tsx ui/src/components/LoginPage.tsx ui/src/App.tsx
git commit -m "Harden frontend account boundary"
```

---

### Task 5: Full Verification and Deployment Notes

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `DEPLOY.md`

- [ ] **Step 1: Run backend tests**

Run:

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests -q -p no:cacheprovider
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd ui
npm run build
```

Expected: Vite build succeeds. Existing chunk-size warning is acceptable.

- [ ] **Step 3: Production environment checklist**

Verify these env vars are set in Vercel:

```env
VITE_API_URL=https://acro13f.onrender.com
VITE_SUPABASE_URL=<Supabase project URL>
VITE_SUPABASE_ANON_KEY=<Supabase anon or publishable key>
```

Verify these env vars are set in Render API:

```env
ENV=production
DATABASE_URL=<Neon connection string>
SUPABASE_URL=<Supabase project URL>
SUPABASE_ANON_KEY=<Supabase anon or publishable key>
FRONTEND_URL=https://acro13-f.vercel.app
```

Do not add Supabase service-role keys to Vercel.

- [ ] **Step 4: Manual production UAT**

After deploy:

1. Open `https://acro13-f.vercel.app` signed out.
2. Confirm the login page appears.
3. Sign up or sign in with email/password.
4. Confirm the app loads.
5. Confirm Tracked Funds shows only that user’s tracked funds.
6. Track one fund from Discovery Explorer.
7. Confirm it appears in Tracked Funds.
8. Sign out.
9. Sign in as a second user.
10. Confirm the first user’s newly tracked fund is not automatically tracked for the second user.
11. Trigger the Render cron job.
12. Confirm logs still show `One-shot fund refresh complete.`

- [ ] **Step 5: Final commit if docs changed**

If deployment docs changed in this task, run:

```bash
git add README.md DEPLOY.md
git commit -m "Document account deployment checklist"
```

---

## Self-Review

### Spec Coverage
- Supabase Auth identity: Task 1 and Task 4.
- Neon as app database: Task 1, Task 2, and Task 3 preserve `DatabaseManager` ownership.
- Per-user tracked funds and Explorer state: Task 2.
- Existing tracked funds preserved: Task 3.
- Production missing-auth errors: Task 1 and Task 4.
- Verification: Task 5.

### Placeholder Scan
The plan contains no placeholder markers, no undefined implementation task, and no open-ended error-handling step.

### Type Consistency
The plan uses existing `user_id: str`, Supabase `access_token`, existing `DatabaseManager` methods, and existing React `User | null` / `Session | null` state types.
