"""Stage 3 of the seeding pipeline (design-plan.md Milestone 2): geocode rows
missing lat/lng via OSM Nominatim, throttled to Nominatim's 1 req/sec
fair-use limit (scope.md §16), with retry/backoff and a confidence column.
Rows outside the Mumbai Metropolitan Region bounding box are flagged for
manual spot-check rather than silently kept or dropped.

Usage:
    python geocode.py --input seed_data/cleaned.csv --output seed_data/geocoded.csv
"""

import argparse
import logging
import sys
import time
from pathlib import Path

import pandas as pd
import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "AapleBappa-DataPipeline/1.0 (contact@aaplebappa.in; non-commercial community project)"
REQUEST_INTERVAL_SECONDS = 1.1  # >1 req/sec, matching Nominatim's fair-use policy
MAX_RETRIES = 3

# Generous bounding box covering the whole Mumbai Metropolitan Region
# (Mumbai, Navi Mumbai, Thane, Vasai-Virar, Panvel — scope.md's stated scope),
# not just Mumbai city, so legitimate MMR mandals outside the city don't get
# incorrectly flagged as outliers.
MMR_BBOX = {"min_lat": 18.85, "max_lat": 19.45, "min_lng": 72.70, "max_lng": 73.20}


def within_mmr_bbox(lat: float, lng: float) -> bool:
    return MMR_BBOX["min_lat"] <= lat <= MMR_BBOX["max_lat"] and MMR_BBOX["min_lng"] <= lng <= MMR_BBOX["max_lng"]


def confidence_from_result(result: dict) -> str:
    """Coarse confidence tier from what kind of place Nominatim matched.
    A street/building/POI match is far more useful for a map pin than a
    suburb-level centroid — this doesn't try to be more precise than that.
    """
    place_class = result.get("class", "")
    place_type = result.get("type", "")
    if place_class in ("building", "amenity", "shop", "tourism", "historic"):
        return "high"
    if place_class == "highway" or place_type == "road":
        return "medium"
    return "low"


def geocode_one(query: str, session: requests.Session) -> dict | None:
    params = {"q": query, "format": "json", "limit": 1, "countrycodes": "in"}
    headers = {"User-Agent": USER_AGENT}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            results = response.json()
            return results[0] if results else None
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Geocode attempt %d/%d failed for %r: %s", attempt, MAX_RETRIES, query, exc)
            if attempt < MAX_RETRIES:
                time.sleep(REQUEST_INTERVAL_SECONDS * attempt)  # linear backoff
    return None


def geocode_missing(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "lat" not in df.columns:
        df["lat"] = pd.NA
    if "lng" not in df.columns:
        df["lng"] = pd.NA
    df["geocode_confidence"] = df.get("geocode_confidence", pd.NA)

    session = requests.Session()
    needs_geocoding = df["lat"].isna() | df["lng"].isna()
    to_geocode = df[needs_geocoding]
    logger.info("%d row(s) need geocoding", len(to_geocode))

    for idx, row in to_geocode.iterrows():
        query = f"{row['name']}, {row['area']}, Mumbai"
        result = geocode_one(query, session)
        time.sleep(REQUEST_INTERVAL_SECONDS)

        if result is None:
            logger.warning("No geocode result for row %d (%s)", idx, row["name"])
            continue

        lat, lng = float(result["lat"]), float(result["lon"])
        df.at[idx, "lat"] = lat
        df.at[idx, "lng"] = lng
        df.at[idx, "geocode_confidence"] = confidence_from_result(result)

    return df


def flag_outliers(df: pd.DataFrame) -> pd.DataFrame:
    has_coords = df["lat"].notna() & df["lng"].notna()
    outlier = has_coords & ~df.apply(lambda r: within_mmr_bbox(r["lat"], r["lng"]), axis=1)
    df = df.copy()
    df["outside_mmr_bbox"] = outlier
    if outlier.any():
        logger.warning("%d row(s) geocoded outside the MMR bounding box — spot-check manually", outlier.sum())
    return df


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("seed_data/cleaned.csv"))
    parser.add_argument("--output", type=Path, default=Path("seed_data/geocoded.csv"))
    args = parser.parse_args()

    if not args.input.exists():
        logger.error("Input file not found: %s", args.input)
        return 1

    df = pd.read_csv(args.input)
    df = geocode_missing(df)
    df = flag_outliers(df)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)
    logger.info("Wrote %d row(s) to %s", len(df), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
