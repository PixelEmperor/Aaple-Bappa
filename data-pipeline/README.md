# Data Seeding Pipeline

Offline pipeline for getting mandals into the `mandals` table (scope.md §5,
design-plan.md Milestone 2). Runs independently of the live app — the app has
no runtime awareness this exists.

## Setup

```bash
python -m venv .venv
./.venv/Scripts/activate    # or source .venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt   # includes requirements.txt + pytest

cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same project as apps/web/.env.local)
```

## Stages

1. **`scrape.py`** — pulls listings from sources configured in `sources.json` (ships
   empty; see `sources.example.json` for the shape). Respects robots.txt, caches raw
   HTML in `seed_data/raw_html/` so re-runs don't re-hit the source.
2. **`clean.py`** — normalizes name/area text, flags likely cross-source duplicates
   into `seed_data/duplicates_review.csv` for manual review, computes a slug per row.
3. **`geocode.py`** — geocodes rows missing lat/lng via OSM Nominatim (throttled to
   1 req/sec), flags a confidence tier and any result outside the Mumbai Metropolitan
   Region bounding box for manual spot-check.
4. **`compress_images.py`** — resizes seed photos to ~1200px wide, JPEG quality ~75.
   Expects input files named `{slug}.<ext>`.
5. **`import_to_supabase.py`** — idempotent upsert into `mandals` (`source='seed'`,
   `verification_status='verified'`), uploads a matching compressed photo if present.
   Safe to re-run: upserts on `slug`, rejects coordinates outside the MMR bounding box
   before insert rather than after (design-plan.md Milestone 1's "pins never render
   broken" holds by construction).

Each stage takes `--input`/`--output` flags; defaults chain them together
(`scraped_raw.csv` -> `cleaned.csv` -> `geocoded.csv` -> imported).

## The manual dataset

`seed_data/mandals_manual.csv` — 17 real, well-known MMR mandals with
name/area/zone/coordinates/station/timings researched and geocoded directly
(not scraped), already committed. Since it's already clean and geocoded,
`clean.py`/`geocode.py` mostly pass it through — `clean.py` still computes
slugs, `geocode.py` still applies the bounding-box safety check:

```bash
python clean.py --input seed_data/mandals_manual.csv --output seed_data/mandals_cleaned.csv
python geocode.py --input seed_data/mandals_cleaned.csv --output seed_data/mandals_geocoded.csv
python import_to_supabase.py --input seed_data/mandals_geocoded.csv
```

## Testing

```bash
pytest
```

Tests cover the pure logic in each stage (slug generation, duplicate
detection, bbox/confidence checks, image resizing, the DB row mapping) without
needing network access or a live database. `scrape.py`'s HTML parsing is
tested against a local fixture, not a real site.
