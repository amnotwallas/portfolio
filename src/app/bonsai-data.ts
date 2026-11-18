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
    particles[i] = { x, y, radius, material, color: `rgb(${red} ${green} ${blue})`, opacity, reveal, lowVegetation: material === 4 && y > 1180 && y < 1320 && green > red + 3 };
  }
  particles.sort((a, b) => a.reveal - b.reveal);
  const background = `rgb(${data.getUint8(16)} ${data.getUint8(17)} ${data.getUint8(18)})`;
  return { width, height, background, particles };
}

export const ASSEMBLY_MS = 6200;

export function growthProgress(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const fraction = Math.max(0, Math.min(1, elapsedMs / ASSEMBLY_MS));
  return fraction * fraction * (3 - 2 * fraction);
}

export function treeArrival(reveal: number): number {
  return .19 + .78 * reveal;
}

export function fitBonsai(width: number, height: number, cssWidth: number, cssHeight: number, deviceScale: number, constrained = false) {
  const compact = cssWidth < 640;
  const tall = !compact && cssWidth / cssHeight < 1.14;
  const maxPixels = constrained ? 1_100_000 : compact ? 1_000_000 : 2_300_000;
  const dpr = Math.min(deviceScale, constrained ? 1.25 : compact ? 1.65 : 1.8, Math.sqrt(maxPixels / (cssWidth * cssHeight)));
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
