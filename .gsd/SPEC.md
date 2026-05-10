# SPEC.md — Project Specification

> **Status**: `V4_CLOUD_TRANSITION`

## Vision

Transform Abrams13F from a local, single-user tracker into a **multi-tenant cloud platform**. The platform will maintain a canonical database of SEC 13F filings (Discovery Explorer) that is universally accessible, while giving each user their own personalized portfolio, tracking state, and dashboard.

## Goals

1. **Multi-Tenant Architecture** — Implement user accounts, authentication, and user-scoped data access.
2. **Canonical Data Model** — Separate shared platform data (funds, filings, holdings) from user data (tracked funds, folders).
3. **Background Ingestion** — Automate the SEC sync pipeline to run independently of user actions, ensuring the Explorer is always populated.
4. **Cloud Database** — Complete the migration from local SQLite to a managed PostgreSQL instance.
5. **Production Deployment** — Deploy the frontend, backend, and background workers to production cloud infrastructure.

## Non-Goals (Out of Scope)

- Advanced multi-user collaboration (e.g., sharing folders with other users) is deferred to future versions.
- Mobile-native applications.
- Billing and subscriptions (for now).

## Users

**Primary:** Individual investors and analysts tracking institutional 13F filings. Each user maintains a private universe of tracked funds and personalized dashboards.

## Constraints

- **Data Integrity** — The canonical SEC data must be immutable from the user's perspective.
- **Budget-conscious** — Prefer cost-effective cloud solutions (serverless, managed DBs).

## Success Criteria

- [ ] Multiple users can register, sign in, and maintain independent tracked fund lists.
- [ ] User A tracking a fund does not affect User B.
- [ ] Discovery Explorer shows the full canonical fund universe regardless of user tracking state.
- [ ] Global Overview aggregates only the signed-in user's tracked funds.
- [ ] Application deployed to production with managed PostgreSQL.
