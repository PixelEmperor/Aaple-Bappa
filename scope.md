# Aaple Bappa — Technical Scope Document

*Mumbai Ganesh Utsav mandal discovery app*

*Version 1.0 — v1 (MVP) Scope*
*Inspired by [Pujo Atlas Kolkata](https://github.com/Pujo-Atlas-Kolkata/PujoAtlasKol-Web)*

---

## 1. Project Overview & Objectives

### What it is
A free, open-source, crowdsourced web application that helps people discover, navigate, and plan visits to Ganpati mandals across the **Mumbai Metropolitan Region (MMR)** — Mumbai, Navi Mumbai, Thane, Kalyan-Dombivli, Vasai-Virar, Panvel and the surrounding towns — during Ganesh Chaturthi, via an interactive map, searchable directory, and (post-v1) live crowd status and route planning.

### Who it's for
- Devotees/visitors planning mandal visits ("pandal hopping")
- Tourists unfamiliar with Mumbai's mandal geography
- Mandal organizers who want their mandal discoverable
- Volunteers/moderators maintaining data quality

### v1 Success Criteria
- 100–300 mandals live and browsable on launch day
- Map and directory load in under 3 seconds on 3G
- Zero-cost infrastructure (stays within free tiers through festival week)
- Mobile-responsive, usable one-handed while walking
- Data pipeline reusable for next year's re-seed without a rebuild

---

## 2. Tech Stack & Justification

| Layer | Choice | Free Tier Limit | Justification |
|---|---|---|---|
| Frontend/Framework | Next.js (TypeScript) | N/A (self-hosted logic) | SSR/SSG for fast map+directory pages; matches Pujo Atlas's proven approach |
| API Layer | tRPC | N/A | End-to-end type safety between frontend and backend without a separate API spec |
| Database | Supabase (Postgres) | 500MB DB, 2 projects | Bundles DB + Auth + Storage; enough capacity for tens of thousands of records |
| Map Tiles | Leaflet + OpenStreetMap | Free, no hard cap (fair-use) | Avoids Mapbox's 50k-load/month cap, which festival-week traffic could exceed |
| Hosting | Vercel | 100GB bandwidth/mo | Best-in-class Next.js support, generous hobby tier |
| CDN/DNS | Cloudflare | Unlimited bandwidth (free plan) | Absorbs festival-week traffic spikes at zero cost |
| Error Tracking | Sentry | 5k errors/mo | Sufficient for project scale; OSS program available if exceeded |
| Analytics | PostHog | 1M events/mo | Privacy-respecting, generous headroom |
| Routing Engine (Phase 3, specced only) | OSRM | Free, self-hostable | Mapbox Directions API free tier (100k req/mo) risks cost during spikes |
| Data Seeding Tooling | Python (pandas, BeautifulSoup, rapidfuzz, Pillow) | N/A (offline scripts) | Best-fit tooling for scraping, cleaning, geocoding, image prep — not part of the live app |
| CI/CD | GitHub Actions | Free for public repos | Standard for open-source projects |
| Domain | .in domain | ~₹500–800/yr (only paid cost) | Everything else above is $0 |

### License
MIT — permissive, no copyleft obligations since no Pujo Atlas code is being forked (inspiration only).

---

## 3. System Architecture

### Component Diagram

```
                         ┌───────────────────────────┐
                         │      Next.js Frontend       │
                         │  (map, directory, forms)    │
                         └─────────────┬───────────────┘
                                       │ tRPC calls
                         ┌─────────────▼───────────────┐
                         │     API Routes (tRPC)        │
                         │  mandals / submissions /     │
                         │  crowdReports / helplines     │
                         └─────────────┬───────────────┘
                                       │
                         ┌─────────────▼───────────────┐
                         │   Supabase (Postgres + PostGIS)│
                         │   + Auth + Storage             │
                         └───────────────────────────────┘

        Offline / one-time:
        ┌───────────────────────────┐
        │  Python Data Pipeline      │
        │  scrape → clean → geocode  │
        │  → compress → import       │────► writes directly to Supabase
        └───────────────────────────┘

        Cross-cutting:
        Cloudflare (CDN/DNS) in front of Vercel
        Sentry (errors) + PostHog (analytics) wired into frontend/API
```

### Request Flows

**Map/directory load**: Browser → Next.js (SSG/ISR for directory listing) → tRPC `mandals.list` → Supabase Postgres (geo-indexed query) → JSON response → Leaflet renders pins.

**New submission**: User fills form → client-side validation → tRPC `submissions.create` → server validates + geocodes (if free-text address) → runs duplicate check → writes to `submissions` table as `pending` → moderator reviews via admin panel → approve writes/copies into `mandals` table.

**Photo upload**: Client uploads file → Supabase Storage bucket (`mandal-photos`) → returns public URL → URL saved on the submission/mandal record → served via Cloudflare cache on read.

**Data seeding (offline)**: Python pipeline runs independently of the live app, writing finished records directly into Supabase Postgres — the web app has no awareness this pipeline exists at runtime.

---

## 4. Data Model / Database Schema

```sql
-- mandals: the core directory table
mandals
├── id                    uuid, pk
├── name                  text, not null
├── slug                  text, unique, not null
├── area                  text, not null            -- e.g. "Lalbaug"
├── zone                  text                       -- MMR-wide: South Mumbai / Central Mumbai / Western Suburbs / Eastern Suburbs / Navi Mumbai / Thane / Kalyan-Dombivli / Mira-Bhayandar / Vasai-Virar / Bhiwandi / Ulhasnagar-Ambernath-Badlapur / Panvel-Uran / Other (MMR)
├── lat                   double precision, not null
├── lng                   double precision, not null
├── established_year      int, nullable
├── description           text, nullable             -- short blurb, capped ~300 chars
├── history               text, nullable              -- longer optional text
├── nearest_station       text, nullable
├── tags                  text[], nullable            -- predefined list: eco-friendly, tallest, oldest, richest, family-friendly
├── timings               text, nullable              -- free text for v1, e.g. "6 AM – 12 AM"
├── official_contact      text, nullable
├── photo_url             text, nullable              -- single image per mandal
├── is_public             boolean, default true       -- false for private/society mandals opting out
├── source                text, not null              -- 'seed' | 'crowdsourced' | 'official'
├── verification_status   text, not null default 'unverified'  -- 'unverified' | 'verified' | 'flagged'
├── created_at            timestamptz, default now()
├── updated_at            timestamptz, default now()

-- submissions: moderation queue, nothing here is public until approved
submissions
├── id                    uuid, pk
├── type                  text, not null              -- 'new_mandal' | 'edit_mandal'
├── payload               jsonb, not null              -- proposed field values
├── mandal_id             uuid, fk → mandals.id, nullable  -- set only for edits
├── submitter_contact     text, nullable               -- not shown publicly
├── status                text, not null default 'pending'  -- 'pending' | 'approved' | 'rejected'
├── moderator_notes       text, nullable
├── submitted_at          timestamptz, default now()
├── reviewed_at            timestamptz, nullable

-- crowd_reports: Phase 2, self-reported live status
crowd_reports
├── id                    uuid, pk
├── mandal_id             uuid, fk → mandals.id, not null
├── status                text, not null               -- 'low' | 'moderate' | 'heavy'
├── reporter_session_id   text, not null                -- anonymous, for rate-limiting only, no PII
├── reported_at           timestamptz, default now()

-- helplines: static reference content
helplines
├── id                    uuid, pk
├── category              text, not null               -- 'police' | 'medical' | 'traffic' | 'bmc_control_room'
├── area                  text, nullable                -- null = citywide
├── phone                 text, not null
├── notes                 text, nullable
```

### Indexes
- `mandals(lat, lng)` — geo-indexed (PostGIS `GEOGRAPHY` column recommended over raw lat/lng once query volume grows, for accurate distance sorting)
- `mandals(slug)` — unique index for fast detail-page lookups
- `mandals(area)`, `mandals(zone)` — for filter queries
- `submissions(status)` — for moderation queue filtering
- `crowd_reports(mandal_id, reported_at)` — for fetching recent reports per mandal efficiently

---

## 5. Data Seeding Pipeline (Python)

Runs entirely offline/pre-launch, separate from the live app's request path.

### Pipeline Stages

1. **Scrape**: BeautifulSoup/requests scripts pull mandal listings (name, area, description) from public listicle sources into raw JSON/CSV.
2. **Clean & Dedupe**: pandas + rapidfuzz normalize names and area spellings, flag likely duplicates across sources for manual review before import.
3. **Geocode**: For entries missing lat/lng, batch through Nominatim (OSM's free geocoder) with rate-limit-aware throttling; outliers spot-checked manually against a map.
4. **Image Prep**: Pillow batch-resizes/compresses seed photos (target ~1200px wide, JPEG quality ~75) before upload, keeping Supabase Storage usage low from day one.
5. **Import**: Final script (using `supabase-py` or `psycopg2`) writes cleaned records directly into the `mandals` table with `source = 'seed'`.

### Repo Structure
```
/data-pipeline
  ├── scrape.py
  ├── clean.py
  ├── geocode.py
  ├── compress_images.py
  ├── import_to_supabase.py
  └── seed_data/           # intermediate CSV/JSON artifacts
```

Runnable manually during initial seeding, and re-runnable via a GitHub Action for next year's refresh cycle.

---

## 6. Feature Specification by Module

### 6.1 Directory / Search & Filter
- **Input**: search text, area filter, zone filter, tag filter
- **Output**: paginated list of matching mandals (card view: name, area, thumbnail, tags)
- **Edge cases**: empty search results, area names with inconsistent casing/spelling
- **Acceptance criteria**: results return in under 500ms for the seeded v1 dataset size

### 6.2 Map View
- **Input**: current viewport bounds (for clustering), optional filter state carried over from directory
- **Output**: clustered pins that expand on zoom, popups with mini mandal card on pin click
- **Edge cases**: dense pin clusters in areas like Lalbaug/Girgaon; pins with missing/invalid coordinates should never render (validated at write-time, not runtime)
- **Acceptance criteria**: smooth pan/zoom on a mid-range mobile device with 300 pins loaded

### 6.3 Mandal Detail Page
- **Input**: slug (URL param)
- **Output**: full mandal record — name, photo, description, history, timings, tags, nearest station, mini-map
- **Edge cases**: 404 for unknown/unpublished slugs; missing optional fields render gracefully (no broken layout)
- **Acceptance criteria**: SSG/ISR generated for fast load, works without JS for core content

### 6.4 Submission Form (New Mandal / Edit)
- **Input**: name, area, location (map-pin-drop preferred over free-text address), submitter contact, plus optional fields (photo, established year, timings, station, description, tags, contact, public/private toggle)
- **Output**: writes to `submissions` table as `pending`
- **Validation**: required-field checks client + server side; server-side duplicate-name/proximity check with a "did you mean X?" warning before final submit; image type/size validation on upload
- **Edge cases**: duplicate submissions for the same mandal from different users; malformed/spam text
- **Acceptance criteria**: submission completes in under 2 minutes for a motivated user on mobile

### 6.5 Moderation Queue / Admin Panel
- **Input**: moderator login (Supabase Auth), queue of `pending` submissions
- **Output**: approve (writes/merges into `mandals`) or reject (with optional notes) actions
- **Edge cases**: conflicting edits to the same mandal submitted concurrently — last-approved-wins with an audit trail via `moderator_notes`
- **Acceptance criteria**: moderator can review and act on a submission in under 30 seconds

### 6.6 Crowd Status Reporting (Phase 2)
- **Input**: mandal_id, status selection, anonymous session id
- **Output**: writes to `crowd_reports`; mandal detail page shows most recent aggregated status
- **Rate limiting**: one report per session per mandal per time window (e.g. 15 minutes) to prevent spam
- **Edge cases**: sparse reports (show "no recent reports" rather than stale data past a freshness threshold, e.g. 2 hours)

### 6.7 Route/Pandal-Hopping Planner (Phase 3 — specced, out of v1 build)
- **Input**: start location, selected mandals
- **Output**: ordered visiting sequence with estimated distances/times
- **v1-simple approach**: straight-line distance sort
- **Later approach**: OSRM-based walking/driving directions
- Documented here for continuity but explicitly excluded from v1 build (see Section 15)

---

## 7. API Design (tRPC Procedures)

| Procedure | Input | Output | Notes |
|---|---|---|---|
| `mandals.list` | filters (area, zone, tags, search, pagination) | `Mandal[]` | Public, powers directory + map |
| `mandals.getBySlug` | slug | `Mandal` | Public, powers detail page |
| `submissions.create` | new mandal or edit payload | submission id | Public, rate-limited |
| `submissions.list` | status filter | `Submission[]` | Moderator-only |
| `submissions.review` | submission id, decision, notes | updated submission | Moderator-only, triggers write to `mandals` on approve |
| `crowdReports.report` | mandal_id, status, session_id | report id | Public, rate-limited server-side |
| `crowdReports.getRecent` | mandal_id | latest aggregated status | Public |
| `helplines.list` | area (optional) | `Helpline[]` | Public, static-ish data |

---

## 8. Storage & Image Handling

- **Bucket**: `mandal-photos` in Supabase Storage, public read access
- **Upload flow**: client uploads (submission form) or seeding script uploads (bulk) → stored at `{slug}.jpg` → public URL saved to `photo_url`
- **Validation**: server-side file type check (JPEG/PNG/WebP only), max file size (e.g. 2MB pre-compression), reject on failure with clear error
- **Compression**: enforced both at seeding time (Pillow) and ideally client-side (browser canvas resize) before upload to control bandwidth
- **Access policy**: public read; write restricted to authenticated requests (submission API validates before forwarding to storage, not direct client-to-bucket writes for arbitrary paths)
- **Caching**: Cloudflare cache rule on the storage bucket's domain to reduce repeat Supabase bandwidth usage during traffic spikes

---

## 9. Authentication & Authorization

- **Public users**: no account required to browse, search, or submit — submissions and crowd reports use anonymous session identifiers only, no PII stored beyond optional submitter contact
- **Moderators**: Supabase Auth (email/password or magic link), role flag stored in a `moderators` table or Supabase custom claims
- **Admin panel access**: gated route, checks moderator role server-side on every request, not just client-side route guarding

---

## 10. Security & Abuse Prevention

- **Rate limiting**: per-session/IP limits on `submissions.create` and `crowdReports.report` to prevent spam/flooding
- **Input validation**: server-side validation on all write procedures, never trust client-side checks alone
- **Duplicate/spam detection**: fuzzy name + proximity matching on submission (reuses seeding pipeline's rapidfuzz logic, ported to the live API or called via a small internal endpoint)
- **Image validation**: type/size checks server-side before accepting into storage
- **Row Level Security (RLS)**: Supabase RLS policies enforce that public role can only read `mandals` where published, and can only insert (not update/delete) into `submissions`/`crowd_reports`
- **Moderation gate**: nothing from public submissions reaches the live `mandals` table without explicit moderator approval

---

## 11. Non-Functional Requirements

| Category | Target |
|---|---|
| Page load (directory/map) | Under 3s on 3G, under 1s on broadband |
| Map interaction | Smooth pan/zoom with 300+ pins on mid-range mobile |
| Expected peak load | Festival week traffic spike — architecture must degrade gracefully (CDN caching, no single point of DB overload) |
| Mobile support | Mobile-first responsive design, primary usage assumed to be on-the-go mobile |
| Accessibility | Basic WCAG AA: alt text on images, sufficient color contrast, keyboard-navigable forms |
| Uptime | Best-effort on free tiers; Cloudflare absorbs traffic spikes ahead of origin |

---

## 12. Deployment & Environments

- **Environments**: `dev` (local), `staging` (Vercel preview deploys per PR), `prod` (Vercel production, custom domain via Cloudflare)
- **CI/CD**: GitHub Actions — lint/typecheck/test on PR, auto-deploy to Vercel preview; merge to `main` triggers production deploy
- **Secrets management**: Supabase keys, Sentry DSN, PostHog key stored as Vercel environment variables, never committed to repo
- **Database migrations**: tracked via Supabase migration files, applied via CI before deploy or manually for v1 simplicity

---

## 13. Testing Strategy

| Type | Scope |
|---|---|
| Unit tests | tRPC procedure logic (validation, duplicate detection), utility functions (slug generation, geocoding wrapper) |
| Integration tests | API → DB flow for core procedures (`mandals.list`, `submissions.create`) |
| Manual QA | Map interaction/UX, mobile responsiveness across devices, submission form usability |
| Load testing | Simulate festival-week traffic spike against staging before launch (basic tool like k6, not exhaustive) |

---

## 14. Technical Milestones & Build Order

Dependency-ordered (not calendar-dated — see the earlier project timeline for that):

1. Repo scaffold, schema design, Supabase project setup
2. Data seeding pipeline (Python) — produces first clean dataset
3. Core tRPC API (`mandals.list`, `mandals.getBySlug`)
4. Directory page + Map page (frontend)
5. Mandal detail page
6. Submission form + `submissions.create` API
7. Moderation admin panel + `submissions.review` API
8. Crowd status reporting (`crowdReports.*`)
9. Helplines static content
10. Load testing, performance tuning, launch prep

---

## 15. Out of Scope for v1

Explicitly deferred to Phase 3/4:
- Route/pandal-hopping planner (OSRM integration)
- ML-assisted moderation (spam/image classifiers)
- Crowd-level prediction models
- Native mobile apps
- Multi-language support (Marathi/Hindi)
- Donation/payment features
- PWA/offline support

---

## 16. Open Technical Risks / Decisions

| Risk/Decision | Options | Notes |
|---|---|---|
| Routing engine hosting | Self-host OSRM vs public demo server | Deferred to Phase 3, but worth prototyping early if time allows |
| Image moderation | Manual-only vs classifier-assisted | v1 is manual; revisit if submission volume overwhelms moderators |
| Nominatim rate limits | Batch geocoding may need throttling/retry logic | 1 req/sec fair-use limit — plan pipeline timing accordingly |
| Supabase free-tier pause | Project pauses after 7 days inactivity in dev | Manageable, but factor into demo/testing cadence pre-launch |
| Geo-indexing approach | Raw lat/lng vs PostGIS `GEOGRAPHY` type | Start simple (raw columns), migrate to PostGIS if distance-based queries (e.g. route planner) demand it |

---

## Appendix: Repository Structure (proposed)

```
/apps
  /web              # Next.js app
/data-pipeline       # Python seeding scripts
/supabase
  /migrations        # SQL migration files
/docs
  scope-document.md  # this file
  design-plan.md
```
