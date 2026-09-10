from unittest.mock import MagicMock

import pandas as pd
import pytest

from import_to_supabase import row_to_record, upload_photo


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


def test_upload_photo_returns_none_when_no_photo_file(tmp_path):
    # No R2 env vars set at all here — this must not require them, since
    # there's nothing to upload.
    r2_client = MagicMock()
    assert upload_photo(r2_client, "no-such-slug", tmp_path) is None
    r2_client.put_object.assert_not_called()


def test_upload_photo_uploads_to_r2_and_returns_public_url(tmp_path, monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_R2_BUCKET_NAME", "aaple-bappa-photos")
    monkeypatch.setenv("CLOUDFLARE_R2_PUBLIC_URL", "https://photos.example.com")

    (tmp_path / "lalbaugcha-raja.jpg").write_bytes(b"fake jpeg bytes")

    r2_client = MagicMock()
    url = upload_photo(r2_client, "lalbaugcha-raja", tmp_path)

    assert url == "https://photos.example.com/seed/lalbaugcha-raja.jpg"
    r2_client.put_object.assert_called_once()
    call_kwargs = r2_client.put_object.call_args.kwargs
    assert call_kwargs["Bucket"] == "aaple-bappa-photos"
    assert call_kwargs["Key"] == "seed/lalbaugcha-raja.jpg"
    assert call_kwargs["ContentType"] == "image/jpeg"


def test_upload_photo_raises_a_clear_error_when_r2_env_is_missing(tmp_path, monkeypatch):
    monkeypatch.delenv("CLOUDFLARE_R2_BUCKET_NAME", raising=False)
    (tmp_path / "lalbaugcha-raja.jpg").write_bytes(b"fake jpeg bytes")

    with pytest.raises(RuntimeError, match="CLOUDFLARE_R2_BUCKET_NAME"):
        upload_photo(MagicMock(), "lalbaugcha-raja", tmp_path)
