# Bonsai particle extraction

This utility samples source artwork into Canvas marks. Bonsai mode retains the original tree’s branch and canopy guides. Landscape mode samples sky color from the top of the image and preserves faint distant colors. Export writes both the readable `.bin` source and a deterministic gzip `.pack` file used by the site to reduce transfer size. Use Python 3.12+ and `uv`:

```bash
uv lock --directory tools/bonsai-particles
uv sync --directory tools/bonsai-particles
uv run --directory tools/bonsai-particles bonsai-particles ../../public/bonsai.png ../../public/bonsai-particles.bin
uv run --directory tools/bonsai-particles pytest -q
```

The source is 1122×1402 RGB. Its border median is `(249, 248, 244)`, and the border varies by a few RGB levels. Pixels less than 20 levels from that estimate are treated as background. Each occupied 4×4 source region contributes one mark: its weighted center, approximate area-derived radius, and color weighted toward its darker pixels. A deterministic offset scatters centers within each region. Landscape mode uses 3×3 source regions because its marks span the full viewport. This yields roughly 29,000 marks and a 350 KB binary asset; gzip reduces the downloaded asset to about 264 KB. Re-running extraction is deterministic, and the test compares the committed binary with a fresh extraction.

## Materials and growth

The five material IDs are trunk (0), primary branch (1), secondary branch (2), foliage (3), and rock or ground (4). The extractor compares particle positions with hand-traced wood paths from the actual PNG, then assigns wood reveal times by distance along each path. Green color and manually placed canopy ellipses group foliage near its supporting branches. Remaining marks settle around the roots and rocks. The guides are defined in `src/bonsai_particles/extract.py`; adjust them if the artwork changes.

## Binary format

All values are little-endian. The 20-byte header contains `BSP1`, width, height, particle count, and a packed RGB background estimate (`R | G<<8 | B<<16`). Each 12-byte mark contains `x` and `y` as unsigned quarter-pixel coordinates, quarter-pixel radius, material ID, RGB, opacity, and a 16-bit reveal fraction. Coordinates and the radius are divided by four in Angular; reveal is divided by 65535. The RGB source was already flattened onto its background, so the exported mark opacity is 255. Original brush opacity cannot be recovered reliably from this PNG alone.

## Renderer

`src/app/bonsai-canvas.ts` loads the original bonsai and one compressed landscape pack. Both join a shared assembly timeline and use the same point renderer. Once marks settle, cached Canvas layers supply the scene for moving water, foliage, atmosphere, and the raven. Reduced motion paints the assembled state immediately. The optional landscape pack falls back to procedural stippling, and the original JPEG preserves the silhouette if Canvas or bonsai loading fails.

See [the artwork notes](../../docs/redesign/README.md) for the landscape source and rebuild commands.

## Visual QA

Local captures in `qa/` can show growth stages, desktop and mobile layouts, ambient movement, and source-to-Canvas fidelity. They are generated review artifacts and are not committed. To repeat the source comparison after taking a browser screenshot and reading the Canvas host bounds from the DOM:

```bash
uv run --directory tools/bonsai-particles python compare.py ../../public/bonsai.png qa/desktop-100.png qa/source-vs-canvas.png --box 553,138,519,722
```

The current capture measures 34.0/255 artwork color MAE and 0.976 blurred silhouette overlap. The existing hero text crosses the left edge of the Canvas host on desktop; the metric excludes that edge, but the image still shows it. Visually, the reconstructed foliage and rocks are slightly softer than the original. The raster source merges many touching dots, so exact original dot centers, edges, and opacity are unrecoverable. The fallback PNG preserves the approved artwork if strict fidelity is needed later.
