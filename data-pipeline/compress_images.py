"""Stage 4 of the seeding pipeline (design-plan.md Milestone 2, scope.md §8):
resize seed photos to ~1200px wide and re-encode as JPEG quality ~75, so
Supabase Storage usage stays low from day one. Expects input files named
{slug}.<ext> and writes {slug}.jpg to the output directory; skips a file
if a same-named output already exists, so a partial run can resume.

Usage:
    python compress_images.py --input seed_data/photos_raw --output seed_data/photos
"""

import argparse
import logging
import sys
from pathlib import Path

from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

TARGET_WIDTH = 1200
JPEG_QUALITY = 75
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def compress_image(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")  # drop alpha/palette modes JPEG can't store
        if image.width > TARGET_WIDTH:
            target_height = round(image.height * (TARGET_WIDTH / image.width))
            image = image.resize((TARGET_WIDTH, target_height), Image.LANCZOS)
        image.save(destination, "JPEG", quality=JPEG_QUALITY, optimize=True)


def compress_directory(input_dir: Path, output_dir: Path) -> tuple[int, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    processed = 0
    skipped = 0

    for source in sorted(input_dir.iterdir()):
        if source.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        destination = output_dir / f"{source.stem}.jpg"
        if destination.exists():
            skipped += 1
            continue

        try:
            compress_image(source, destination)
            processed += 1
        except Exception as exc:  # noqa: BLE001 - one bad image shouldn't stop the batch
            logger.error("Failed to process %s: %s", source.name, exc)

    return processed, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("seed_data/photos_raw"))
    parser.add_argument("--output", type=Path, default=Path("seed_data/photos"))
    args = parser.parse_args()

    if not args.input.exists():
        logger.error("Input directory not found: %s", args.input)
        return 1

    processed, skipped = compress_directory(args.input, args.output)
    logger.info("Processed %d image(s), skipped %d already-compressed", processed, skipped)
    return 0


if __name__ == "__main__":
    sys.exit(main())
