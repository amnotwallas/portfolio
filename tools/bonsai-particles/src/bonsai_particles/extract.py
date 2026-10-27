"""Extract local stipple marks from the original bonsai into a compact Canvas dataset."""

from __future__ import annotations

import argparse
import gzip
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


HEADER = struct.Struct("<4sIIII")  # magic, width, height, count, packed background RGB
DOT = struct.Struct("<HHBBBBBBH")  # x, y, quarter-pixel radius, material, RGB, alpha, reveal
MATERIALS = ("trunk", "primary", "secondary", "foliage", "ground")


@dataclass(frozen=True)
class Particle:
    x: int
    y: int
    radius: int
    material: int
    red: int
    green: int
    blue: int
    opacity: int
    reveal: int


@dataclass(frozen=True)
class Dataset:
    width: int
    height: int
    background: tuple[int, int, int]
    particles: tuple[Particle, ...]


# Guides follow visible wood, from attachment to tip. Timing includes parent growth.
GUIDES = (
    (0, .03, .47, ((630, 1250), (570, 1140), (535, 1040), (560, 960), (675, 855), (765, 750), (755, 650), (680, 570), (655, 525), (700, 430), (680, 345), (660, 280), (620, 220))),
    (1, .31, .61, ((675, 855), (510, 825), (405, 815), (320, 765), (220, 710), (105, 670))),
    (1, .40, .64, ((690, 565), (530, 530), (430, 505), (335, 470), (230, 445), (110, 435))),
    (1, .37, .64, ((735, 690), (820, 670), (915, 635), (1015, 620))),
    (1, .43, .64, ((695, 430), (570, 435), (470, 385), (360, 365), (240, 390))),
    (2, .47, .68, ((640, 250), (555, 205), (465, 190))),
    (2, .48, .68, ((675, 290), (775, 250), (865, 260), (930, 270))),
    (2, .54, .70, ((420, 810), (380, 750), (300, 700), (190, 650))),
    (2, .57, .73, ((325, 765), (380, 710), (475, 710))),
    (2, .55, .70, ((420, 500), (460, 445), (525, 410))),
    (2, .56, .73, ((890, 630), (930, 570), (900, 510))),
    (2, .60, .74, ((530, 530), (570, 460), (610, 390))),
)

# Canopy regions anchor foliage to its supporting branch instead of height alone.
CLUSTERS = (
    (585, 145, 210, 90, .58), (760, 220, 205, 85, .62),
    (240, 420, 225, 90, .65), (500, 370, 205, 88, .67),
    (910, 470, 200, 100, .69), (175, 650, 180, 85, .67),
    (415, 725, 150, 75, .72), (1000, 620, 90, 50, .74),
    (545, 1190, 200, 80, .83),
)


def _growth(x: np.ndarray, y: np.ndarray, rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    size = len(x)
    material = np.full(size, 4, dtype=np.uint8)
    reveal = np.full(size, .85, dtype=np.float32)
    if not size:
        return material, reveal

    # Compare squared distances to every manually traced wood segment.
    best = np.full(size, np.inf, dtype=np.float32)
    wood_type = np.zeros(size, dtype=np.uint8)
    wood_time = np.zeros(size, dtype=np.float32)
    for kind, start, end, path in GUIDES:
        points = np.asarray(path, dtype=np.float32)
        lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
        total = lengths.sum()
        offset = 0.0
        for (ax, ay), (bx, by), length in zip(points[:-1], points[1:], lengths):
            dx, dy = bx - ax, by - ay
            fraction = np.clip(((x - ax) * dx + (y - ay) * dy) / (length * length), 0, 1)
            distance = (x - ax - fraction * dx) ** 2 + (y - ay - fraction * dy) ** 2
            closer = distance < best
            best[closer] = distance[closer]
            wood_type[closer] = kind
            wood_time[closer] = start + (end - start) * (offset + fraction[closer] * length) / total
            offset += length

    green = (rgb[:, 1].astype(np.int16) - rgb[:, 0].astype(np.int16) > 3) & (y < 1130)
    warm = (rgb[:, 0].astype(np.int16) - rgb[:, 1].astype(np.int16) > 5)
    wood = (y < 1160) & (best < 75 ** 2) & (warm | ((best < 20 ** 2) & ~green))
    material[wood] = wood_type[wood]
    reveal[wood] = wood_time[wood]

    foliage = green & ~wood
    if foliage.any():
        cluster_distance = np.full(size, np.inf, dtype=np.float32)
        cluster_time = np.full(size, .75, dtype=np.float32)
        for cx, cy, rx, ry, base in CLUSTERS:
            distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            closer = distance < cluster_distance
            cluster_distance[closer] = distance[closer]
            cluster_time[closer] = base
        material[foliage] = 3
        reveal[foliage] = cluster_time[foliage] + np.minimum(cluster_distance[foliage], 2) * .035

    # Stable spatial variation avoids synchronized bands while remaining reproducible.
    variation = ((x * 73 + y * 151 + 19) % 101) / 10100.0
    reveal += variation.astype(np.float32)
    reveal[material == 4] = .78 + ((x[material == 4] * 13 + y[material == 4] * 31) % 100) / 550.0
    return material, np.clip(reveal, 0, 1)


def extract(path: Path) -> Dataset:
    image = np.asarray(Image.open(path).convert("RGB"))
    height, width = image.shape[:2]
    if width > 16383 or height > 16383:
        raise ValueError("PNG dimensions exceed the particle format")
    border = np.concatenate((image[:32].reshape(-1, 3), image[-32:].reshape(-1, 3), image[:, :32].reshape(-1, 3), image[:, -32:].reshape(-1, 3)))
    background = tuple(int(c) for c in np.median(border, axis=0))
    difference = np.max(np.abs(image.astype(np.int16) - np.asarray(background)), axis=2)
    # A 4×4 local sample approximates each stipple, never one mark per pixel.
    foreground = difference > 19
    ys, xs = np.nonzero(foreground)
    if not len(xs):
        return Dataset(width, height, background, ())
    tile = (ys // 4) * math.ceil(width / 4) + xs // 4
    order = np.argsort(tile, kind="stable")
    tile, xs, ys = tile[order], xs[order], ys[order]
    first = np.r_[0, np.flatnonzero(np.diff(tile)) + 1]
    weights = difference[ys, xs].astype(np.float64)
    weight_sum = np.add.reduceat(weights, first)
    cx = np.add.reduceat(xs * weights, first) / weight_sum
    cy = np.add.reduceat(ys * weights, first) / weight_sum
    count = np.diff(np.r_[first, len(xs)])
    radius = np.clip(np.rint(np.sqrt(count / np.pi) * 3.9), 2, 16).astype(np.uint8)
    strong = weights * weights
    strong_sum = np.add.reduceat(strong, first)
    rgb = np.stack([np.rint(np.add.reduceat(image[ys, xs, channel] * strong, first) / strong_sum) for channel in range(3)], axis=1).astype(np.uint8)
    material, progress = _growth(cx.astype(np.float32), cy.astype(np.float32), rgb)
    seed = tile[first].astype(np.uint64)
    cx = np.clip(cx + ((seed * 137 + 91) % 257) / 256 - .5, 0, width - 1)
    cy = np.clip(cy + ((seed * 83 + 193) % 257) / 256 - .5, 0, height - 1)
    reveal = np.rint(progress * 65535).astype(np.uint16)
    particles = tuple(Particle(int(round(cx[i] * 4)), int(round(cy[i] * 4)), int(radius[i]), int(material[i]), *(int(c) for c in rgb[i]), 255, int(reveal[i])) for i in range(len(cx)))
    return Dataset(width, height, background, particles)


def export(data: Dataset, path: Path) -> None:
    packed_background = data.background[0] | data.background[1] << 8 | data.background[2] << 16
    raw = bytearray(HEADER.pack(b"BSP1", data.width, data.height, len(data.particles), packed_background))
    for particle in data.particles:
        raw.extend(DOT.pack(*particle.__dict__.values()))
    path.write_bytes(raw)
    with path.with_suffix(".pack").open("wb") as output:
        with gzip.GzipFile(filename="", fileobj=output, mode="wb", compresslevel=9, mtime=0) as compressed:
            compressed.write(raw)


def read_export(path: Path) -> Dataset:
    raw = path.read_bytes()
    magic, width, height, count, bg = HEADER.unpack_from(raw)
    if magic != b"BSP1" or len(raw) != HEADER.size + count * DOT.size:
        raise ValueError("Invalid particle dataset")
    particles = tuple(Particle(*values) for values in DOT.iter_unpack(raw[HEADER.size:]))
    return Dataset(width, height, (bg & 255, bg >> 8 & 255, bg >> 16 & 255), particles)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = extract(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    export(data, args.output)
    print(f"{len(data.particles):,} particles, {data.width}×{data.height}, {args.output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
