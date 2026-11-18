type Coordinate = readonly [x: number, y: number];
type Cascade = { top: Coordinate; foot: Coordinate; width: number };
export type WaterLayout = { cascades: readonly Cascade[]; shoreline: number };
type Rock = readonly [x: number, floor: number, halfWidth: number, height: number, seed: number];
type Tree = readonly [x: number, floor: number, height: number, lean: number, seed: number];

const paper = '#f5efe5';
const compactRidge: Coordinate[] = [[-.08, .69], [.08, .63], [.28, .57], [.46, .49], [.61, .53], [.79, .43], [1.05, .58]];
const wideRidge: Coordinate[] = [[.31, .49], [.38, .435], [.50, .288], [.55, .343], [.607, .215], [.642, .266], [.681, .144], [.73, .235], [.84, .32], [.918, .236], [1.06, .355]];
const compactBank: Coordinate[] = [[0, .785], [.18, .755], [.29, .713], [.49, .755], [.64, .794], [.81, .765], [1.06, .69]];
const wideBank: Coordinate[] = [[.302, .896], [.377, .666], [.444, .591], [.49, .646], [.562, .62], [.652, .687], [.742, .668], [.841, .643], [.925, .581], [1.065, .632]];
const compactRocks: Rock[] = [
  [.16, .905, .19, .106, 5], [.34, .897, .23, .15, 47], [.52, .925, .14, .081, 31],
  [.78, .941, .3, .12, 67], [1.03, .93, .19, .17, 14], [.14, .937, .16, .04, 54],
];
const wideRocks: Rock[] = [
  [.39, .872, .08, .198, 5], [.482, .88, .096, .208, 47], [.602, .876, .063, .175, 11],
  [.929, .889, .116, .183, 14], [.887, .924, .123, .166, 67], [.726, .944, .132, .145, 31],
  [.626, .933, .049, .077, 74], [.554, .891, .081, .039, 15], [.373, .931, .086, .072, 53],
  [.834, .937, .056, .05, 25], [.953, .937, .074, .053, 54],
];
const compactTrees: Tree[] = [
  [.925, .783, .219, -.07, 21], [.08, .844, .113, .12, 52], [.34, .764, .125, -.19, 38],
  [.515, .916, .083, .14, 41],
];
const wideTrees: Tree[] = [
  [.931, .748, .141, -.12, 21], [.411, .638, .132, .13, 37], [.349, .88, .108, -.17, 52],
  [.618, .847, .087, -.1, 41],
];
const compactFalls: Cascade[] = [
  { top: [.383, .767], foot: [.325, .894], width: .258 },
  { top: [.305, .908], foot: [.294, .943], width: .31 },
];
const wideFalls: Cascade[] = [
  { top: [.557, .676], foot: [.522, .828], width: .09 },
  { top: [.499, .884], foot: [.49, .93], width: .145 },
];
// Match the glints to the waterfall lips and splash pools in each sampled backdrop.
export const sampledWater = {
  portrait: {
    cascades: [
      { top: [.234, .779], foot: [.203, .868], width: .122 },
      { top: [.227, .899], foot: [.22, .927], width: .245 },
    ] satisfies Cascade[],
    shoreline: .937,
  },
  wide: {
    cascades: [
      { top: [.558, .676], foot: [.545, .845], width: .068 },
      { top: [.502, .887], foot: [.499, .929], width: .157 },
    ] satisfies Cascade[],
    shoreline: .933,
  },
};

function rng(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function mark(paths: Path2D[], tone: number, x: number, y: number, radius: number): void {
  const path = paths[tone];
  if (radius < .39) {
    path.rect(x, y, radius * 2, radius * 1.85);
    return;
  }
  path.moveTo(x + radius, y);
  path.arc(x, y, radius, 0, Math.PI * 2);
}

function stipple(
  ctx: CanvasRenderingContext2D, colors: readonly string[], draw: (paths: Path2D[]) => void,
): void {
  const paths = colors.map(() => new Path2D());
  draw(paths);
  paths.forEach((path, index) => {
    ctx.fillStyle = colors[index];
    ctx.fill(path);
  });
}

function outline(points: Coordinate[], x: number): number {
  const end = points.findIndex(([at]) => at > x);
  if (end <= 0) return points[end === 0 ? 0 : points.length - 1][1];
  const [ax, ay] = points[end - 1];
  const [bx, by] = points[end];
  const along = (x - ax) / (bx - ax);
  return ay + (by - ay) * (.4 * along + .6 * (.5 - .5 * Math.cos(Math.PI * along)));
}

function ridgeline(
  ctx: CanvasRenderingContext2D, width: number, height: number, ridge: Coordinate[], count: number, near: boolean,
): void {
  const random = rng(near ? 166 : 7139);
  const start = Math.max(0, ridge[0][0]);
  const colors = near
    ? ['#74827838', '#7a806641', '#89947a35', '#a2a79354', '#f4eee288']
    : ['#818a7736', '#7d8a7347', '#9da39037', '#b4b2a34a'];
  const deep = near ? .28 : .25;

  stipple(ctx, colors, (paths) => {
    for (let i = 0; i < count; i++) {
      const x = start + random() * (1 - start);
      const depth = random();
      const top = outline(ridge, x) + Math.sin(x * 118) * .005 + Math.sin(x * 331) * .0024 + Math.sin(x * 527) * .0015;
      const fold = .68 + .21 * Math.sin(x * 39 + depth * 13) + .13 * Math.sin(x * 93 - depth * 28);
      if (random() > fold * (1 - depth ** 1.35)) continue;
      const y = top + depth ** 1.4 * deep * (.85 + .27 * Math.cos(x * 15));
      const tone = Math.floor(random() * colors.length);
      mark(paths, tone, x * width, y * height, .2 + random() * (near ? .47 : .37));
    }
  });
}

function distantTrees(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean): void {
  const conifers: Tree[] = compact
    ? [[.06, .832, .142, -.05, 91], [.245, .788, .134, .01, 451], [.605, .77, .157, -.09, 74], [.939, .781, .252, .04, 82]]
    : [[.372, .695, .129, -.08, 82], [.442, .619, .127, -.02, 21], [.484, .625, .224, .016, 49],
      [.51, .644, .166, -.015, 23], [.542, .654, .203, .024, 72], [.609, .675, .146, -.04, 27],
      [.687, .668, .124, .045, 91], [.946, .582, .369, -.03, 38], [.974, .557, .411, .024, 82], [1.005, .6, .262, -.03, 61]];
  stipple(ctx, ['#5d765c45', '#78876c55', '#a5a68a69', '#5d745c77'], (paths) => {
    for (const [position, floor, tall, lean, seed] of conifers) {
      const random = rng(seed);
      const size = tall * height;
      const start = position * width;
      const base = floor * height;
      const bands = Math.round(8 + size / 24);
      for (let row = 0; row < bands; row++) {
        const t = .17 + row / bands * .82;
        const arm = size * (.17 + random() * .13) * (1 - t) ** .76;
        for (const side of [-1, 1]) {
          for (let i = 0; i < arm * (compact ? 1.6 : 2.5) + 9; i++) {
            const along = random();
            const x = start + size * lean * t * t + side * arm * along;
            const y = base - size * t + arm * (.3 * along - .49 * along ** 4)
              + (random() + random() - 1) * (2 + arm * .34 * Math.sin(Math.PI * along));
            mark(paths, Math.floor(random() * paths.length), x, y, .25 + random() * .58);
          }
        }
      }
      for (let i = 0; i < size * 1.52; i++) {
        const t = random();
        mark(paths, 1, start + size * lean * t * t + (random() - .5) * size * .016 * (1 - t),
          base - size * t, .28 + random() * .62);
      }
    }
  });
}

function paintRocks(
  ctx: CanvasRenderingContext2D, width: number, height: number, rocks: Rock[], budget: number, near: boolean,
): void {
  const colors = near
    ? ['#46574edb', '#2f4338c4', '#6b7960cf', '#a09f80a8', '#bbaa84ab', '#ded8c1bc', '#efead7c5']
    : ['#53655a93', '#526953a2', '#71816b9e', '#829071a3', '#bea77a8c', '#cbc6ac95', '#e3ddc6b8'];
  for (const [x, floor, halfWidth, tall, seed] of rocks) {
    const random = rng(seed);
    const middle = x * width;
    const half = halfWidth * width;
    const size = tall * height;
    const base = floor * height;
    const count = Math.floor(half * size * budget);
    const edge = (u: number) => Math.max(.03, 1 - u * u) ** .66
      * (.77 + Math.sin(u * 4.8 + seed) * .17 + .083 * Math.sin(u * 16.5) + .041 * Math.sin(u * 43.7));
    ctx.fillStyle = near ? '#43584d3b' : '#73877426';
    ctx.beginPath();
    ctx.moveTo(middle - half, base);
    for (let i = 0; i <= 38; i++) {
      const u = i / 19 - 1;
      ctx.lineTo(middle + u * half, base - size * edge(u));
    }
    ctx.lineTo(middle + half, base);
    ctx.fill();
    stipple(ctx, colors, (paths) => {
      for (let i = 0; i < count; i++) {
        const u = random() * 2 - 1;
        const v = random();
        const top = edge(u);
        const facet = Math.cos(u * 4.4 + v * 11 + seed) * Math.cos(v * 29 - u * 7)
          + .31 * Math.sin(u * 41 + v * 62);
        if (random() < ((1 - top) ** 2) * .6) continue;
        const glint = random();
        let tone = 0;
        if (v < .23) tone = glint < .22 ? 5 : glint < .72 ? 2 : 4;
        else if (v < .68 && facet < -.3) tone = glint < .31 ? 6 : glint < .66 ? 3 : 2;
        else if (v > .7 || facet > .52) tone = glint < .64 ? 1 : 0;
        else tone = glint < .61 ? 0 : 2;
        mark(paths, tone, middle + u * half, base - size * top * (1 - v),
          .34 + random() * (near ? 1.1 : .72));
      }
    });
  }
}

function grove(ctx: CanvasRenderingContext2D, width: number, height: number, trees: Tree[], near: boolean): void {
  const colors = near
    ? ['#625642c7', '#958265c8', '#2c6152c7', '#527c64be', '#789073c7', '#c99664b8', '#bb6c48b9']
    : ['#746e54b5', '#94886da9', '#4d766596', '#779184a5', '#8f9d82ab', '#c2a77f99', '#bf855889'];
  stipple(ctx, colors, (paths) => {
    for (const [at, floor, tall, lean, seed] of trees) {
      const random = rng(seed);
      const size = height * tall;
      const x = at * width;
      const y = floor * height;
      const direction = Math.sign(lean);
      const spread = Math.min(size * 1.1, width * .22);
      const spine = (t: number): number => x + spread * (lean * t * 2.2 - .102 * Math.sin(t * 7.9) * Math.sin(t * 3.02));
      for (let i = 0; i < size * 8.3; i++) {
        const t = random() * .91;
        const u = random();
        const r = (1 - t) ** .7 * size * .10;
        mark(paths, u < .28 ? 1 : 0, spine(t) + (u - .5) * r, y - size * t, .32 + random() * .65);
      }

      const forks = seed % 2 === 0 ? [.32, .52, .69, .83, .94] : [.39, .57, .75, .94];
      for (let branch = 0; branch < forks.length; branch++) {
        const t = forks[branch];
        const side = branch % 2 === 0 ? -direction : direction;
        const reach = spread * side * (random() * .24 + .26) * (1.08 - t * .49);
        const tip = spine(t) + reach;
        const lift = size * (.135 + random() * .068);
        const crown = y - size * t - lift;
        const leafWidth = Math.abs(reach) * (.88 + random() * .49);
        for (let i = 0; i < size * .8; i++) {
          const u = random();
          mark(paths, random() < .23 ? 1 : 0, spine(t) + reach * u,
            y - size * t - lift * u ** 1.7 + (random() - .5) * (2.9 - u * 1.9), .38 + random() * .58);
        }
        for (let i = 0; i < Math.min(560, size * (2.9 + random())); i++) {
          const angle = random() * Math.PI * 2;
          const r = Math.sqrt(random());
          const u = Math.cos(angle) * r;
          const v = Math.sin(angle) * r;
          const tone = random();
          const pigment = tone < .028 ? 6 : tone < .08 ? 5 : v > .14 ? 2 : tone < .61 ? 3 : 4;
          mark(paths, pigment, tip + u * leafWidth, crown + v * leafWidth * .32
            + Math.sin(u * 12 + seed) * leafWidth * .083, .34 + random() * (near ? .94 : .71));
        }
      }
    }
  });
}

function pool(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean): void {
  const shoreline = height * (compact ? .932 : .917);
  const tint = ctx.createLinearGradient(0, shoreline, 0, height);
  tint.addColorStop(0, '#89918030');
  tint.addColorStop(.22, '#b8bc9e65');
  tint.addColorStop(1, '#6b928d8c');
  ctx.fillStyle = tint;
  ctx.fillRect(0, shoreline, width, height - shoreline);

  const random = rng(657);
  const count = compact ? 3200 : Math.min(12000, width * 7);
  const colors = ['#3e60575e', '#527b7383', '#9aa89492', '#e8e7cccb', '#f3e9ccaa', '#c2aa7787'];
  stipple(ctx, colors, (paths) => {
    for (let i = 0; i < count; i++) {
      const x = random();
      const y = random();
      const amount = compact ? .23 : .19;
      const reflected = Math.abs(x - .77) < amount * (.75 + .3 * Math.sin(x * 49 + y * 11))
        || Math.abs(x - .31) < .11 && y < .49;
      const tone = random();
      const pigment = reflected
        ? tone < .36 ? 0 : tone < .76 ? 1 : tone < .92 ? 2 : 5
        : tone < .47 ? 2 : tone < .73 ? 3 : tone < .87 ? 4 : 1;
      const spread = 1 + y * (compact ? 7 : 18);
      paths[pigment].rect(x * width, shoreline + y * (height - shoreline),
        .3 + random() ** 3 * spread, .22 + random() * (.35 + y * .35));
    }
  });
}

function falls(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean): void {
  const random = rng(905);
  const colors = ['#f9f5eacb', '#f6efddc9', '#ecebdbc7', '#e5e8daac', '#638275b0', '#99aca18c'];
  for (const cascade of compact ? compactFalls : wideFalls) {
    const veilWidth = cascade.width * width;
    const vertical = (cascade.foot[1] - cascade.top[1]) * height;
    const topX = cascade.top[0] * width;
    const topY = cascade.top[1] * height;
    const endX = cascade.foot[0] * width;
    const endY = cascade.foot[1] * height;
    const streaks = Math.round(veilWidth / 4.7);
    for (let i = 0; i < streaks; i++) {
      const u = (i / streaks - .5) * veilWidth;
      const top = topY + Math.sin(i * .96) * 1.8 + u * -.075;
      const foot = endY - Math.sin(i / streaks * Math.PI) * vertical * .06;
      ctx.strokeStyle = i % 4 === 0 ? '#f9f5ebd9' : '#eeeedd9e';
      ctx.lineWidth = .45 + random() ** 2 * 2.1;
      ctx.beginPath();
      ctx.moveTo(topX + u, top);
      ctx.bezierCurveTo(topX + u - vertical * .23, top + 6, endX + u * .91, foot - vertical * .25, endX + u * .83, foot);
      ctx.stroke();
    }

    stipple(ctx, colors, (paths) => {
      for (let i = 0; i < veilWidth * vertical * .31; i++) {
        const u = (random() - .5) * veilWidth;
        const t = random();
        const stripe = Math.sin(u * 1.31 + t * .69) * Math.sin(u * .37 + t * 2.4);
        const x = topX + (endX - topX) * (1 - (1 - t) ** 2.35) + u * (1 - t * .17);
        const y = topY + t * vertical - (1 - t) * u * .075;
        const ink = stripe > .44 && t > .08 && t < .96;
        mark(paths, ink ? 4 + (i % 2) : i % 4, x, y, .26 + random() * (ink ? .35 : .72));
      }
      for (let i = 0; i < veilWidth * 11; i++) {
        const u = (random() + random() - 1) * veilWidth * .8;
        const t = random();
        mark(paths, i % 4, endX + u, endY + (t * t - .33) * Math.min(14, vertical * .31), .26 + random() * .75);
      }
    });
  }
}

function reeds(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean): void {
  const random = rng(44583);
  const colors = ['#326b5aa5', '#537960a8', '#a192638a', '#7b9671a8', '#435b48b5'];
  stipple(ctx, colors, (paths) => {
    for (let i = 0; i < (compact ? 69 : 160); i++) {
      const onLeft = i % 3 !== 0;
      const offset = random() ** 2.2 * (compact ? .25 : .31);
      const x = width * (onLeft ? offset : 1 - offset);
      const base = height * (.937 + random() * .074);
      const tall = height * (.007 + random() ** 2 * .056);
      const tilt = tall * (.75 + random() * .89) * (i % 2 ? -1 : 1);
      for (let point = 0; point < 3 + tall * .81; point++) {
        const t = random();
        const shape = t * t * .72 + t * .28;
        mark(paths, i % paths.length, x + tilt * shape + (random() - .5) * 2,
          base - tall * (t * 1.5 - t ** 3 * .53), .27 + random() * .74);
      }
    }
  });
}

export function paintLandscape(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  const wash = ctx.createLinearGradient(width * .19, height * .2, width * .92, height);
  wash.addColorStop(0, paper);
  wash.addColorStop(.61, '#f5eee2');
  wash.addColorStop(1, '#ece8d5');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  const grain = rng(613);
  const area = Math.min(width * height, 2_250_000);
  stipple(ctx, ['#967e6328', '#ffffff6b'], (paths) => {
    for (let i = 0; i < area * .017; i++) {
      mark(paths, i % 2, grain() * width, grain() * height, .15 + grain() * .27);
    }
  });

  ridgeline(ctx, width, height, compact ? compactRidge : wideRidge, area * (compact ? .04 : .05), false);
  if (!compact) ridgeline(ctx, width, height, [[0, .865], [.049, .813], [.115, .838], [.154, .777], [.21, .854],
    [.257, .885], [.333, .871], [.41, .933]], area * .009, false);
  distantTrees(ctx, width, height, compact);
  ridgeline(ctx, width, height, compact ? compactBank : wideBank, area * .051, true);

  const rocks = compact ? compactRocks : wideRocks;
  const trees = compact ? compactTrees : wideTrees;
  const rockBudget = Math.min(.57, 740_000 / area);
  paintRocks(ctx, width, height, rocks.slice(0, compact ? 2 : 4), rockBudget, false);
  grove(ctx, width, height, trees.slice(0, 2), false);
  pool(ctx, width, height, compact);
  paintRocks(ctx, width, height, rocks.slice(compact ? 2 : 4), rockBudget, true);
  falls(ctx, width, height, compact);
  grove(ctx, width, height, trees.slice(2), true);
  reeds(ctx, width, height, compact);
  ctx.restore();
}

function createStamp(center: string, mid: string, edge: string): HTMLCanvasElement | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, center);
  gradient.addColorStop(.65, mid);
  gradient.addColorStop(1, edge);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return canvas;
}

export function createAtmosphereStamps() {
  return {
    mist: createStamp('#f8f3e7d8', '#f8f3e735', '#f8f3e700'),
    glow: createStamp('#ffe6a8', '#efaf6b49', '#d98b4200'),
    smoke: createStamp('#777d6d9c', '#97978628', '#afae9f00'),
  };
}

type AtmosphereStamps = ReturnType<typeof createAtmosphereStamps>;
const lanterns = {
  portrait: { x: 747 / 863, light: 1448 / 1823, roof: 1396 / 1823 },
  wide: { x: 1497 / 1672, light: 660 / 941, roof: 610 / 941 },
};

function paintLantern(
  ctx: CanvasRenderingContext2D, width: number, height: number, layout: keyof typeof lanterns,
  elapsed: number, gain: number, stamps: AtmosphereStamps,
): void {
  const lantern = lanterns[layout];
  const x = width * lantern.x;
  const y = height * lantern.light;
  const roof = height * lantern.roof;
  const size = Math.min(20, Math.max(7, width * .014));
  if (stamps.glow) {
    const light = .73 + .14 * Math.sin(elapsed / 670) + .09 * Math.sin(elapsed / 173);
    ctx.globalAlpha = gain * light * .76;
    ctx.drawImage(stamps.glow, x - size * 1.65, y - size * 1.45, size * 3.3, size * 2.9);
    ctx.globalAlpha = gain * light * .86;
    ctx.drawImage(stamps.glow, x - size * .5, y - size * .68, size, size * 1.36);
  }
  if (stamps.smoke) {
    const lift = Math.min(53, Math.max(26, height * .055));
    const puffs = width < 640 ? 8 : 12;
    for (let i = 0; i < puffs; i++) {
      const phase = (elapsed / 5700 + i / puffs) % 1;
      const sway = Math.sin(phase * 7.2 - elapsed / 2100) * phase;
      const px = x + lift * (.22 * phase + .24 * sway);
      const py = roof - 2 - lift * phase;
      const radius = 1.1 + size * (.08 + phase * .38);
      ctx.globalAlpha = gain * .53 * Math.sin(Math.PI * phase);
      ctx.drawImage(stamps.smoke, px - radius, py - radius * 1.35, radius * 2, radius * 2.7);
    }
  }
}

function fallCenter(start: number, end: number, lane: number, t: number): number {
  return start + (end - start) * (1 - (1 - t) ** 2.35) + lane * (1 - t * .17);
}

function paintFallStreams(
  ctx: CanvasRenderingContext2D, cascade: Cascade, width: number, height: number, compact: boolean,
  elapsed: number, gain: number, phase: number,
): void {
  const count = compact ? 5 : 8;
  const start = cascade.top[0] * width;
  const end = cascade.foot[0] * width;
  const lip = cascade.top[1] * height;
  const depth = (cascade.foot[1] - cascade.top[1]) * height;
  const spread = cascade.width * width;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const t = (elapsed / (1110 + (i % 4) * 143) + i * .287 + phase) % 1;
    const lane = spread * ((i + .5) / count - .5);
    const tail = Math.max(0, t - (.105 + i % 3 * .032));
    const bend = (tail + t) * .5;
    const contrast = i % 4 === 1;
    ctx.strokeStyle = contrast ? '#80a29a' : '#fffbee';
    ctx.lineWidth = compact ? .86 : 1.2;
    ctx.globalAlpha = gain * (contrast ? .38 : .84) * Math.min(1, t * 8, (1 - t) * 8);
    ctx.beginPath();
    ctx.moveTo(fallCenter(start, end, lane, tail), lip + tail * depth);
    ctx.quadraticCurveTo(fallCenter(start, end, lane, bend), lip + bend * depth,
      fallCenter(start, end, lane, t), lip + t * depth);
    ctx.stroke();
  }
  ctx.strokeStyle = '#fff8e5';
  ctx.lineWidth = .65;
  for (let i = 0; i < 3; i++) {
    const t = (elapsed / 1200 + phase + i / 3) % 1;
    const x = end + ((i - 1) * .26 * spread);
    const y = lip + depth + t * 3;
    const ripple = spread * (.055 + t * .14);
    ctx.globalAlpha = gain * .56 * Math.sin(Math.PI * t);
    ctx.beginPath();
    ctx.moveTo(x - ripple, y);
    ctx.quadraticCurveTo(x, y + .9, x + ripple, y);
    ctx.stroke();
  }
}

const fishMarks = [
  [-8, -2.6, .95], [-7, -1.2, .9], [-7, 1.2, .85], [-8, 2.5, .7], [-5.5, 0, 1],
  [-3.6, -.8, 1.2], [-3.2, 1, 1.1], [-1.8, -2, 1.1], [-1.1, .1, 1.6],
  [-1.2, 2, 1], [.4, -2.6, 1.1], [.9, -.7, 1.5], [.9, 1.6, 1.3],
  [2.9, -1.6, 1.3], [3.1, .7, 1.5], [5.2, -.4, 1.3], [6.3, .1, .7],
] as const;

function paintFishJump(
  ctx: CanvasRenderingContext2D, width: number, height: number, shoreline: number,
  compact: boolean, elapsed: number, gain: number,
): void {
  const age = (elapsed - 13600) % 28500;
  if (age < 0 || age >= 2150) return;
  const flight = 920;
  const origin = width * (compact ? .23 : .43);
  const distance = Math.min(width * .1, compact ? 38 : 83);
  const surface = height * (shoreline + (1 - shoreline) * .5);
  const rise = Math.min(height * .036, compact ? 22 : 32);
  const scale = Math.min(1.5, Math.max(.86, width / 885));

  ctx.save();
  ctx.lineWidth = .75;
  ctx.strokeStyle = '#48796e';
  for (let i = 0; i < 2; i++) {
    const wave = (age - i * flight) / 1200;
    if (wave <= 0 || wave >= 1) continue;
    const spread = 2 + wave * 22 * scale;
    ctx.globalAlpha = gain * .58 * (1 - wave) * Math.min(1, wave * 12);
    ctx.beginPath();
    ctx.ellipse(origin + i * distance, surface, spread, spread * .18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (age < flight) {
    const t = age / flight;
    ctx.translate(origin + distance * t, surface - 4 * rise * t * (1 - t));
    ctx.rotate(Math.atan2(4 * rise * (2 * t - 1), distance));
    ctx.scale(scale, scale);
    ctx.globalAlpha = gain * Math.min(1, t * 12, (1 - t) * 13);
    ctx.fillStyle = '#985739';
    ctx.beginPath();
    for (const [x, y, r] of fishMarks) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#f4bc8b';
    ctx.beginPath();
    ctx.arc(.3, -1.75, .95, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function paintLandscapeMotion(
  ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean, elapsed: number,
  backdrop?: keyof typeof sampledWater, waterGain = 1, mistGain = 1, stamps?: AtmosphereStamps,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  const water = backdrop ? sampledWater[backdrop] : undefined;
  const cascades = water?.cascades ?? (compact ? compactFalls : wideFalls);
  for (let index = 0; waterGain && index < cascades.length; index++) {
    const cascade = cascades[index];
    const phase = index === 0 ? 0 : .47;
    paintFallStreams(ctx, cascade, width, height, compact, elapsed, waterGain, phase);
    const fallWidth = cascade.width * width;
    const vertical = (cascade.foot[1] - cascade.top[1]) * height;
    const glints = compact ? 8 : 14;
    ctx.globalAlpha = waterGain;
    ctx.fillStyle = '#fffbedbc';
    ctx.beginPath();
    for (let i = 0; i < glints; i++) {
      const t = (elapsed / (1650 + i % 5 * 189) + i * .419 + phase) % 1;
      const u = (i / glints - .47) * fallWidth;
      const x = fallCenter(width * cascade.top[0], width * cascade.foot[0], u, t);
      const y = height * cascade.top[1] + t * vertical - (1 - t) * u * .075;
      const radius = (.46 + (i % 4) * .09) * Math.min(1, t * 9, (1 - t) * 14);
      for (let tail = 0; tail < 3; tail++) {
        const dropX = x - tail * .4;
        const dropY = y + tail * (1.2 + t * .48);
        const size = radius * (1 - tail * .19);
        ctx.moveTo(dropX + size, dropY);
        ctx.arc(dropX, dropY, size, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  const shoreline = water?.shoreline ?? (compact ? .943 : .927);
  for (let i = 0; waterGain && i < (compact ? 13 : 25); i++) {
    const wave = .5 + .5 * Math.sin(elapsed / (1075 + i * 39) + i * 4.01);
    const left = ((i * .61803) % 1) * width + wave * 2.3 - 2;
    const y = height * (shoreline + ((i * .30227) % 1) * (1 - shoreline)) + wave * .65;
    const length = (5 + i % 7 * 7) * (.5 + wave * .6);
    ctx.fillStyle = i % 3 ? '#fff5d8' : '#557c6b';
    ctx.globalAlpha = waterGain * (.08 + wave * wave * .31);
    ctx.fillRect(left, y, length, .8);
    ctx.globalAlpha *= .58;
    ctx.fillRect(left + length + 2.5, y, length * .24, .65);
  }
  if (waterGain) paintFishJump(ctx, width, height, shoreline, compact, elapsed, waterGain);

  if (stamps?.mist && mistGain) {
    const waterfall = cascades[0];
    const drift = Math.sin(elapsed / 4800);
    const cx = width * waterfall.foot[0] + drift * (compact ? 3 : 8);
    const cy = height * waterfall.foot[1] + 3 * Math.sin(elapsed / 3700);
    const radius = width * (compact ? .2 : .12);
    ctx.globalAlpha = mistGain * (.23 + .06 * drift);
    ctx.drawImage(stamps.mist, cx - radius, cy - radius * .3, radius * 2, radius * .6);
  }
  if (backdrop && stamps && mistGain) paintLantern(ctx, width, height, backdrop, elapsed, mistGain, stamps);
  ctx.restore();
}
