import type { BonsaiData, BonsaiParticle } from './bonsai-data';
import type { WaterLayout } from './landscape';

const swarms = {
  structure: { duration: .22, share: 32 },
  foliage: { duration: .25, share: 29 },
  water: { duration: .20, share: 17 },
  atmosphere: { duration: .30, share: 14 },
  detail: { duration: .16, share: 8 },
};

type Swarm = keyof typeof swarms;
const roles = Object.keys(swarms) as Swarm[];
const treeWindows = { structure: [.13, .48], foliage: [.33, .73], detail: [.78, .99] } as const;

export type AssemblyDot = BonsaiParticle & { swarm: Swarm };
export type AssemblyData = BonsaiData & { particles: AssemblyDot[] };
type Point = { x: number; y: number; radius: number };
export type Courier = Point & {
  dot: AssemblyDot;
  fromX: number;
  fromY: number;
  bendX: number;
  bendY: number;
};
export type Lane = { swarm: Swarm; duration: number; next: number; members: Courier[] };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const ease = (value: number) => value * value * (3 - 2 * value);

export function variation(key: number): number {
  const mixed = Math.imul(key ^ (key >>> 16), 0x45d9f3b);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

export function swarmWeight(swarm: 'water' | 'atmosphere', progress: number): number {
  return swarm === 'water'
    ? ease(clamp((progress - .3) / .36))
    : ease(clamp((progress - .75) / .24));
}

function cascadeAt(layout: WaterLayout, x: number, y: number) {
  for (const cascade of layout.cascades) {
    if (y < cascade.top[1] || y > cascade.foot[1] + .009) continue;
    const drop = (y - cascade.top[1]) / (cascade.foot[1] - cascade.top[1]);
    const center = cascade.top[0] + (cascade.foot[0] - cascade.top[0]) * drop;
    if (Math.abs(x - center) < cascade.width * .61) return cascade;
  }
  return undefined;
}

function pigment(color: string): Swarm {
  const [red, green, blue] = color.slice(4, -1).split(' ').map(Number);
  if (red - green > 17 && green - blue > 13) return 'detail';
  if (red + green + blue > 548) return 'atmosphere';
  if (green >= red + 4 && green > blue + 6) return 'foliage';
  return 'structure';
}

function treeWave(swarm: keyof typeof treeWindows, dot: BonsaiParticle, x: number): number {
  const neighborhood = .12 * Math.sin(x * Math.PI * 4) + .1 * x;
  switch (swarm) {
    case 'structure':
      return dot.material === 4 ? .08 + .48 * (dot.reveal - .78) / .18 + neighborhood : dot.reveal / .8;
    case 'foliage': return (dot.reveal - .54) / .32;
    case 'detail': return .32 + neighborhood + .36 * dot.reveal;
  }
}

export function scheduleAssembly(data: BonsaiData, layout?: WaterLayout): AssemblyData {
  const colors = new Map<string, Swarm>();
  const particles = data.particles.map((dot): AssemblyDot => {
    const x = dot.x / data.width;
    const y = dot.y / data.height;
    const grain = variation(Math.round(dot.x * 103 + dot.y * 199)) - .5;
    if (layout) {
      let tone = colors.get(dot.color);
      if (!tone) {
        tone = pigment(dot.color);
        colors.set(dot.color, tone);
      }
      const swarm = y >= layout.shoreline || cascadeAt(layout, x, y) ? 'water' : tone;
      // Water lanes guide motion without cutting holes in the shared deposition wave.
      const drift = .027 * Math.sin((x * .8 + y * .38) * Math.PI * 2);
      const reveal = clamp(.24 + .29 * (1 - y) + drift + .32 * dot.reveal + .12 * grain);
      return { ...dot, reveal, swarm };
    }

    let swarm: keyof typeof treeWindows = 'structure';
    if (dot.lowVegetation || dot.material === 3) {
      swarm = dot.material === 3 && dot.reveal > .72 && pigment(dot.color) === 'detail'
        ? 'detail' : 'foliage';
    }
    const [first, last] = treeWindows[swarm];
    const reveal = first + (last - first) * clamp(treeWave(swarm, dot, x) + .13 * grain);
    return { ...dot, reveal, swarm };
  });
  particles.sort((a, b) => a.reveal - b.reveal);
  return { ...data, particles };
}

export function buildCouriers(
  dots: AssemblyDot[], width: number, height: number, budget: number,
  project: (dot: AssemblyDot) => Point, layout?: WaterLayout,
): Lane[] {
  const groups = new Map(roles.map((role) => [role, [] as AssemblyDot[]]));
  for (const dot of dots) groups.get(dot.swarm)?.push(dot);
  const populated = roles.filter((role) => groups.get(role)!.length);
  const shares = populated.reduce((sum, role) => sum + swarms[role].share, 0);
  return populated.map((swarm) => {
    const group = groups.get(swarm)!;
    const { duration, share } = swarms[swarm];
    const count = Math.min(group.length, Math.floor(budget * share / shares));
    const members = Array.from({ length: count }, (_, i) => {
      const dot = group[Math.floor((i + .5) * group.length / count)];
      return route(dot, project(dot), width, height, layout);
    });
    return { swarm, duration, next: 0, members };
  });
}

function route(dot: AssemblyDot, target: Point, width: number, height: number, layout?: WaterLayout): Courier {
  const { x, y } = target;
  const grain = variation(Math.round(dot.x * 233 + dot.y * 97)) - .5;
  const zone = (Math.floor(x / width * 6) + .5) * width / 6;
  const direction = x >= zone ? -1 : 1;
  let fromX = x;
  let fromY = y;
  let bow = 0;
  switch (dot.swarm) {
    case 'structure':
      fromX = .38 * zone + .62 * x + grain * width * .031;
      fromY = Math.min(height * .98, y + (height - y) * .29 + height * .06);
      bow = height * .016;
      break;
    case 'foliage':
      fromX = x + width * (direction * .086 + grain * .047);
      fromY = y - height * (.045 + grain * .047);
      bow = -height * .036;
      break;
    case 'water': {
      const cascade = layout && cascadeAt(layout, x / width, y / height);
      fromX = cascade ? cascade.top[0] * width + (x - cascade.foot[0] * width) * .47 : x - width * .07;
      fromY = cascade ? Math.min(y - height * .009, cascade.top[1] * height - height * .035) : y - height * .023;
      bow = height * .009;
      break;
    }
    case 'atmosphere':
      fromX = x - width * (.09 + grain * .06);
      fromY = y + height * (.023 + grain * .04);
      bow = -height * .022;
      break;
    case 'detail':
      fromX = x + width * (direction * .031 + grain * .018);
      fromY = y - height * .021;
      bow = -height * .012;
      break;
  }
  return { ...target, dot, fromX, fromY, bendX: (fromX + x) / 2, bendY: (fromY + y) / 2 + bow };
}
