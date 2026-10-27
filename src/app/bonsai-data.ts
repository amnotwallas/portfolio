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
  particles: BonsaiParticle[];
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
  return { width, height, particles };
}

export function growthProgress(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const fraction = Math.max(0, Math.min(1, elapsedMs / 6200));
  return fraction * fraction * (3 - 2 * fraction);
}

export function fitBonsai(width: number, height: number, cssWidth: number, cssHeight: number, dpr: number) {
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  const scale = Math.min(pixelWidth / width, pixelHeight / height);
  return { pixelWidth, pixelHeight, scale, offsetX: (pixelWidth - width * scale) / 2, offsetY: (pixelHeight - height * scale) / 2 };
}
