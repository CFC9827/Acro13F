# Design Spec: Accounts and User-Scoped Dashboards

## 1. Objective
Make Abrams13F a real multi-user cloud app before expanding the Discovery Explorer corpus. The app should keep canonical 13F data shared, while tracked funds, groups, favorites, saved state, and future preferences belong to the signed-in user.

This phase uses Supabase Auth for identity only. Neon remains the application database for funds, filings, holdings, metrics, and user-scoped app rows.

## 2. Product Model

### Shared Canonical Data
- `funds`
- `filings`
- `holdings`
- `fund_quarterly_stats`
- price-derived metrics and warehouse metadata

These records are shared across all users and power Discovery Explorer.

### User Data
- `users`
- `user_tracked_funds`
- `user_fund_groups`
- `user_fund_group_members`
- stock favorites
- future saved screens and preferences

These records are keyed by the Supabase Auth user id.

## 3. Auth Flow

### Frontend
- `AuthContext` owns Supabase session state.
- `LoginPage` supports email/password sign in and sign up for v1.
- API calls use `Authorization: Bearer <access_token>`.
- Local development can continue using dev auth when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is absent.
- Production should show the login page when there is no authenticated session.

### Backend
- `backend.services.auth.get_current_user` verifies the Supabase access token using Supabase Auth.
- On first request, the backend upserts the Supabase user into Neon via `users`.
- API routes continue depending on `get_user_id`.
- Production rejects missing auth or missing Supabase config.
- Local development keeps the default dev user fallback.

## 4. Data Migration and Seeding

Existing tracked funds should be preserved for the initial production account. The migration should support a configured bootstrap user id:

```env
INITIAL_USER_ID=<Supabase user id>
```

If set, a one-time script copies the current default user's tracked funds and groups to that Supabase user. It should be idempotent, so running it twice does not duplicate rows.

The default dev user remains only for local development and tests.

## 5. UX Scope

### Included
- Email/password sign in.
- Email/password sign up.
- Sign out.
- Account-aware Tracked Funds dashboard.
- Account-aware Discovery Explorer `is_tracked` state.
- Clear production empty state for a new user with no tracked funds.

### Not Included in v1
- Google OAuth.
- Team accounts.
- Billing.
- Password reset polish beyond Supabase defaults.
- User profile/settings page beyond showing signed-in email if already available.

## 6. Error Handling
- If frontend Supabase env vars are missing in production, show a configuration error instead of a broken login form.
- If backend Supabase env vars are missing in production, API routes should return the existing explicit auth configuration error.
- If a token expires, frontend requests should receive `401` and keep the user on the auth boundary rather than silently using the dev user.

## 7. Security Notes
- Never expose Supabase service-role keys to the frontend.
- Use the Supabase anon/publishable key only in `VITE_SUPABASE_ANON_KEY`.
- Do not authorize from user-editable metadata.
- Treat Supabase JWT `sub` as the user id and store application authorization state in Neon.
- Keep Neon writes behind FastAPI rather than exposing Neon directly to the browser.

## 8. Verification
- Backend tests for production missing-token rejection, valid-token user upsert, and per-user tracked fund isolation.
- Frontend build after auth UI changes.
- Manual production check:
  - signed-out user sees login;
  - signed-in user sees only their tracked funds;
  - tracking a fund updates only that user;
  - cron refresh still refreshes tracked funds without requiring a browser session.

## 9. Follow-On Work
After account v1 is stable, build the broad Discovery Explorer corpus ingestion job. New corpus funds should be inserted as canonical, untracked records. Users opt into them through tracking.
