"""Stage 1 of the seeding pipeline (design-plan.md Milestone 2): pull mandal
listings (name, area, description) from configured public sources into raw
CSV. Respects robots.txt and caches raw HTML locally so re-runs during
development don't re-hit the source.

`sources.json` ships empty — no specific source is configured, since picking
one is a product/legal decision (which sites, is scraping actually allowed)
that shouldn't be hardcoded here. See sources.example.json for the expected
shape: each source is a page plus CSS selectors for the listing container
and its name/area/description fields.

Usage:
    python scrape.py --sources sources.json --output seed_data/scraped_raw.csv
"""

import argparse
import csv
import hashlib
import json
import logging
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

USER_AGENT = "AapleBappa-DataPipeline/1.0 (contact@aaplebappa.in; non-commercial community project)"
REQUEST_INTERVAL_SECONDS = 2.0


def robots_allow(url: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception as exc:  # noqa: BLE001 - unreachable robots.txt shouldn't crash the run
        logger.warning("Could not read robots.txt at %s (%s) — assuming disallowed", robots_url, exc)
        return False
    return parser.can_fetch(USER_AGENT, url)


def cache_path_for(url: str, cache_dir: Path) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    return cache_dir / f"{digest}.html"


def fetch_html(url: str, cache_dir: Path) -> str | None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_path_for(url, cache_dir)
    if cached.exists():
        logger.info("Using cached HTML for %s", url)
        return cached.read_text(encoding="utf-8")

    if not robots_allow(url):
        logger.error("robots.txt disallows fetching %s — skipping", url)
        return None

    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
    response.raise_for_status()
    cached.write_text(response.text, encoding="utf-8")
    time.sleep(REQUEST_INTERVAL_SECONDS)
    return response.text


def parse_listing(html: str, source: dict) -> list[dict]:
    """Pure parsing logic, kept separate from fetch_html so it's testable
    against a local HTML fixture without a network call.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for item in soup.select(source["list_item_selector"]):
        name_el = item.select_one(source["name_selector"])
        area_el = item.select_one(source["area_selector"])
        if name_el is None or area_el is None:
            continue

        description_el = item.select_one(source.get("description_selector", "")) if source.get(
            "description_selector"
        ) else None

        rows.append(
            {
                "name": name_el.get_text(strip=True),
                "area": area_el.get_text(strip=True),
                "description": description_el.get_text(strip=True) if description_el else "",
                "source_url": source["url"],
            }
        )

    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, default=Path("sources.json"))
    parser.add_argument("--output", type=Path, default=Path("seed_data/scraped_raw.csv"))
    parser.add_argument("--cache-dir", type=Path, default=Path("seed_data/raw_html"))
    args = parser.parse_args()

    sources = json.loads(args.sources.read_text(encoding="utf-8"))
    if not sources:
        logger.warning(
            "%s is empty — nothing to scrape. Add source configs (see sources.example.json) to use this stage.",
            args.sources,
        )

    all_rows: list[dict] = []
    for source in sources:
        html = fetch_html(source["url"], args.cache_dir)
        if html is None:
            continue
        rows = parse_listing(html, source)
        logger.info("Extracted %d row(s) from %s", len(rows), source["url"])
        all_rows.extend(rows)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "area", "description", "source_url"])
        writer.writeheader()
        writer.writerows(all_rows)

    logger.info("Wrote %d row(s) to %s", len(all_rows), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
