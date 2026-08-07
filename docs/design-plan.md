# Aaple Bappa — Implementation Plan (v1)

*Ganesh Utsav mandal discovery across the Mumbai Metropolitan Region (MMR) — interactive map, directory, and crowdsourced submissions.*

*Companion to [`scope.md`](../scope.md). Version 1.0.*

**v1 build boundary:** Core browse + moderation. In scope: seeding pipeline, directory, map,
detail page, submission form, moderation admin, helplines. **Deferred:** crowd reports (Phase 2),
route planner (Phase 3), everything in scope §15.

**Team assumption:** solo developer. Tasks are sequenced linearly; process overhead is kept minimal
(no monorepo tooling, no per-workstream interface contracts). Where a decision was left open in
scope §16, it is resolved below for v1.

---

## 0. Resolved Decisions (locking scope §16 open items for v1)

| Decision | v1 choice | Rationale |
|---|---|---|
| Geo-indexing | **Raw `lat`/`lng` `double precision`**, no PostGIS | v1 has no distance-sorted queries (route planner is Phase 3). B-tree on `(area, zone)` + client-side bbox filtering covers directory/map. Migrate to `GEOGRAPHY` only when Phase 3 lands. |
| Repo layout | **Single repo, no workspace tooling** (`/apps/web`, `/data-pipeline`, `/supabase`, `/docs`) | Solo dev; Turborepo/pnpm-workspace overhead unjustified for one deployable app. |
| Validation | **Zod**, shared schemas between client + tRPC | Single source of truth; tRPC-native. |
| Package manager | **pnpm** | Fast, disk-efficient, Vercel-supported. |
| Unit/integration tests | **Vitest** | Fast, TS-native, works with tRPC caller pattern. |
| Live duplicate detection | **JS port** (`fast-fuzzy` or `fuse.js` for name + haversine for proximity) inside `submissions.create` | Avoids standing up a Python service; the Python rapidfuzz logic stays offline-only. |
| Map clustering | **`react-leaflet` + `supercluster`** (via `use-supercluster`) | Handles 300 pins smoothly; clustering computed client-side from a single dataset fetch. |
| Moderator auth | **Supabase Auth (email/password)** + `moderators` table role check | Simplest for a handful of trusted moderators; no magic-link email deliverability risk on free tier. |
| Rendering strategy | Directory/detail = **ISR** (`revalidate: 3600`); map = client-rendered island | Fast cached loads; content changes infrequently post-approval. |
| Secrets | **Vercel env vars + `.env.local`** (gitignored); service-role key **server-only** | OWASP; never ship service role to client. |

---

## 1. Architecture at a Glance (v1)

```
Browser ──▶ Next.js App Router (Vercel, behind Cloudflare)
              │
              ├─ ISR pages: /  (directory)   /mandal/[slug]  /helplines
              ├─ Client island: Leaflet map (/map)
              └─ tRPC (/api/trpc/*)
                    │  public procs use anon client + RLS
                    │  moderator procs use authed session + role check
                    ▼
              Supabase (Postgres, Auth, Storage bucket `mandal-photos`)
                    ▲
                    │ one-time / yearly, offline
              Python data-pipeline (scrape→clean→geocode→compress→import)

Cross-cutting: Sentry (errors), PostHog (analytics), GitHub Actions (CI).
```

Two Supabase client instances in the web app:
- **Anon client** — RLS-restricted, used for public reads and public inserts to `submissions`.
- **Service-role client** — server-only (tRPC context), used for moderator writes to `mandals`
  and privileged reads of the moderation queue. Never imported into a Client Component.

---

## 2. Milestone 0 — Scaffold & Tooling

**Goal:** a deployable "hello world" on Vercel behind Cloudflare, with CI green.

Tasks:
- [x] `pnpm create next-app@latest apps/web` — TypeScript, App Router, ESLint, Tailwind, `src/` dir.
- [x] Add `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`, `zod`, `superjson`.
- [x] Add `@supabase/supabase-js`, `@supabase/ssr`.
- [x] Configure ESLint + Prettier + `strict: true` in tsconfig. Add `typecheck` script.
- [x] Configure Vitest (`vitest.config.mts`, jsdom for component-light unit tests).
- [x] `.env.example` documenting every required var; `.env.local` gitignored.
- [x] Init git repo, push to GitHub (public, MIT `LICENSE`).
- [ ] Vercel project linked to repo; Cloudflare DNS in front (proxied) — defer custom domain until launch prep.
- [x] GitHub Actions: `ci.yml` running `lint`, `typecheck`, `test`, `build` on PR.

> **Note:** scaffolded on Next.js 16 (not 14/15 as originally planned when this doc was written) —
> released after this plan's tech choices were locked in, but it's the current stable major version
> and the App Router/tRPC/Supabase patterns below are unaffected. Two conventions differ from
> Next.js ≤15: `params`/`searchParams`/`cookies()`/`headers()` are async-only (no sync fallback), and
> auth session refresh (Milestone 8) must use a `proxy.ts` file exporting `proxy()`, not
> `middleware.ts`/`middleware()` — see `apps/web/node_modules/next/dist/docs/` for version-matched
> reference before writing route/proxy code.

**Env vars to define:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`.

**Acceptance:** `pnpm build` passes locally and in CI; Vercel preview deploy renders a placeholder page.

---

## 3. Milestone 1 — Database Schema & Supabase Setup

**Goal:** schema, indexes, RLS, and storage bucket provisioned via tracked migrations.

Tasks:
- [ ] `supabase init`; create project (note: free-tier pauses after 7 days idle — see §Risks).
- [ ] Migration `0001_core_schema.sql` — `mandals`, `submissions`, `helplines`, `moderators`.
      (Omit `crowd_reports` — deferred; add in a Phase-2 migration.)
- [ ] Migration `0002_indexes.sql` — unique `slug`; b-tree on `area`, `zone`, `submissions(status)`.
- [ ] Migration `0003_rls.sql` — policies below.
- [ ] Create Storage bucket `mandal-photos` (public read).
- [ ] Seed `moderators` with the founder's auth UID after first login.

Key RLS policies (public = `anon` role):
```sql
-- mandals: public reads only published+public rows
alter table mandals enable row level security;
create policy mandals_public_read on mandals
  for select using (is_public = true and verification_status <> 'flagged');

-- submissions: public may INSERT only; never select/update/delete
alter table submissions enable row level security;
create policy submissions_public_insert on submissions
  for insert with check (status = 'pending');

-- helplines: public read
alter table helplines enable row level security;
create policy helplines_public_read on helplines for select using (true);
```
Moderator/service-role writes bypass RLS (service key) — authorization is enforced in the tRPC
`moderatorProcedure` middleware, **not** at the DB layer, so the check lives in one auditable place.

**Slug rule:** `slugify(name)`; on collision append `-{area-slug}`, then `-2`, `-3`. Generated at
write time (seeding + approval), never at read time. Invalid coordinates (null/NaN/out-of-Mumbai-bbox)
rejected before insert so §6.2's "pins never render broken" holds by construction.

**Acceptance:** migrations apply cleanly to a fresh DB; anon key can read `mandals` but cannot
update; anon insert into `submissions` succeeds only with `status='pending'`.

---

## 4. Milestone 2 — Data Seeding Pipeline (Python)

**Goal:** first clean dataset of 100–300 mandals in the `mandals` table, re-runnable next year.

> **Start data collection NOW — ahead of the code.** Data is the long pole and is fully decoupled from
> the app build (that is the point of the offline pipeline). Nominatim's 1 req/sec limit and manual
> dedup/verification are wall-clock-bound, so early start de-risks the launch. Begin *rough* collection
> into a simple sheet whose columns map to the `mandals` schema (§4), one row per mandal with a `source`
> URL for provenance. Lock the sheet's columns to the schema before scaling past ~30 rows so the import
> script has a stable target. See the chat note for the concrete kickstart plan.

Structure (`/data-pipeline`, per scope §5): `scrape.py`, `clean.py`, `geocode.py`,
`compress_images.py`, `import_to_supabase.py`, `seed_data/` (gitignored intermediates), `requirements.txt`.

Tasks:
- [ ] `scrape.py` — BeautifulSoup/requests over public listicle sources → raw CSV/JSON. Respect robots.txt; cache raw HTML locally to avoid re-hitting sources.
- [ ] `clean.py` — pandas normalize name/area casing; `rapidfuzz` flag near-duplicates to a review CSV for **manual** resolution before import.
- [ ] `geocode.py` — Nominatim for missing coords, **1 req/sec throttle** + retry/backoff (scope §16 fair-use limit); write a `geocode_confidence` column; flag outliers outside Mumbai bbox for manual spot-check.
- [ ] `compress_images.py` — Pillow resize to ~1200px wide, JPEG q≈75.
- [ ] `import_to_supabase.py` — `supabase-py`; idempotent upsert on `slug`; sets `source='seed'`, `verification_status='verified'`. Uploads photos to `mandal-photos` as `{slug}.jpg`, saves public URL.

**Determinism/idempotency:** import must be safe to re-run (upsert, not blind insert) so a partial
failure mid-batch can resume. Log every skipped/flagged row; never silently drop.

**Acceptance:** running the pipeline end-to-end from empty produces ≥100 valid, coordinate-checked
mandals visible via the anon read policy. Re-running changes nothing (idempotent).

---

## 5. Milestone 3 — Core Read API (tRPC)

**Goal:** `mandals.list` and `mandals.getBySlug` — the foundation for directory, map, detail.

Tasks:
- [ ] tRPC scaffold: `src/server/trpc.ts` (init, superjson, error formatter with Zod flattening), `src/server/context.ts` (request + Supabase clients + session), `src/server/routers/_app.ts`.
- [ ] `publicProcedure` (anon client) and `moderatorProcedure` (session + `moderators` check) base procedures.
- [ ] `mandals.list` — input: `{ search?, area?, zone?, tags?[], page?, pageSize? }` (Zod). Server-side filter + pagination; returns `{ items: Mandal[], total, page }`.
- [ ] `mandals.getBySlug` — input `{ slug }`; returns full record or `NOT_FOUND` (drives 404).
- [ ] Shared Zod schemas + inferred `Mandal` type in `src/shared/schemas.ts`, imported by both client and server.
- [ ] Next.js route handler `src/app/api/trpc/[trpc]/route.ts`; client provider in `src/app/providers.tsx`.

**Testing (Vitest):** unit-test slug generation and the list filter/pagination logic; one integration
test hitting `mandals.list` against a seeded local Supabase. Target ≥80% coverage on new procedure logic (org standard).

**Acceptance:** `mandals.list` returns filtered/paginated results in <500ms on the seeded dataset
(scope §6.1); `getBySlug` returns `NOT_FOUND` for unknown slug.

---

## 6. Milestone 4 — Directory Page

**Goal:** searchable, filterable card grid at `/`.

Tasks:
- [ ] ISR page (`revalidate: 3600`) SSG-rendering the first page of `mandals.list`.
- [ ] Card component: name, area, thumbnail (`next/image`), tag chips. Graceful missing-photo placeholder.
- [ ] Filter bar: text search (debounced), area select, zone select, tag multi-select. Filter state in URL query params (shareable, and carried into the map view per scope §6.2).
- [ ] Client-side data via tRPC-react-query; keep filter state in sync with URL.
- [ ] Empty-state UI for zero results.
- [ ] Accessibility: keyboard-navigable filters, alt text on thumbnails, AA contrast (org + scope §11).

**Acceptance:** filtering returns results <500ms on seeded data; page usable one-handed on mobile;
Lighthouse mobile perf reasonable on throttled 3G (<3s, scope §11 — verified in Milestone 9).

---

## 7. Milestone 5 — Map View

**Goal:** clustered pin map at `/map` sharing the directory's filter state.

Tasks:
- [ ] `react-leaflet` map, OSM tiles, `dynamic(() => ..., { ssr: false })` (Leaflet needs `window`).
- [ ] Single fetch of filtered mandals (lat/lng/name/slug/thumbnail) → `supercluster` for clustering.
- [ ] Clusters expand on zoom; pin click opens popup with mini-card linking to detail page.
- [ ] Read filter state from same URL params as directory; a "View on map" link on directory carries them over.
- [ ] Guard: pins with invalid coords already excluded at write-time (Milestone 1) — assert in a dev-only check, don't silently filter at runtime.

**Acceptance:** smooth pan/zoom with 300 pins on mid-range mobile (scope §6.2); dense Lalbaug/Girgaon
areas cluster rather than overlap.

---

## 8. Milestone 6 — Mandal Detail Page

**Goal:** full record at `/mandal/[slug]`.

Tasks:
- [ ] `generateStaticParams` from all published slugs; ISR `revalidate: 3600`.
- [ ] Layout: photo, name, description, history, timings, tags, nearest station, mini-map (single-pin Leaflet island).
- [ ] Core content renders server-side (works without JS, scope §6.3); mini-map is a progressive-enhancement island.
- [ ] `notFound()` for unknown/unpublished slug → 404.
- [ ] Graceful rendering when optional fields are null (no broken layout).
- [ ] Basic SEO/OpenGraph metadata per mandal.

**Acceptance:** SSG/ISR fast load; core content visible with JS disabled; clean 404 for bad slug.

---

## 9. Milestone 7 — Submission Form + `submissions.create`

**Goal:** public can propose new mandals / edits into the moderation queue.

Tasks:
- [ ] Multi-step form at `/submit`: name, area, **map-pin drop** (preferred over free-text address), optional fields (photo, established year, timings, station, description, tags, contact, public/private), submitter contact.
- [ ] Client-side image compression (browser canvas) before upload; type (JPEG/PNG/WebP) + size (≤2MB) check client + server.
- [ ] `submissions.create` (publicProcedure, Zod-validated): geocode if only free-text address given; run **live duplicate check** (fuzzy name + haversine proximity) → return `{ status: 'possible_duplicate', matches }` for a "did you mean X?" confirm step before final write.
- [ ] On confirm: insert to `submissions` as `pending` with `type` and `payload` jsonb.
- [ ] Photo upload path: client → `submissions.create` validates → server forwards to `mandal-photos` (no direct client-to-arbitrary-path writes, scope §8).
- [ ] **Rate limiting** on `submissions.create`: per-session + per-IP window (e.g. token bucket in a `rate_limits` table or Upstash free tier). Fail closed with a clear message.

**Testing:** unit-test duplicate detection (name variants + proximity thresholds) and payload
validation; these are the highest-risk logic paths.

**Acceptance:** motivated mobile user completes a submission in <2min (scope §6.4); duplicate warning
fires for a near-match; oversized/wrong-type image rejected server-side.

---

## 10. Milestone 8 — Auth + Moderation Admin Panel + `submissions.review`

**Goal:** moderators review the queue and approve/reject.

Tasks:
- [ ] Supabase Auth email/password; login at `/admin/login`.
- [ ] `moderatorProcedure` middleware: verify session + row in `moderators`; throw `UNAUTHORIZED` otherwise. Applied server-side on every moderator proc (not just client route guard, scope §9).
- [ ] Gated `/admin` layout: server-side session + role check on every request.
- [ ] `submissions.list` (moderator): filter by status, paginated queue.
- [ ] Queue UI: side-by-side proposed payload vs existing mandal (for edits); approve / reject with `moderator_notes`.
- [ ] `submissions.review` (moderator): on **approve** → upsert into `mandals` (new: generate slug, `source='crowdsourced'`; edit: merge payload into existing row), set submission `approved` + `reviewed_at`; on **reject** → set `rejected` + notes. Wrap in a transaction.
- [ ] Concurrent-edit handling: last-approved-wins, prior state captured in `moderator_notes` as the audit trail (scope §6.5).
- [ ] Approving a mandal triggers ISR revalidation of `/` and `/mandal/[slug]` (`revalidatePath` / on-demand revalidation).

**Testing:** integration test the full submit→approve→appears-in-`mandals.list` flow.

**Acceptance:** moderator reviews + acts on a submission in <30s (scope §6.5); approved mandal appears
publicly after revalidation; non-moderator hitting `/admin` or a moderator proc is rejected server-side.

---

## 11. Milestone 9 — Helplines (static reference)

**Goal:** `/helplines` page from the `helplines` table.

Tasks:
- [ ] Seed `helplines` (police / medical / traffic / bmc_control_room; area-scoped or citywide) via a small migration or the seeding pipeline.
- [ ] `helplines.list` (public, optional area filter).
- [ ] ISR page grouping by category, `tel:` links, area labels.

**Acceptance:** page lists helplines grouped by category; `tel:` links dial on mobile.

---

## 12. Milestone 10 — Observability, Performance & Launch Prep

**Goal:** production-ready, measured against scope §11 non-functional targets.

Tasks:
- [ ] Wire Sentry (client + server) and PostHog (privacy-respecting, no PII).
- [ ] Cloudflare cache rule on the Storage bucket domain (scope §8) to cut repeat Supabase bandwidth.
- [ ] Custom `.in` domain via Cloudflare; production Vercel deploy.
- [ ] **Load test** (k6) against staging simulating festival-week spike (scope §13); confirm CDN caching absorbs it and DB isn't a single point of overload.
- [ ] Lighthouse mobile pass: directory + map <3s on throttled 3G; fix regressions.
- [ ] Accessibility pass: alt text, contrast, keyboard nav (WCAG AA basics).
- [ ] Verify free-tier headroom (Supabase 500MB, Vercel 100GB, Sentry 5k, PostHog 1M) with projected launch volume.
- [ ] Pre-launch: un-pause / ping Supabase project so it isn't paused on launch day.

**Acceptance:** all scope §11 targets met on staging; error + analytics events flowing; load test passes.

---

## 13. Cross-Cutting Standards (apply throughout)

- **Security (OWASP + org):** server-side validation on every write proc; parameterized queries only
  (Supabase client handles this); service-role key server-only; rate-limit all public writes; RLS as
  defense-in-depth. If any live credential is ever committed, rotate immediately.
- **Code quality (SonarQube "Sonar way"):** zero new bugs/vulns/hotspots, low cognitive complexity,
  ≤3% duplication, no magic numbers, explicit error handling. Add SonarQube (or SonarCloud free for
  public repos) as a CI check before launch if desired.
- **Testing:** ≥80% coverage on new logic with meaningful assertions; integration tests on the two
  critical paths (`mandals.list`, submit→approve). Manual QA for map UX + mobile.
- **Git hygiene:** small PRs, meaningful commits, CI (lint/typecheck/test/build) green as a merge gate.
- **Secrets:** all keys in Vercel env vars / `.env.local`; `.env.example` documents them; nothing secret in the repo.

---

## 14. Dependency Graph (solo build order)

```
M0 Scaffold ─▶ M1 Schema/RLS ─┬─▶ M2 Seeding ──┐
                              └─▶ M3 Read API ──┴─▶ M4 Directory ─▶ M5 Map
                                                     M3 ─▶ M6 Detail
                                                     M3 ─▶ M7 Submit ─▶ M8 Moderation
                                                     M1 ─▶ M9 Helplines
                              everything ─▶ M10 Launch prep
```
M2 (seeding) and M3 (read API) both depend only on M1 and can be tackled in either order; do M2 first
so later frontend work has real data to render.

---

## 15. Deferred (not built in v1)

Per scope §15 + this plan's boundary: crowd reports (`crowd_reports` table, `crowdReports.*`, §6.6),
route planner + OSRM + PostGIS migration (§6.7), ML moderation, prediction models, native apps,
multi-language, donations, PWA/offline. Interfaces are left clean (e.g. `mandals` row has room for a
future `GEOGRAPHY` column; submission payload is jsonb) so these slot in without a rebuild.

---

## 16. Enhancements & Scope Reconsiderations

Not part of the committed v1 build order, but ranked here so they inform decisions made now (schema
columns, share hooks, PWA shell) rather than forcing rework later. The **biggest lever is not a feature
— it is data completeness and accuracy** (see §4 Milestone 2 and the correction loop below); a polished
app over a thin/wrong dataset loses to a WhatsApp forward. Treat data quality as the product's spine.

### P1 — reconsider the current scope decision

| Item | Current scope | Recommendation | Why |
|---|---|---|---|
| **Live crowd / queue status** | Phase 2 ([scope §6.6](../scope.md#L219-L223)) | Pull forward to **early Phase 2**, prototype during v1 | *The* pain of pandal hopping (12h+ queues at Lalbaugcha Raja). Coarse self-reported waits (`<1hr` / `1–3hr` / `3hr+`) make the app a daily-open tool. `crowd_reports` is already schema'd. |
| **Offline / PWA** | Out of scope ([scope §15](../scope.md#L338)) | **Promote to v1 stretch / early Phase 2** | Dense areas (Lalbaug, Girgaon) have the worst network exactly at peak crowd. A PWA caching the directory + last-viewed detail pages is cheap on Next.js and fits the zero-cost constraint. High value for this exact context. |

### P2 — high value, low cost (fit around v1 or immediately after)

- **"Near me" distance sort** — geolocation → distance-sorted directory/map. Trivial with the `lat`/`lng` already stored; core to walking-around use.
- **Simple route planner** — the v1-simple straight-line nearest-neighbour sequence already specced in [scope §6.7](../scope.md#L225-L230). No OSRM needed. "Pick N mandals → ordered walking order" is a strong hook.
- **Facilities data** — a few boolean columns on `mandals`: wheelchair access, women's queue, drinking water, toilets, station-exit hint. Families and elderly devotees care most.
- **Darshan-type clarity** — surface Mukh Darshan vs Navsacha (vow) line, and "has a fast line". Stubbed in the detail mockup.
- **WhatsApp-first sharing** — share-a-mandal and share-a-plan deep links + OpenGraph cards. Likely the largest organic-growth channel in Mumbai.
- **Aagman / Visarjan dates + aarti timings** per mandal, plus city-wide immersion-day road-closure notes.

### Technical / quality

- **Spelling-tolerant search** — fuzzy + transliteration-aware ("Lalbagcha", "Lalbaug cha", Devanagari). Directly addresses the casing/spelling edge case in [scope §6.1](../scope.md#L191).
- **SEO as primary acquisition** — schema.org `Place`/`Event` structured data, sitemap, OG tags so detail pages rank for "Lalbaugcha Raja timings 2026". Free traffic; pairs with the ISR strategy.
- **"Report incorrect info" button** on every detail page → feeds the same moderation queue. Makes correction one tap; central to data accuracy.
- **"Last verified" date** shown to users — builds trust, surfaces stale records.
- **Image polish** — `next/image` with AVIF + blur placeholders, lazy-load below the fold, to stay inside free bandwidth tiers.

### UI / UX polish

- **Large-text / high-contrast mode** beyond baseline WCAG AA — audience skews older and devotional.
- **Skeleton loaders** for the card grid on 3G instead of a blank wait.
- **Map cluster spider-fy + "you are here"** for dense clusters.
- **First-run onboarding hint** for the pin-drop and filters.

---

## 17. Immediate Next Steps

1. Confirm this plan (or flag adjustments).
2. Execute **Milestone 0** — scaffold `apps/web`, wire CI, first Vercel preview.
3. Execute **Milestone 1** — write the three migrations + RLS and provision the Supabase project.

Once M0/M1 are in, I can generate the schema migrations, tRPC scaffold, and Zod schemas as the first
concrete code deliverables.
```
