# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision

Transform Abrams13F from a functional prototype into a **production-grade, cloud-ready** 13F portfolio tracker. The application should be stable, fast, efficient, and maintainable — ready for multi-user deployment.

## Goals

1. **Fix Data Accuracy** — Resolve portfolio composition calculation bugs (e.g., Giverny fund values incorrect)
2. **Reduce Technical Debt** — Refactor oversized components, add test coverage, clean up codebase
3. **Improve Performance** — Optimize slow operations (dashboard load, chart rendering, SEC sync)
4. **Cloud Readiness** — Migrate from SQLite to production database, add authentication, prepare for multi-user hosting

## Non-Goals (Out of Scope)

- Adding new features beyond current functionality
- Redesigning the UI aesthetic
- Mobile-native applications

## Users

**Primary:** Individual investors and analysts who want to track institutional 13F filings and simulate "following" fund managers.

**Future (Cloud):** Multiple users each tracking their own set of funds with personalized dashboards.

## Constraints

- **Preserve existing functionality** — All current features must continue working
- **Incremental migration** — Cloud infrastructure should be additive, not a full rewrite
- **Budget-conscious** — Prefer cost-effective cloud solutions (serverless, managed DBs)

## Success Criteria

- [ ] Portfolio composition chart shows accurate values for all funds (including Giverny)
- [ ] App.tsx refactored to < 500 lines
- [ ] Core backend services have test coverage
- [ ] Dashboard loads in < 2 seconds
- [ ] Application deploys to cloud with PostgreSQL backend
- [ ] Multi-user authentication functional
