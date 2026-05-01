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
**Status**: 🟡 In Progress
**Objective**: Build automated ingestion of SEC's quarterly 13F data sets for all filers >$100M AUM
**Deliverables**:
- [x] Bulk CSV/ZIP downloader for SEC quarterly 13F data sets (2013–present)
- [x] Parser for flattened SEC data format into database
- [x] PostgreSQL migration (from SQLite) to handle scale (COMPLETED)
- [x] Summary Engine: pre-compute trade activity, AUM, concentration for each fund/quarter
- [x] Seed database with top 100 funds, then expand to full universe
- [ ] Amendment monitor for between-quarter updates

---

### Phase 8: Explore & Screener
**Status**: ✅ Completed
**Objective**: Add fund discovery and stock screener pages
**Deliverables**:
- [x] Explore page (`/explore`) with searchable, filterable fund table
- [x] Typeahead search (fund name, manager, ticker held)
- [x] Filter bar: Fund Type, AUM Range, Last Filing, Concentration
- [x] Stock Screener (Reverse lookup) unified into Discovery Explorer
- [x] Navigation restructure: My Portfolio vs. Explore
- [x] Multi-factor logic (AND/OR) per-row in builder
- [x] Premium UI overhaul (Glassmorphism, dark mode polish)
- [x] Frictionless Navigation: Clickable fund names across Global Dashboard
- [x] Track Fund Toggle: Integrated into analysis view for quick watchlisting
- [x] Performance CSV Export: Standardized export for fund performance tab
- [x] Crowding Signal Refinement: Fixed KPI count discrepancy and improved tooltip accuracy
- [x] UI Aesthetic Polish: Removed fund link underlines and matched font sizes across Dashboard sections
- [x] Consensus View Integration: Clickable tickers across Dashboard routing to Stock Consensus view

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
