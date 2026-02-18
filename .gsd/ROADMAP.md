# ROADMAP.md

> **Current Phase**: Phase 7 (next up)
> **Milestone**: v3.0 — Online 13F Platform

## v2.0 — Production Ready (CLOSED)

> Closed 2026-02-17. Data accuracy and tech debt items deferred to v3.0.

- [x] Codebase mapped and documented
- [~] Portfolio composition bug investigated (Egerton/Giverny — carried forward)
- [~] Technical debt — deferred, will be addressed during v3.0 refactor
- [~] Performance — deferred, absorbed into v3.0 pre-computation engine
- [~] Cloud readiness — replaced by v3.0 online deployment
- [~] Multi-user auth — deferred to future phase

## v3.0 Phases

### Phase 7: Bulk Data Pipeline
**Status**: ⬜ Not Started
**Objective**: Build automated ingestion of SEC's quarterly 13F data sets for all filers >$100M AUM
**Deliverables**:
- Bulk CSV/ZIP downloader for SEC quarterly 13F data sets (2013–present)
- Parser for flattened SEC data format into database
- PostgreSQL migration (from SQLite) to handle scale
- Summary Engine: pre-compute trade activity, AUM, concentration for each fund/quarter
- Seed database with top 100 funds, then expand to full universe
- Amendment monitor for between-quarter updates

---

### Phase 8: Explore & Screener
**Status**: ⬜ Not Started
**Objective**: Add fund discovery and stock screener pages
**Deliverables**:
- Explore page (`/explore`) with searchable, filterable fund table
- Typeahead search (fund name, manager, ticker held)
- Filter bar: Fund Type, AUM Range, Last Filing, Concentration
- Stock Screener (`/explore/stocks`) — reverse lookup: "who holds this stock?"
- Navigation restructure: My Portfolio vs. Explore

---

### Phase 9: Cloud Deployment
**Status**: ⬜ Not Started
**Objective**: Deploy the application online with production infrastructure
**Deliverables**:
- Containerization (Docker)
- Cloud deployment (Railway/Render/Vercel)
- Environment-based configuration (dev/prod)
- Automated quarterly sync (cron/scheduled task)
- CDN/static asset optimization for frontend

---

### Phase 10: Polish & Performance
**Status**: ⬜ Not Started
**Objective**: Optimize for production traffic and user experience
**Deliverables**:
- API response caching layer
- Frontend performance optimization (lazy loading, code splitting)
- Error handling and monitoring (Sentry or similar)
- SEO basics (meta tags, Open Graph, sitemap)
- Target: all pages load in <100ms
