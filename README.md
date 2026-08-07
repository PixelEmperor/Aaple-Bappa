# Aaple Bappa — App

The web app for **Aaple Bappa**, a free, community-built guide to Ganpati mandals across the
Mumbai Metropolitan Region. See [`scope.md`](scope.md) for the full product/technical spec and
[`docs/design-plan.md`](docs/design-plan.md) for the milestone-by-milestone build plan this repo
follows.

The pre-launch data-collection landing page lives in a separate repo
([aaple_bappa_landing_page](https://github.com/PixelEmperor/aaple_bappa_landing_page), deployed at
[aaplebappa.in](https://aaplebappa.in)) — this repo is the actual application.

## Repository structure

```
/
├── apps/web          ← Next.js (App Router) + TypeScript app
├── data-pipeline      ← Python seeding scripts (added in Milestone 2)
├── supabase           ← SQL migrations (added in Milestone 1)
├── docs/
│   ├── design-plan.md ← implementation plan (milestones, decisions, enhancements)
│   └── ui-mockup.html ← clickable UI prototype (open in a browser)
└── scope.md           ← product & technical scope (v1)
```

## Status

Milestone 0 (scaffold) is in progress. See [`docs/design-plan.md`](docs/design-plan.md) §2 for
what's done and what's next.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| API | tRPC + Zod validation |
| Database / Auth / Storage | Supabase (Postgres) |
| Map | Leaflet + OpenStreetMap |
| Hosting / CDN | Vercel + Cloudflare |
| Errors / Analytics | Sentry + PostHog |
| Data seeding | Python (pandas, BeautifulSoup, rapidfuzz, Pillow) — offline only |
| CI/CD | GitHub Actions |

## Getting started

```bash
cd apps/web
pnpm install
cp .env.example .env.local   # fill in Supabase/PostHog/Sentry keys
pnpm dev
```

Other scripts (run from `apps/web`): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`.

## License

MIT — permissive and open, in keeping with the community, non-commercial spirit of the project.
Not affiliated with any mandal or authority.
