"""Stage 5 of the seeding pipeline (design-plan.md Milestone 2): idempotent
upsert of cleaned+geocoded rows into `mandals`, setting source='seed' and
verification_status='verified' per the milestone spec. Uploads a matching
compressed photo (if present) to the mandal-photos bucket and saves its
public URL. Safe to re-run: upserts on slug, so a partial failure mid-batch
can just be re-run rather than needing a rollback.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example) — the
service-role key bypasses RLS, matching design-plan.md's note that seed
imports write directly, not through the public submission flow.

Usage:
    python import_to_supabase.py --input seed_data/geocoded.csv
"""

import argparse
import logging
import math
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

from geocode import within_mmr_bbox

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

PHOTO_BUCKET = "mandal-photos"

REQUIRED_COLUMNS = ("name", "slug", "area", "lat", "lng")
OPTIONAL_COLUMNS = (
    "zone",
    "established_year",
    "description",
    "history",
    "nearest_station",
    "tags",
    "timings",
    "official_contact",
)


def make_client() -> Client:
    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)")
    return create_client(url, key)


def row_to_record(row: pd.Series) -> dict:
    record = {
        "name": row["name"],
        "slug": row["slug"],
        "area": row["area"],
        "lat": float(row["lat"]),
        "lng": float(row["lng"]),
        "is_public": True,
        "source": "seed",
        "verification_status": "verified",
    }

    for column in OPTIONAL_COLUMNS:
        if column not in row.index:
            continue
        value = row[column]
        if isinstance(value, float) and math.isnan(value):
            continue
        if pd.isna(value):
            continue
        if column == "established_year":
            record[column] = int(value)
        elif column == "tags":
            # Stored as a JSON-ish string in CSV (e.g. "['tallest', 'oldest']");
            # a real scrape/clean run wouldn't usually populate this column at
            # all, since tags aren't something you can reliably extract from a
            # listicle — left for manual curation before import.
            record[column] = [t.strip() for t in str(value).strip("[]").replace("'", "").split(",") if t.strip()]
        else:
            record[column] = value

    return record


def upload_photo(client: Client, slug: str, photos_dir: Path) -> str | None:
    photo_path = photos_dir / f"{slug}.jpg"
    if not photo_path.exists():
        return None

    storage_path = f"{slug}.jpg"
    with open(photo_path, "rb") as f:
        client.storage.from_(PHOTO_BUCKET).upload(
            storage_path,
            f,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
    return client.storage.from_(PHOTO_BUCKET).get_public_url(storage_path)


def import_rows(client: Client, df: pd.DataFrame, photos_dir: Path) -> tuple[int, int]:
    imported = 0
    rejected = 0

    for _, row in df.iterrows():
        missing = [c for c in REQUIRED_COLUMNS if c not in row.index or pd.isna(row[c])]
        if missing:
            logger.error("Skipping %r: missing required field(s) %s", row.get("name", "<unknown>"), missing)
            rejected += 1
            continue

        lat, lng = float(row["lat"]), float(row["lng"])
        if not within_mmr_bbox(lat, lng):
            # Matches design-plan.md Milestone 1: invalid/out-of-bbox
            # coordinates are rejected before insert, not filtered at read
            # time, so "pins never render broken" holds by construction.
            logger.error("Skipping %r: coordinates (%s, %s) are outside the MMR bounding box", row["name"], lat, lng)
            rejected += 1
            continue

        record = row_to_record(row)
        photo_url = upload_photo(client, row["slug"], photos_dir)
        if photo_url:
            record["photo_url"] = photo_url

        client.table("mandals").upsert(record, on_conflict="slug").execute()
        imported += 1
        logger.info("Upserted %s (%s)", row["name"], row["slug"])

    return imported, rejected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("seed_data/geocoded.csv"))
    parser.add_argument("--photos-dir", type=Path, default=Path("seed_data/photos"))
    args = parser.parse_args()

    if not args.input.exists():
        logger.error("Input file not found: %s", args.input)
        return 1

    df = pd.read_csv(args.input)
    client = make_client()
    imported, rejected = import_rows(client, df, args.photos_dir)

    logger.info("Done: %d imported, %d rejected", imported, rejected)
    return 1 if rejected and not imported else 0


if __name__ == "__main__":
    sys.exit(main())
