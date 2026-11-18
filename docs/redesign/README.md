# Living Forest artwork

The local design reference, `approved-reference.png`, provided the composition and palette. The original `public/bonsai.png` supplies the foreground silhouette and is sampled with the original branch and canopy guides. The raven, leaves, mist, waterfall, and ripples are rendered in Canvas.

[Wide landscape](landscape-wide.webp) and [portrait landscape](landscape-portrait.webp) are text-free ImageGen production sources stored as lossless WebP. Both leave room for the original foreground bonsai. The browser downloads the corresponding point data and draws the forest, garden, stones, and water from the extracted marks.

## Regenerate

Run from the repository root after installing the Python tool's dependencies.

```sh
mkdir -p tmp/immersive-particles
uv run --project tools/bonsai-particles bonsai-particles public/bonsai.png tmp/immersive-particles/bonsai-particles.bin
cp tmp/immersive-particles/bonsai-particles.bin public/
cp tmp/immersive-particles/bonsai-particles.pack public/
for layout in portrait wide; do
  uv run --project tools/bonsai-particles bonsai-particles --landscape "docs/redesign/landscape-$layout.webp" "tmp/immersive-particles/landscape-$layout.bin"
  cp "tmp/immersive-particles/landscape-$layout.pack" public/
done
```

Both modes share the area-weighted dot sampling and deterministic scattering. Bonsai mode uses 4×4 source cells and traces reveal timing along the original branches. Landscape mode uses 3×3 cells to retain detail at full viewport scale. The source files yield 29,118 bonsai particles, 65,933 portrait particles, and 77,535 wide particles.

ImageGen used the approved composition to produce text-free backgrounds with clear space for the interface and the separately rendered foreground bonsai. The portrait source moves the waterfall left and keeps the upper half clear for the mobile interface.
