# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v2.0 — Production Ready

## Must-Haves (from SPEC)

- [x] Codebase mapped and documented
- [ ] Portfolio composition bug fixed
- [ ] Technical debt reduced
- [ ] Performance optimized
- [ ] Cloud-ready with multi-user support

## Phases

### Phase 1: Fix Data Accuracy
**Status**: ⬜ Not Started
**Objective**: Resolve portfolio composition calculation bugs
**Deliverables**:
- Investigate Giverny fund calculation discrepancy
- Fix value computation logic in backend/frontend
- Add validation tests for calculation accuracy

---

### Phase 2: Technical Debt Reduction
**Status**: ⬜ Not Started
**Objective**: Refactor oversized components and clean up codebase
**Deliverables**:
- Refactor `App.tsx` (2,209→<500 lines) into smaller modules
- Refactor `HoldingsTable.tsx` (180KB) — extract logic and subcomponents
- Refactor `GlobalDashboard.tsx` (106KB) — componentize
- Remove/organize 15+ debug scripts from root folder
- Set up ESLint/Prettier with consistent rules

---

### Phase 3: Test Infrastructure
**Status**: ⬜ Not Started
**Objective**: Add automated test coverage
**Deliverables**:
- Backend: pytest suite for core services (database, parser, orchestrator)
- Frontend: Vitest/React Testing Library for critical components
- CI pipeline for automated testing

---

### Phase 4: Performance Optimization
**Status**: ⬜ Not Started
**Objective**: Improve load times and responsiveness
**Deliverables**:
- Profile slow operations (dashboard, charts, SEC sync)
- Optimize database queries (add indexes, reduce N+1)
- Implement caching for expensive computations
- Lazy load charts and large data sets
- Target: Dashboard loads < 2 seconds

---

### Phase 5: Cloud Infrastructure
**Status**: ⬜ Not Started
**Objective**: Prepare for cloud deployment with PostgreSQL
**Deliverables**:
- Abstract database layer for PostgreSQL compatibility
- Add SQLAlchemy or async DB adapter
- Environment-based configuration (dev/prod)
- Containerization (Docker)
- Deploy to cloud platform (Railway/Vercel/Render)

---

### Phase 6: Multi-User Authentication
**Status**: ⬜ Not Started
**Objective**: Add user accounts and fund ownership
**Deliverables**:
- Integrate authentication (e.g., Clerk, Auth.js, Supabase Auth)
- User↔Fund ownership model
- Protected API routes
- User-scoped data isolation
