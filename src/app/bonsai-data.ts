export interface BonsaiParticle {
  x: number;
  y: number;
  radius: number;
  material: number;
  color: string;
  opacity: number;
  reveal: number;
  lowVegetation: boolean;
}

export interface BonsaiData {
  width: number;
  height: number;
  background: string;
  particles: BonsaiParticle[];
}

export function landscapeVariant(width: number, height: number): 'portrait' | 'wide' {
  return width < height ? 'portrait' : 'wide';
}

export function decodeBonsai(buffer: ArrayBuffer): BonsaiData {
  return finishSteps(decodeBonsaiSteps(buffer));
}

export function finishSteps<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function* sortByReveal<T extends { reveal: number }>(particles: T[]): Generator<void, void> {
  const bins = Array.from({ length: 32 }, () => [] as T[]);
  for (let i = 0; i < particles.length; i++) {
    const dot = particles[i];
    bins[Math.min(31, Math.floor(dot.reveal * 32))].push(dot);
    if ((i & 1023) === 1023) yield;
  }
  let index = 0;
  for (const bin of bins) {
    bin.sort((a, b) => a.reveal - b.reveal);
    for (const dot of bin) particles[index++] = dot;
    yield;
  }
}

export function* decodeBonsaiSteps(buffer: ArrayBuffer): Generator<void, BonsaiData> {
  if (buffer.byteLength < 20) throw new Error('Invalid bonsai particle header');
  const data = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const width = data.getUint32(4, true);
  const height = data.getUint32(8, true);
  const count = data.getUint32(12, true);
  if (magic !== 'BSP1' || !width || !height || buffer.byteLength !== 20 + count * 12) {
    throw new Error('Invalid bonsai particle dataset');
  }
  const particles = new Array<BonsaiParticle>(count);
  const palette = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const offset = 20 + i * 12;
    const x = data.getUint16(offset, true) / 4;
    const y = data.getUint16(offset + 2, true) / 4;
    const radius = data.getUint8(offset + 4) / 4;
    const material = data.getUint8(offset + 5);
    const red = data.getUint8(offset + 6);
    const green = data.getUint8(offset + 7);
    const blue = data.getUint8(offset + 8);
    const opacity = data.getUint8(offset + 9) / 255;
    const reveal = data.getUint16(offset + 10, true) / 65535;
    if (x >= width || y >= height || !radius || material > 4) throw new Error('Invalid bonsai particle');
    const rgb = (red << 16) | (green << 8) | blue;
    let color = palette.get(rgb);
    if (!color) {
      color = `rgb(${red} ${green} ${blue})`;
      palette.set(rgb, color);
    }
    particles[i] = { x, y, radius, material, color, opacity, reveal, lowVegetation: material === 4 && y > 1180 && y < 1320 && green > red + 3 };
    if ((i & 1023) === 1023) yield;
  }
  yield* sortByReveal(particles);
  const background = `rgb(${data.getUint8(16)} ${data.getUint8(17)} ${data.getUint8(18)})`;
  return { width, height, background, particles };
}

export const ASSEMBLY_MS = 6200;

export function growthProgress(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return Math.max(0, Math.min(1, elapsedMs / ASSEMBLY_MS));
}

export function fitBonsai(
  width: number, height: number, cssWidth: number, cssHeight: number, deviceScale: number, constrained = false, resolution = 1,
) {
  const compact = cssWidth < 640;
  const tall = !compact && cssWidth / cssHeight < 1.14;
  const maxPixels = constrained ? 1_100_000 : compact ? 1_000_000 : 2_300_000;
  const nativeDpr = Math.min(deviceScale, constrained ? 1.25 : compact ? 1.65 : 1.8, Math.sqrt(maxPixels / (cssWidth * cssHeight)));
  const dpr = nativeDpr * resolution;
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  const shore = compact ? .935 : .916;
  const canopy = compact ? .545 : tall ? .31 : .14;
  const maxWidth = compact ? .94 : tall ? .58 : .55;
  // Use the visible canopy and rock bounds to place the extracted art on the shore.
  const scale = Math.min(pixelWidth * maxWidth / width, pixelHeight * (shore - canopy) / (height * .91));
  const offsetX = pixelWidth * .98 - width * .97 * scale;
  const offsetY = pixelHeight * shore - height * .966 * scale;
  return { pixelWidth, pixelHeight, scale, offsetX, offsetY, dpr, shore, compact, backdrop: landscapeVariant(cssWidth, cssHeight) };
}
