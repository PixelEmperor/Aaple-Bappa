from pathlib import Path

from PIL import Image

from compress_images import compress_directory, compress_image


def test_compress_image_resizes_wide_images_and_preserves_aspect_ratio(tmp_path: Path):
    source = tmp_path / "wide.png"
    Image.new("RGB", (2400, 1200), color=(200, 100, 50)).save(source)

    destination = tmp_path / "wide.jpg"
    compress_image(source, destination)

    with Image.open(destination) as result:
        assert result.width == 1200
        assert result.height == 600
        assert result.format == "JPEG"


def test_compress_image_leaves_already_small_images_unresized(tmp_path: Path):
    source = tmp_path / "small.png"
    Image.new("RGB", (400, 300)).save(source)

    destination = tmp_path / "small.jpg"
    compress_image(source, destination)

    with Image.open(destination) as result:
        assert result.size == (400, 300)


def test_compress_image_converts_rgba_to_rgb_for_jpeg(tmp_path: Path):
    source = tmp_path / "transparent.png"
    Image.new("RGBA", (100, 100), color=(0, 0, 0, 0)).save(source)

    destination = tmp_path / "transparent.jpg"
    compress_image(source, destination)  # would raise if RGBA reached JPEG encoding

    with Image.open(destination) as result:
        assert result.mode == "RGB"


def test_compress_directory_skips_files_already_compressed(tmp_path: Path):
    input_dir = tmp_path / "raw"
    output_dir = tmp_path / "out"
    input_dir.mkdir()
    Image.new("RGB", (100, 100)).save(input_dir / "mandal-a.png")

    processed, skipped = compress_directory(input_dir, output_dir)
    assert (processed, skipped) == (1, 0)

    # Re-run against the same output dir: the file already exists, so this
    # run should skip it rather than redo the work (idempotency).
    processed, skipped = compress_directory(input_dir, output_dir)
    assert (processed, skipped) == (0, 1)


def test_compress_directory_ignores_unsupported_file_types(tmp_path: Path):
    input_dir = tmp_path / "raw"
    output_dir = tmp_path / "out"
    input_dir.mkdir()
    (input_dir / "notes.txt").write_text("not an image")

    processed, skipped = compress_directory(input_dir, output_dir)
    assert (processed, skipped) == (0, 0)
    assert not list(output_dir.glob("*")) if output_dir.exists() else True
