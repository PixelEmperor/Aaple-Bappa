import pandas as pd

from clean import clean, find_likely_duplicates, normalize_text


def test_normalize_text_collapses_whitespace_and_strips():
    assert normalize_text("  Lalbaugcha   Raja  ") == "Lalbaugcha Raja"


def test_normalize_text_handles_missing_values():
    assert normalize_text(float("nan")) == ""


def test_find_likely_duplicates_flags_near_identical_rows():
    df = pd.DataFrame(
        {
            "name": ["Lalbaugcha Raja", "Lalbaugcha  Raja", "Andhericha Raja"],
            "area": ["Lalbaug", "Lalbaug", "Andheri West"],
        }
    )
    flagged = find_likely_duplicates(df)
    assert len(flagged) == 1
    assert flagged.iloc[0]["row_a"] == 0
    assert flagged.iloc[0]["row_b"] == 1


def test_find_likely_duplicates_ignores_distinct_mandals():
    df = pd.DataFrame(
        {
            "name": ["Lalbaugcha Raja", "Andhericha Raja"],
            "area": ["Lalbaug", "Andheri West"],
        }
    )
    assert find_likely_duplicates(df).empty


def test_clean_drops_rows_with_empty_name_or_area_after_normalizing():
    df = pd.DataFrame(
        {
            "name": ["Lalbaugcha Raja", "   ", "Andhericha Raja"],
            "area": ["Lalbaug", "Somewhere", "  "],
        }
    )
    cleaned = clean(df)
    assert len(cleaned) == 1
    assert cleaned.iloc[0]["name"] == "Lalbaugcha Raja"


def test_clean_computes_distinct_slugs_within_the_batch():
    df = pd.DataFrame(
        {
            "name": ["Lalbaugcha Raja", "Lalbaugcha Raja"],
            "area": ["Lalbaug", "Lalbaug"],
        }
    )
    cleaned = clean(df)
    assert list(cleaned["slug"]) == ["lalbaugcha-raja", "lalbaugcha-raja-lalbaug"]
