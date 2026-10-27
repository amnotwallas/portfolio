"""Compare the source art with a completed browser Canvas screenshot at its DOM bounds."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("screenshot", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--box", required=True, help="Canvas host x,y,width,height in screenshot pixels")
    args = parser.parse_args()
    x, y, width, height = (int(value) for value in args.box.split(","))
    screenshot = Image.open(args.screenshot).convert("RGB")
    assert width > 0 and height > 0 and x >= 0 and y >= 0 and x + width <= screenshot.width and y + height <= screenshot.height
    canvas = screenshot.crop((x, y, x + width, y + height))
    source = Image.open(args.source).convert("RGB")
    scale = min(width / source.width, height / source.height)
    art = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    original = Image.new("RGB", (width, height), (247, 246, 243))
    original.paste(art, ((width - art.width) // 2, (height - art.height) // 2))

    # The existing hero text touches the left edge of the Canvas host on desktop.
    src = np.asarray(original, dtype=np.int16)
    dst = np.asarray(canvas, dtype=np.int16)
    artwork = np.max(np.abs(src - (249, 248, 244)), axis=2) > 25
    artwork[:, :min(80, width // 8)] = False
    mae = np.abs(src - dst).mean(axis=2)[artwork].mean()
    src_shape = np.asarray(original.filter(ImageFilter.GaussianBlur(2)), dtype=np.int16)
    dst_shape = np.asarray(canvas.filter(ImageFilter.GaussianBlur(2)), dtype=np.int16)
    src_mask = np.max(np.abs(src_shape - (249, 248, 244)), axis=2) > 20
    dst_mask = np.max(np.abs(dst_shape - (247, 246, 243)), axis=2) > 20
    src_mask[:, :min(80, width // 8)] = dst_mask[:, :min(80, width // 8)] = False
    overlap = np.logical_and(src_mask, dst_mask).sum() / max(1, np.logical_or(src_mask, dst_mask).sum())

    result = Image.new("RGB", (width * 2, height + 28), (247, 246, 243))
    result.paste(original, (0, 28))
    result.paste(canvas, (width, 28))
    labels = ImageDraw.Draw(result)
    labels.text((12, 8), "Original PNG", fill=(40, 45, 44))
    labels.text((width + 12, 8), "Canvas particles", fill=(40, 45, 44))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(f"Artwork MAE: {mae:.1f} / 255; blurred silhouette IoU: {overlap:.3f}")


if __name__ == "__main__":
    main()
