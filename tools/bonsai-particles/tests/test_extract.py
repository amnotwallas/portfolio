from gzip import decompress
from pathlib import Path

import numpy as np
from PIL import Image

from bonsai_particles.extract import extract, export, read_export


def test_extract_is_deterministic_and_ignores_warm_background(tmp_path: Path):
    image = np.full((24, 24, 3), (249, 248, 244), dtype=np.uint8)
    image[5:9, 5:9] = (48, 91, 78)
    image[15:20, 12:16] = (81, 62, 51)
    path = tmp_path / "source.png"
    Image.fromarray(image).save(path)

    first = extract(path)
    second = extract(path)

    assert first == second
    assert first.width == first.height == 24
    assert len(first.particles) >= 2
    assert all(0 <= p.x < 24 * 4 and 0 <= p.y < 24 * 4 for p in first.particles)
    assert all(0 <= p.reveal <= 65535 and 0 < p.radius <= 255 for p in first.particles)
    assert all(p.opacity > 0 for p in first.particles)
    assert all(not (p.x < 4 * 4 and p.y < 4 * 4) for p in first.particles)

    output = tmp_path / "bonsai.bin"
    export(first, output)
    assert read_export(output) == first
    assert output.read_bytes() == (tmp_path / "bonsai.bin").read_bytes()


def test_blank_image_exports_no_particles(tmp_path: Path):
    path = tmp_path / "blank.png"
    Image.new("RGB", (12, 14), (249, 248, 244)).save(path)
    result = extract(path)
    assert (result.width, result.height, len(result.particles)) == (12, 14, 0)


def test_checked_in_data_matches_source_artwork():
    root = Path(__file__).resolve().parents[3]
    source = extract(root / "public/bonsai.png")
    checked_in = read_export(root / "public/bonsai-particles.bin")
    assert source == checked_in
    assert source.background == (249, 248, 244)
    assert all(p.opacity == 255 for p in source.particles)


def test_landscape_samples_from_sky_and_keeps_foreground_marks(tmp_path: Path):
    paper = (247, 241, 231)
    image = np.full((128, 80, 3), paper, dtype=np.uint8)
    image[:32, :40] = (245, 239, 230)
    image[64:100, 30:55] = (232, 224, 213)
    image[100:, :] = (48, 91, 78)
    path = tmp_path / "landscape.png"
    Image.fromarray(image).save(path)

    result = extract(path, landscape=True)
    assert result == extract(path, landscape=True)
    assert result.particles
    assert all(abs(a - b) <= 2 for a, b in zip(result.background, paper))
    assert all(mark.y >= 63 * 4 and mark.material == 4 for mark in result.particles)
    assert any(mark.y < 100 * 4 for mark in result.particles)


def test_checked_in_landscape_packs_match_their_sources(tmp_path: Path):
    root = Path(__file__).resolve().parents[3]
    for layout in ("portrait", "wide"):
        name = f"landscape-{layout}"
        data = extract(root / f"docs/redesign/{name}.webp", landscape=True)
        output = tmp_path / f"{name}.bin"
        export(data, output)
        assert output.read_bytes() == decompress((root / f"public/{name}.pack").read_bytes())
