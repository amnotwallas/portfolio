import type { BonsaiData, BonsaiParticle } from './bonsai-data';
import type { illustratedWater, WaterLayout } from './landscape';

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
type WaterArt = Pick<(typeof illustratedWater)[keyof typeof illustratedWater], 'width' | 'height' | 'falls'>;
type Front = { dots: AssemblyDot[]; fall: number };
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
  const first = color.indexOf(' ', 4);
  const second = color.indexOf(' ', first + 1);
  const red = Number(color.slice(4, first));
  const green = Number(color.slice(first + 1, second));
  const blue = Number(color.slice(second + 1, -1));
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
  const steps = classifyAssemblySteps(data, layout);
  let step = steps.next();
  while (!step.done) step = steps.next();
  step.value.particles.sort((a, b) => a.reveal - b.reveal);
  return step.value;
}

export function* classifyAssemblySteps(data: BonsaiData, layout?: WaterLayout): Generator<void, AssemblyData> {
  const colors = new Map<string, Swarm>();
  const particles = new Array<AssemblyDot>(data.particles.length);
  for (let index = 0; index < data.particles.length; index++) {
    if (index && (index & 1023) === 0) yield;
    const dot = data.particles[index];
    const x = dot.x / data.width;
    const y = dot.y / data.height;
    const grain = variation(Math.round(dot.x * 103 + dot.y * 199)) - .5;
    let swarm: Swarm;
    let reveal: number;
    if (layout) {
      if (y >= layout.shoreline || cascadeAt(layout, x, y)) {
        swarm = 'water';
      } else {
        swarm = colors.get(dot.color) ?? pigment(dot.color);
        colors.set(dot.color, swarm);
      }
      // Water lanes guide motion without cutting holes in the shared deposition wave.
      const drift = .027 * Math.sin((x * .8 + y * .38) * Math.PI * 2);
      reveal = clamp(.24 + .29 * (1 - y) + drift + .32 * dot.reveal + .12 * grain);
    } else {
      swarm = 'structure';
      if (dot.lowVegetation || dot.material === 3) {
        swarm = dot.material === 3 && dot.reveal > .72 && pigment(dot.color) === 'detail'
          ? 'detail' : 'foliage';
      }
      const [first, last] = treeWindows[swarm];
      reveal = first + (last - first) * clamp(treeWave(swarm, dot, x) + .13 * grain);
    }
    particles[index] = {
      x: dot.x, y: dot.y, radius: dot.radius, material: dot.material,
      color: dot.color, opacity: dot.opacity, reveal, lowVegetation: dot.lowVegetation, swarm,
    };
  }
  return { ...data, particles };
}

export function buildCouriers(
  dots: AssemblyDot[], width: number, height: number, budget: number,
  project: (dot: AssemblyDot) => Point, layout?: WaterLayout, art?: WaterArt,
): Lane[] {
  const groups = new Map(roles.map((role) => [role, [] as AssemblyDot[]]));
  for (const dot of dots) groups.get(dot.swarm)?.push(dot);
  const populated = roles.filter((role) => groups.get(role)!.length);
  const shares = populated.reduce((sum, role) => sum + swarms[role].share, 0);
  const wood = layout ? [] : groups.get('structure')!.filter((dot) => dot.material < 3);
  const guideCount = Math.min(wood.length, 144);
  const guides = Array.from({ length: guideCount }, (_, i) => wood[Math.floor((i + .5) * wood.length / guideCount)]);
  const columnWidth = layout ? (art?.width ?? width) / 4 : 260;
  const rowHeight = layout ? (art?.height ?? height) / 3 : 300;
  return populated.flatMap((swarm) => {
    const group = groups.get(swarm)!;
    const { duration, share } = swarms[swarm];
    const count = Math.min(group.length, Math.floor(budget * share / shares));
    const fronts = new Map<number, Front>();
    for (const dot of group) {
      let fall = -1;
      let key: number;
      if (swarm === 'water' && layout && art) {
        const cascade = cascadeAt(layout, dot.x / art.width, dot.y / art.height);
        fall = cascade ? layout.cascades.indexOf(cascade) : -1;
        key = fall;
      } else {
        const column = Math.floor(dot.x / columnWidth);
        const row = Math.floor(dot.y / rowHeight);
        key = row * 32 + column;
      }
      let front = fronts.get(key);
      if (!front) {
        front = { dots: [], fall };
        fronts.set(key, front);
      }
      front.dots.push(dot);
    }
    // Let each drop send a front even when the pool contains many more targets.
    const weight = (front: Front) => swarm === 'water' && art ? 1 : Math.sqrt(front.dots.length);
    const total = [...fronts.values()].reduce((sum, front) => sum + weight(front), 0);
    let running = 0;
    let allocated = 0;
    return [...fronts.values()].flatMap((front) => {
      running += weight(front);
      const end = Math.round(count * running / total);
      const size = Math.min(front.dots.length, end - allocated);
      allocated = end;
      if (!size) return [];
      const center = project(front.dots[Math.floor(front.dots.length / 2)]);
      const lower = front.fall === 1;
      const members = Array.from({ length: size }, (_, i) => {
        const dot = front.dots[Math.floor((i + .5) * front.dots.length / size)];
        const support = branchSupport(dot, guides);
        return route(dot, project(dot), center, width, height, support && project(support), layout, art, front.fall);
      });
      return [{ swarm, duration: duration * (lower ? .84 : 1), next: 0, members }];
    });
  });
}

function branchSupport(dot: AssemblyDot, guides: AssemblyDot[]): AssemblyDot | undefined {
  const leaf = dot.swarm === 'foliage' && dot.material === 3;
  const wood = dot.swarm === 'structure' && dot.material < 3;
  if (!leaf && !wood) return;
  let closest: AssemblyDot | undefined;
  let distance = 255 ** 2;
  for (const guide of guides) {
    const lead = dot.reveal - guide.reveal;
    if (lead < (wood ? .035 : 0) || (wood && lead > .17)) continue;
    const dx = guide.x - dot.x;
    const dy = guide.y - dot.y;
    const score = dx * dx + dy * dy;
    if (score < distance) {
      distance = score;
      closest = guide;
    }
  }
  return closest;
}

function waterRoute(art: WaterArt, fall: number, target: Point, width: number, height: number) {
  const scaleX = width / art.width;
  const scaleY = height / art.height;
  const sx = target.x / scaleX;
  const sy = target.y / scaleY;
  const strands = art.falls[fall].strands;
  let strand = strands[0];
  let distance = Infinity;
  for (const candidate of strands) {
    const [ax, ay, bx, , cx, cy] = candidate;
    const t = clamp((sy - ay) / (cy - ay));
    const rest = 1 - t;
    const laneX = rest * rest * ax + 2 * rest * t * bx + t * t * cx;
    const score = Math.abs(laneX - sx) + Math.abs(sy - (ay + t * (cy - ay))) * .35;
    if (score < distance) {
      distance = score;
      strand = candidate;
    }
  }
  const [x, y, bend] = strand;
  const lip = Math.min(y * scaleY, target.y - height * .009);
  return {
    fromX: x * scaleX + width * .018,
    fromY: lip - height * .009,
    bendX: bend * scaleX,
    bendY: lip + .32 * (target.y - lip),
  };
}

function route(
  dot: AssemblyDot, target: Point, front: Point, width: number, height: number,
  support: Point | undefined, layout: WaterLayout | undefined, art: WaterArt | undefined, fall: number,
): Courier {
  const { x, y } = target;
  const grain = variation(Math.round(dot.x * 233 + dot.y * 97)) - .5;
  const direction = x >= front.x ? -1 : 1;
  if (art && fall >= 0) return { ...target, dot, ...waterRoute(art, fall, target, width, height) };
  if (support) {
    const dx = x - support.x;
    const dy = y - support.y;
    return {
      ...target, dot,
      fromX: support.x - dx * .55 + grain * width * .011,
      fromY: support.y - dy * .42 + grain * height * .008,
      bendX: support.x + dx * .1,
      bendY: support.y + dy * .09,
    };
  }
  let fromX = x;
  let fromY = y;
  let bow = 0;
  switch (dot.swarm) {
    case 'structure':
      fromX = .56 * front.x + .44 * x - width * (.032 - grain * .014);
      fromY = Math.min(height * .98, y + (height - y) * .24 + height * .037);
      bow = height * .013;
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
      fromX = .33 * front.x + .67 * x - width * (.13 + grain * .022);
      fromY = .28 * front.y + .72 * y + height * .022;
      bow = -height * .015;
      break;
    case 'detail':
      fromX = .38 * front.x + .62 * x + width * (direction * .022 + grain * .012);
      fromY = y - height * .017;
      bow = -height * .007;
      break;
  }
  return { ...target, dot, fromX, fromY, bendX: (fromX + x) / 2, bendY: (fromY + y) / 2 + bow };
}
