"""Stage 2 of the seeding pipeline (design-plan.md Milestone 2): normalize
name/area text, flag likely cross-source duplicates for manual review, and
compute a slug per row. Duplicates are flagged, not auto-merged — a human
decides which row (if any) is the real duplicate before import.

Usage:
    python clean.py --input seed_data/scraped_raw.csv --output seed_data/cleaned.csv
"""

import argparse
import logging
import re
import sys
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

from slugify import generate_slug

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DUPLICATE_NAME_THRESHOLD = 85
_WHITESPACE = re.compile(r"\s+")


def normalize_text(value: object) -> str:
    if pd.isna(value):
        return ""
    return _WHITESPACE.sub(" ", str(value)).strip()


def find_likely_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Flag row pairs whose (name, area) look like the same mandal from two
    sources. Compares every pair — fine at seeding-pipeline scale (hundreds
    of rows, run offline, not per-request), not something to reuse as-is at
    thousands of rows.
    """
    flagged_rows = []
    for i in range(len(df)):
        for j in range(i + 1, len(df)):
            name_score = fuzz.token_sort_ratio(df.iloc[i]["name"], df.iloc[j]["name"])
            if name_score < DUPLICATE_NAME_THRESHOLD:
                continue
            area_score = fuzz.token_sort_ratio(df.iloc[i]["area"], df.iloc[j]["area"])
            flagged_rows.append(
                {
                    "row_a": i,
                    "name_a": df.iloc[i]["name"],
                    "area_a": df.iloc[i]["area"],
                    "row_b": j,
                    "name_b": df.iloc[j]["name"],
                    "area_b": df.iloc[j]["area"],
                    "name_similarity": name_score,
                    "area_similarity": area_score,
                }
            )
    return pd.DataFrame(flagged_rows)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["name"] = df["name"].map(normalize_text)
    df["area"] = df["area"].map(normalize_text)
    df = df[(df["name"] != "") & (df["area"] != "")]

    existing_slugs: set[str] = set()
    slugs = []
    for _, row in df.iterrows():
        slug = generate_slug(row["name"], row["area"], existing_slugs)
        existing_slugs.add(slug)
        slugs.append(slug)
    df["slug"] = slugs

    return df


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("seed_data/scraped_raw.csv"))
    parser.add_argument("--output", type=Path, default=Path("seed_data/cleaned.csv"))
    parser.add_argument("--duplicates-output", type=Path, default=Path("seed_data/duplicates_review.csv"))
    args = parser.parse_args()

    if not args.input.exists():
        logger.error("Input file not found: %s", args.input)
        return 1

    df = pd.read_csv(args.input)
    for required in ("name", "area"):
        if required not in df.columns:
            logger.error("Input CSV is missing required column: %s", required)
            return 1

    duplicates = find_likely_duplicates(df)
    if not duplicates.empty:
        args.duplicates_output.parent.mkdir(parents=True, exist_ok=True)
        duplicates.to_csv(args.duplicates_output, index=False)
        logger.warning(
            "Flagged %d likely duplicate pair(s) for manual review: %s",
            len(duplicates),
            args.duplicates_output,
        )

    cleaned = clean(df)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    cleaned.to_csv(args.output, index=False)
    logger.info("Wrote %d cleaned row(s) to %s", len(cleaned), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
