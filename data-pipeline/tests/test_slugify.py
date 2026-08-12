from slugify import generate_slug, slugify


def test_lowercases_and_hyphenates():
    assert slugify("Lalbaugcha Raja") == "lalbaugcha-raja"


def test_strips_diacritics():
    assert slugify("Nikadwari Cafe with an e-acute: café") == "nikadwari-cafe-with-an-e-acute-cafe"


def test_collapses_punctuation_into_single_hyphens():
    assert slugify("GSB Seva Mandal (King's Circle)") == "gsb-seva-mandal-king-s-circle"


def test_trims_leading_and_trailing_hyphens():
    assert slugify("  --Andhericha Raja--  ") == "andhericha-raja"


def test_generate_slug_returns_plain_slug_when_no_collision():
    assert generate_slug("Lalbaugcha Raja", "Lalbaug", set()) == "lalbaugcha-raja"


def test_generate_slug_appends_area_on_first_collision():
    existing = {"lalbaugcha-raja"}
    assert generate_slug("Lalbaugcha Raja", "Lalbaug", existing) == "lalbaugcha-raja-lalbaug"


def test_generate_slug_appends_numeric_suffix_once_area_slug_also_collides():
    existing = {"lalbaugcha-raja", "lalbaugcha-raja-lalbaug"}
    assert generate_slug("Lalbaugcha Raja", "Lalbaug", existing) == "lalbaugcha-raja-lalbaug-2"


def test_generate_slug_increments_past_existing_numeric_suffixes():
    existing = {
        "lalbaugcha-raja",
        "lalbaugcha-raja-lalbaug",
        "lalbaugcha-raja-lalbaug-2",
        "lalbaugcha-raja-lalbaug-3",
    }
    assert generate_slug("Lalbaugcha Raja", "Lalbaug", existing) == "lalbaugcha-raja-lalbaug-4"
