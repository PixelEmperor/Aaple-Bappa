from geocode import confidence_from_result, within_mmr_bbox


def test_within_mmr_bbox_accepts_mumbai_city():
    assert within_mmr_bbox(18.9910, 72.8374) is True  # Lalbaug


def test_within_mmr_bbox_accepts_navi_mumbai():
    assert within_mmr_bbox(19.0221, 73.0390) is True  # CBD Belapur


def test_within_mmr_bbox_rejects_pune():
    assert within_mmr_bbox(18.5204, 73.8567) is False


def test_within_mmr_bbox_rejects_far_outlier():
    assert within_mmr_bbox(28.6139, 77.2090) is False  # Delhi


def test_confidence_high_for_building_match():
    assert confidence_from_result({"class": "building", "type": "yes"}) == "high"


def test_confidence_medium_for_road_match():
    assert confidence_from_result({"class": "highway", "type": "residential"}) == "medium"


def test_confidence_low_for_place_level_match():
    assert confidence_from_result({"class": "place", "type": "suburb"}) == "low"


def test_confidence_low_for_missing_fields():
    assert confidence_from_result({}) == "low"
