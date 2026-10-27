# Bonsai particle extraction

This utility samples the existing `public/bonsai.png` into real Canvas marks. It does not invent a new tree. Use Python 3.12+ and `uv`:

```bash
uv lock --directory tools/bonsai-particles
uv sync --directory tools/bonsai-particles
uv run --directory tools/bonsai-particles bonsai-particles ../../public/bonsai.png ../../public/bonsai-particles.bin
uv run --directory tools/bonsai-particles pytest -q
```

The source is 1122×1402 RGB. Its border median is `(249, 248, 244)`, and the border varies by a few RGB levels. Pixels less than 20 levels from that estimate are treated as background. Each occupied 4×4 source region contributes one mark: its weighted center, approximate area-derived radius, and color weighted toward its darker pixels. A fixed spatial offset breaks up a visible sampling grid. This yields roughly 29,000 marks and a 350 KB asset. Re-running extraction is deterministic, and the test compares the committed binary with a fresh extraction.

## Materials and growth

The five material IDs are trunk (0), primary branch (1), secondary branch (2), foliage (3), and rock or ground (4). The extractor compares particle positions with hand-traced wood paths from the actual PNG, then assigns wood reveal times by distance along each path. Green color and manually placed canopy ellipses group foliage near its supporting branches. Remaining marks settle around the roots and rocks. The guides are defined in `src/bonsai_particles/extract.py`; adjust them if the artwork changes.

## Binary format

All values are little-endian. The 20-byte header contains `BSP1`, width, height, particle count, and a packed RGB background estimate (`R | G<<8 | B<<16`). Each 12-byte mark contains `x` and `y` as unsigned quarter-pixel coordinates, quarter-pixel radius, material ID, RGB, opacity, and a 16-bit reveal fraction. Coordinates and the radius are divided by four in Angular; reveal is divided by 65535. The RGB source was already flattened onto its background, so the exported mark opacity is 255. Original brush opacity cannot be recovered reliably from this PNG alone.

## Renderer

`src/app/bonsai-canvas.ts` loads the binary once and draws each mark with `CanvasRenderingContext2D.arc()`. An offscreen Canvas accumulates static marks as their reveal time arrives. A small deterministic foliage subset is drawn in the foreground with a subpixel sway and slight opacity change. The 6.2-second growth timeline eases from the root through trunk, branches, leaves, and ground. `ResizeObserver` recalculates contain scaling, and device pixel ratio is capped at 2. Animation pauses while the page is hidden. On destroy, it aborts loading and releases the observer, listeners, and animation frame. Fetch or Canvas failure shows the original PNG.

The final grounding pass lowers only the artwork. It reuses 86 source ground marks as a faint scatter below the base, and redraws 130 existing green base marks with tiny dotted grass tips and a slow cluster breeze. About 638 canopy marks sway independently in similarly small groups. Each fall draws one or, occasionally, two existing foliage marks from widely separated canopy areas. Timing, source, and drift vary per fall; a quiet pause follows each one. These counts come from the current deterministic particle asset; trunk and wood remain on the static layer. Reduced motion removes the sway, breathing, and falling marks while preserving the completed art.

## Visual QA

Local captures in `qa/` can show growth stages, desktop and mobile layouts, ambient movement, and source-to-Canvas fidelity. They are generated review artifacts and are not committed. To repeat the source comparison after taking a browser screenshot and reading the Canvas host bounds from the DOM:

```bash
uv run --directory tools/bonsai-particles python compare.py ../../public/bonsai.png qa/desktop-100.png qa/source-vs-canvas.png --box 553,138,519,722
```

The current capture measures 34.0/255 artwork color MAE and 0.976 blurred silhouette overlap. The existing hero text crosses the left edge of the Canvas host on desktop; the metric excludes that edge, but the image still shows it. Visually, the reconstructed foliage and rocks are slightly softer than the original. The raster source merges many touching dots, so exact original dot centers, edges, and opacity are unrecoverable. The fallback PNG preserves the approved artwork if strict fidelity is needed later.
