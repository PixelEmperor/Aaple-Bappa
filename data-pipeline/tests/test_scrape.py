from scrape import parse_listing

SOURCE = {
    "url": "https://example.com/mumbai-ganpati-mandals-list",
    "list_item_selector": ".mandal-listing-item",
    "name_selector": ".mandal-name",
    "area_selector": ".mandal-area",
    "description_selector": ".mandal-description",
}

FIXTURE_HTML = """
<html><body>
  <div class="mandal-listing-item">
    <h3 class="mandal-name">Lalbaugcha Raja</h3>
    <span class="mandal-area">Lalbaug</span>
    <p class="mandal-description">Mumbai's most visited mandal.</p>
  </div>
  <div class="mandal-listing-item">
    <h3 class="mandal-name">Andhericha Raja</h3>
    <span class="mandal-area">Andheri West</span>
  </div>
  <div class="unrelated-block">Not a mandal listing</div>
</body></html>
"""


def test_parse_listing_extracts_name_and_area():
    rows = parse_listing(FIXTURE_HTML, SOURCE)
    assert len(rows) == 2
    assert rows[0]["name"] == "Lalbaugcha Raja"
    assert rows[0]["area"] == "Lalbaug"


def test_parse_listing_handles_missing_description():
    rows = parse_listing(FIXTURE_HTML, SOURCE)
    assert rows[0]["description"] == "Mumbai's most visited mandal."
    assert rows[1]["description"] == ""


def test_parse_listing_records_source_url():
    rows = parse_listing(FIXTURE_HTML, SOURCE)
    assert all(row["source_url"] == SOURCE["url"] for row in rows)


def test_parse_listing_ignores_items_missing_required_fields():
    html_with_gap = FIXTURE_HTML + """
      <div class="mandal-listing-item">
        <span class="mandal-area">No name here</span>
      </div>
    """
    rows = parse_listing(html_with_gap, SOURCE)
    assert len(rows) == 2  # the malformed third item is skipped, not crashed on


def test_parse_listing_returns_empty_for_no_matches():
    assert parse_listing("<html><body>nothing here</body></html>", SOURCE) == []
