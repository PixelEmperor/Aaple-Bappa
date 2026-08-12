"""Mirrors apps/web/src/shared/slug.ts exactly, so slugs the pipeline computes
match what the app itself would compute for the same name/area (design-plan.md
Milestone 1's slug rule: slugify(name); on collision append -{area-slug}, then
-2, -3). Keep the two in sync if either changes.
"""

import re
import unicodedata
from typing import AbstractSet

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    # Drop combining marks left by NFKD (e.g. the accent on "e" in "cafe").
    # unicodedata.combining() rather than a regex range over the combining-mark
    # block (U+0300 to U+036F), since embedding those characters literally in
    # source breaks on non-UTF-8 consoles (observed here: cp1252 can't encode
    # U+0300 at all).
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _NON_ALNUM.sub("-", text)
    return text.strip("-")


def generate_slug(name: str, area: str, existing_slugs: AbstractSet[str]) -> str:
    base = slugify(name)
    if base not in existing_slugs:
        return base

    with_area = f"{base}-{slugify(area)}"
    if with_area not in existing_slugs:
        return with_area

    suffix = 2
    while f"{with_area}-{suffix}" in existing_slugs:
        suffix += 1
    return f"{with_area}-{suffix}"
