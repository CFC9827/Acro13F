# ROADMAP.md

> **Current Phase**: Phase 3: Build The Canonical Fund Universe
> **Milestone**: v4.0 — Cloud Multi-User Platform

## v2.0 — Production Ready (CLOSED)

> Closed 2026-02-17. Data accuracy and tech debt items deferred to v3.0.

- [x] Codebase mapped and documented
- [~] Portfolio composition bug investigated (Egerton/Giverny — carried forward)
- [~] Technical debt — deferred, will be addressed during v3.0 refactor
- [~] Performance — deferred, absorbed into v3.0 pre-computation engine
- [~] Cloud readiness — replaced by v3.0 online deployment
- [~] Multi-user auth — deferred to future phase

## v3.0 — Online 13F Platform (CLOSED)

> Closed 2026-05-06. Dashboard and Explorer refined. Cloud features pushed to v4.0.

- [x] Bulk CSV/ZIP downloader for SEC quarterly 13F data
- [x] Explore page and Stock Screener integration
- [x] Interactive Dashboard Sections and Institutional Holder Explorer
- [x] Advanced Consensus Metrics and Sorting Logic
- [x] SQLite database implemented (postgres deferred)

## v4.0 — Cloud Transition & Multi-Tenant SaaS
**Objective:** Transition Abrams13F into a scalable, multi-user SaaS platform. Each user will have their own individual account, login, and personalized dashboard (their own tracked funds and folders). Behind the scenes, all users will seamlessly draw from a single, shared, canonical database of SEC filings and stock prices maintained automatically by our ingestion engine.

### Phase 1: Separate Platform Data From User Data
**Status**: ✅ Complete
**Deliverables**:
- [x] Define canonical models (funds, filings, holdings, fund_quarterly_stats)
- [x] Define user-scoped models (users, user_tracked_funds, user_fund_groups, user_fund_group_members)
- [x] Remove global `funds.is_tracked` logic

### Phase 2: Move Fully To Postgres (Supabase)
**Status**: ✅ Complete
**Deliverables**:
- [x] Supabase Postgres pooler connected and verified
- [x] Alembic migration system initialized with initial cloud schema
- [x] Performance indexes added for user-scoped queries
- [x] Legacy fund_groups data migrated to user_fund_groups

### Phase 3: Build The Canonical Fund Universe
**Status**: ✅ Complete (Infrastructure), 🟡 Deferred (Bulk Data)
**Deliverables**:
- [x] Build background ingestion worker (`worker.py`) for SEC data independent of users
- [x] Implement proactive daily price sync for all tickers in the database
- [x] Automate `fund_quarterly_stats` pre-computation pipeline
- [x] Add `fund_ingestion_status` tracking and logging system
- [ ] **Deferred**: Run `BulkIngestor` for entire SEC universe (awaiting Phase 4 stability)

### Phase 4: Change Tracking Semantics
**Status**: ⬜ Not Started
**Deliverables**:
- [ ] Update tracking API to use `user_tracked_funds` table
- [ ] Ensure tracking does NOT trigger SEC downloads
- [ ] Untracking removes user references without deleting canonical data

### Phase 5: Make Global Overview User-Scoped
**Status**: ✅ Complete
**Deliverables**:
- [x] Update dashboard endpoints to require auth and scope by `user_id`
- [x] Dashboard defaults to current user's tracked funds

### Phase 6: Update Sidebar And Folder Logic
**Status**: ⬜ Not Started
**Deliverables**:
- [ ] Sidebar and Folders load from user-specific endpoints
- [ ] Folder membership implies/requires fund tracking

### Phase 7: Update The UI Behavior
**Status**: ⬜ Not Started
**Deliverables**:
- [x] Discovery Explorer tracking states updated correctly
- [ ] Hover states ("Remove") and immediate UI un-tracking
- [ ] Search modal changes to "Request fund" if missing

### Phase 8: Add Authentication And Accounts
**Status**: ✅ Complete (Supabase Auth)
**Deliverables**:
- [x] Add backend auth (JWT/Session) and provider (Supabase Auth)
- [x] User sign up, sign in, sign out
- [x] Protected API routes (fetchWithAuth integration)

### Phase 9: Cloud Deployment Architecture
**Status**: ⬜ Not Started
**Deliverables**:
- [ ] Deploy frontend (Vercel/Netlify/etc.)
- [ ] Deploy backend API (Render/Railway/etc.)
- [ ] Deploy Postgres
- [ ] Deploy SEC ingestion background worker

### Phase 10: Migration Path
**Status**: ⬜ Not Started
**Deliverables**:
- [ ] Freeze SQLite and migrate canonical data to Postgres
- [ ] Migrate local `is_tracked` to single initial user account
- [ ] Run data verification and deploy to staging
