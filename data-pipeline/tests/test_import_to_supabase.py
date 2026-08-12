import pandas as pd

from import_to_supabase import row_to_record


def _row(**overrides) -> pd.Series:
    base = {
        "name": "Lalbaugcha Raja",
        "slug": "lalbaugcha-raja",
        "area": "Lalbaug",
        "lat": 18.9910151,
        "lng": 72.8374018,
    }
    base.update(overrides)
    return pd.Series(base)


def test_row_to_record_sets_seed_defaults():
    record = row_to_record(_row())
    assert record["source"] == "seed"
    assert record["verification_status"] == "verified"
    assert record["is_public"] is True


def test_row_to_record_includes_required_fields():
    record = row_to_record(_row())
    assert record["name"] == "Lalbaugcha Raja"
    assert record["slug"] == "lalbaugcha-raja"
    assert record["lat"] == 18.9910151
    assert record["lng"] == 72.8374018


def test_row_to_record_omits_missing_optional_fields():
    record = row_to_record(_row())
    assert "established_year" not in record
    assert "zone" not in record


def test_row_to_record_includes_present_optional_fields():
    record = row_to_record(_row(zone="Central Mumbai", established_year=1934.0))
    assert record["zone"] == "Central Mumbai"
    assert record["established_year"] == 1934
    assert isinstance(record["established_year"], int)


def test_row_to_record_parses_tags_list_string():
    record = row_to_record(_row(tags="['tallest', 'oldest']"))
    assert record["tags"] == ["tallest", "oldest"]
