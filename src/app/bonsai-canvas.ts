import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { ASSEMBLY_MS, decodeBonsai, fitBonsai, growthProgress, landscapeVariant, type BonsaiData, type BonsaiParticle } from './bonsai-data';
import { createAtmosphereStamps, illustratedWater, paintLandscape, paintLandscapeMotion, sampledWater, waterlineAt } from './landscape';
import { buildCouriers, ease, scheduleAssembly, swarmWeight, variation, type AssemblyData, type Lane } from './forest-assembly';

type BirdDot = { x: number; y: number; radius: number };
type Backdrop = ReturnType<typeof landscapeVariant>;
type BackdropAssembly = { data: AssemblyData; next: number; scaleX: number; scaleY: number; radiusScale: number };

const RAVEN_ENTRY_MS = ASSEMBLY_MS + 600;
const RAVEN_FLIGHT_MS = 4000;
const PAPER = '#f5efe5';
type FallingLeaf = { dot: BonsaiParticle; start: number; duration: number; drift: number; burst: boolean };
type WindMark = { dot: BonsaiParticle; grass: boolean; phase: number; tempo: number; landing: number };

function birdEllipse(cx: number, cy: number, rx: number, ry: number, angle: number, seed: number): BirdDot[] {
  const dots: BirdDot[] = [];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let row = -ry; row <= ry; row += 2.4) {
    for (let col = -rx; col <= rx; col += 2.4) {
      const noise = Math.sin((col + seed * 13) * 12.9898 + (row + seed * 7) * 78.233) * 43758.5453;
      const fraction = noise - Math.floor(noise);
      const px = col + (fraction - .5) * 1.1;
      const py = row + (fraction - .5) * .8;
      if ((px / rx) ** 2 + (py / ry) ** 2 > 1) continue;
      dots.push({ x: cx + px * cosine - py * sine, y: cy + px * sine + py * cosine, radius: 1 + fraction * .55 });
    }
  }
  return dots;
}

const birdTail = [
  ...birdEllipse(-28, 3, 20, 3, -.18, 1),
  ...birdEllipse(-29, 9, 18, 3, .12, 6),
];
const birdBody = birdEllipse(0, 0, 24, 13, -.12, 2);
const birdHead = birdEllipse(18, -9, 10, 10, 0, 3);
const birdFoldedWing = birdEllipse(-3, -3, 16, 7, -.25, 4);
const birdFlightWing = [
  ...birdEllipse(-6, -16, 9, 19, -.25, 7),
  ...birdEllipse(-15, -31, 5, 14, -.2, 8),
  ...birdEllipse(2, -28, 4, 11, .15, 9),
];
const birdBeak = birdEllipse(35, -8, 10, 2.8, -.08, 5);
const birdEye: BirdDot[] = [{ x: 21, y: -12, radius: 1.6 }];
const birdFeet: BirdDot[] = [
  { x: -5, y: 11, radius: 1.3 }, { x: -5, y: 15, radius: 1.3 }, { x: -5, y: 19, radius: 1.3 }, { x: -9, y: 20, radius: 1.2 },
  { x: 7, y: 11, radius: 1.3 }, { x: 7, y: 15, radius: 1.3 }, { x: 7, y: 19, radius: 1.3 }, { x: 3, y: 20, radius: 1.2 },
];

@Component({
  selector: 'app-bonsai-canvas',
  standalone: true,
  template: '<canvas #surface aria-hidden="true"></canvas><img #fallback alt="" aria-hidden="true" hidden />',
  styles: `
    :host { display: block; position: relative; width: 100%; height: 100%; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; pointer-events: auto; }
    img { position: absolute; right: .5%; bottom: 5%; width: min(55%, 69dvh); mix-blend-mode: multiply; }
    :host(.fallback-visible) { background: linear-gradient(to bottom, #f6f0e6 65%, #e4e7d8 91%, #bcc7b9); }
    canvas[hidden], img[hidden] { display: none; }
    @media (max-width: 639px) { img { width: min(94%, 40dvh); bottom: 3%; } }
  `,
})
export class BonsaiCanvas implements AfterViewInit, OnChanges, OnDestroy {
  @Input() paused = false;
  @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fallback', { static: true }) private fallback!: ElementRef<HTMLImageElement>;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly abort = new AbortController();
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reduced = this.motion.matches;
  private readonly constrained = (window.navigator?.hardwareConcurrency || 8) <= 4;
  private resizeObserver?: ResizeObserver;
  private data?: AssemblyData;
  private animatedDots: WindMark[] = [];
  private windDots = new Set<BonsaiParticle>();
  private fallingSources: BonsaiParticle[] = [];
  private branchSources: BonsaiParticle[] = [];
  private readonly fallingLeaves: FallingLeaf[] = [];
  private readonly leafPool: FallingLeaf[] = [];
  private nextFallAt = 6700 + Math.random() * 1000;
  private birdLandedAt?: number;
  private context?: CanvasRenderingContext2D;
  private landscape?: HTMLCanvasElement;
  private landscapeContext?: CanvasRenderingContext2D;
  private atmosphereStamps?: ReturnType<typeof createAtmosphereStamps>;
  private readonly landmarks = new Map<Backdrop, AssemblyData | 'pending' | null>();
  private backdropAssembly?: BackdropAssembly;
  private backdropLanes: Lane[] = [];
  private backdropFadeAt?: number;
  private layer?: HTMLCanvasElement;
  private layerContext?: CanvasRenderingContext2D;
  private view?: ReturnType<typeof fitBonsai>;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private treeLanes: Lane[] = [];
  private cursor?: { x: number; y: number };
  private lastTap = -Infinity;
  private frame = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private next = 0;
  private progress = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.start());
  }

  ngOnChanges(): void {
    this.zone.runOutsideAngular(this.updateAnimation);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.updateAnimation);
    this.motion.removeEventListener('change', this.onMotionChange);
  }

  private async start(): Promise<void> {
    const canvas = this.surface.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return this.showFallback();
    this.context = context;
    try {
      const compressed = typeof DecompressionStream !== 'undefined';
      const box = this.host.nativeElement.getBoundingClientRect();
      if (box.width && box.height) {
        if (!this.reduced) this.showSeeds(canvas, context, box.width, box.height);
        this.loadBackdrop(landscapeVariant(box.width, box.height));
      }
      const raw = await this.readParticles(compressed ? 'bonsai-particles.pack' : 'bonsai-particles.bin');
      if (this.destroyed) return;
      const data = scheduleAssembly(raw);
      this.data = data;
      const airborne = data.particles.filter((dot) => this.isAnimatedLeaf(dot) || this.isAnimatedGrass(dot));
      this.fallingSources = airborne.filter((dot) => dot.material === 3 && dot.y < 850 && dot.x > 90 && dot.x < data.width - 90);
      const moving = this.constrained ? airborne.filter((dot, index) => index % 2 === 0 || this.isAnimatedGrass(dot)) : airborne;
      this.windDots = new Set(moving);
      this.animatedDots = moving.map((dot) => {
        const grass = this.isAnimatedGrass(dot);
        const group = Math.floor(dot.x / 100) + Math.floor(dot.y / 100) * 11;
        const landing = grass ? 0 : Math.max(0, 1 - Math.hypot(dot.x - 875, dot.y - 590) / 260);
        return { dot, grass, phase: group * .7, tempo: .88 + group % 5 * .06, landing };
      });
      this.branchSources = data.particles.filter((dot) => dot.material === 1 || dot.material === 2);
      canvas.addEventListener('click', this.onCanvasClick, { signal: this.abort.signal });
      canvas.addEventListener('pointermove', this.onPointerMove, { signal: this.abort.signal, passive: true });
      canvas.addEventListener('pointerleave', () => { this.cursor = undefined; }, { signal: this.abort.signal });
      this.landscape = document.createElement('canvas');
      this.landscapeContext = this.landscape.getContext('2d', { alpha: false }) ?? undefined;
      this.atmosphereStamps = createAtmosphereStamps();
      this.layer = document.createElement('canvas');
      this.layerContext = this.layer.getContext('2d') ?? undefined;
      if (!this.layerContext || !this.landscapeContext) return this.showFallback();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', this.updateAnimation);
      this.reduced = this.motion.matches;
      this.motion.addEventListener('change', this.onMotionChange);
      this.resize();
      this.updateAnimation();
    } catch {
      if (!this.destroyed) this.showFallback();
    }
  }

  private async readParticles(filename: string): Promise<BonsaiData> {
    const response = await fetch(new URL(filename, document.baseURI), { signal: this.abort.signal });
    if (!response.ok) throw new Error('Particle dataset unavailable');
    const buffer = filename.endsWith('.pack') && response.body
      ? await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : await response.arrayBuffer();
    return decodeBonsai(buffer);
  }

  private loadBackdrop(backdrop: Backdrop): void {
    if (typeof DecompressionStream === 'undefined' || this.landmarks.has(backdrop)) return;
    this.landmarks.set(backdrop, 'pending');
    void this.readParticles(`landscape-${backdrop}.pack`)
      .then((data) => {
        if (!this.destroyed) this.setBackdrop(backdrop, data.particles.length ? scheduleAssembly(data, sampledWater[backdrop]) : null);
      })
      .catch(() => this.setBackdrop(backdrop, null));
  }

  private setBackdrop(backdrop: Backdrop, data: AssemblyData | null): void {
    if (this.destroyed) return;
    this.landmarks.set(backdrop, data);
    if (this.view?.backdrop !== backdrop) return;
    this.backdropFadeAt = this.progress > .20 ? this.elapsed : undefined;
    this.paintBackdrop();
    if (this.paused || this.reduced) this.present(this.elapsed);
  }

  private paintBackdrop(): void {
    if (!this.landscapeContext || !this.view) return;
    const context = this.landscapeContext;
    const { pixelWidth, pixelHeight, compact, backdrop } = this.view;
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    this.backdropAssembly = undefined;
    this.backdropLanes = [];
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.globalAlpha = 1;
    const data = this.landmarks.get(backdrop);
    if (data === 'pending') {
      context.fillStyle = PAPER;
      context.fillRect(0, 0, width, height);
      return;
    }
    if (!data) {
      paintLandscape(context, width, height, compact);
      return;
    }
    context.fillStyle = data.background;
    context.fillRect(0, 0, width, height);
    const scaleX = width / data.width;
    const scaleY = height / data.height;
    const radiusScale = Math.sqrt(scaleX * scaleY);
    this.backdropAssembly = { data, next: 0, scaleX, scaleY, radiusScale };
    if (this.progress < 1 && !this.reduced) {
      const budget = this.constrained ? 86 : compact ? 116 : 290;
      this.backdropLanes = buildCouriers(data.particles, pixelWidth, pixelHeight, budget, (dot) => ({
        x: dot.x * pixelWidth / data.width,
        y: dot.y * pixelHeight / data.height,
        radius: dot.radius * radiusScale * this.view!.dpr,
      }), sampledWater[backdrop]);
    }
    this.paintBackdropUntil(this.progress);
  }

  private paintBackdropUntil(progress: number): void {
    const assembly = this.backdropAssembly;
    if (!assembly || !this.landscapeContext) return;
    const dots = assembly.data.particles;
    while (assembly.next < dots.length && dots[assembly.next].reveal <= progress) {
      const dot = dots[assembly.next++];
      this.drawDot(this.landscapeContext, dot, dot.x * assembly.scaleX, dot.y * assembly.scaleY,
        dot.opacity, dot.radius * assembly.radiusScale);
    }
  }

  private showFallback(): void {
    this.surface.nativeElement.hidden = true;
    this.host.nativeElement.classList.add('fallback-visible');
    this.fallback.nativeElement.src = 'bonsai.jpg';
    this.fallback.nativeElement.hidden = false;
  }

  private readonly onMotionChange = (event: MediaQueryListEvent): void => {
    this.reduced = event.matches;
    this.updateAnimation();
  };

  private readonly updateAnimation = (): void => {
    cancelAnimationFrame(this.frame);
    this.lastFrame = 0;
    if (this.destroyed || !this.view || document.hidden) return;
    if (this.reduced) {
      this.elapsed = Math.max(this.elapsed, RAVEN_ENTRY_MS + RAVEN_FLIGHT_MS + 1300);
      this.birdLandedAt ??= this.elapsed - 1300;
      this.nextFallAt = Math.max(this.nextFallAt, this.elapsed + 2800);
      this.paintUntil(1);
      this.present(this.elapsed);
    } else if (!this.paused) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed || document.hidden || this.paused || this.reduced || !this.view) return;
    const delta = this.lastFrame ? now - this.lastFrame : 0;
    const quiet = this.elapsed > RAVEN_ENTRY_MS + RAVEN_FLIGHT_MS;
    const frameInterval = this.view.compact || this.constrained || quiet ? 1000 / 30 - 1 : 0;
    if (!this.lastFrame || delta >= frameInterval) {
      this.elapsed += Math.min(delta, 100);
      this.lastFrame = now;
      if (this.progress < 1) this.paintUntil(growthProgress(this.elapsed, false));
      this.present(this.elapsed);
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    if (!this.data || !this.layer || !this.context || !this.layerContext || !this.landscape) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const fit = fitBonsai(this.data.width, this.data.height, box.width, box.height, devicePixelRatio || 1, this.constrained);
    if (this.viewportWidth === box.width && this.viewportHeight === box.height && this.view?.dpr === fit.dpr) return;
    this.viewportWidth = box.width;
    this.viewportHeight = box.height;
    this.view = fit;
    this.cursor = undefined;
    const canvas = this.surface.nativeElement;
    canvas.width = this.layer.width = this.landscape.width = fit.pixelWidth;
    canvas.height = this.layer.height = this.landscape.height = fit.pixelHeight;
    this.scale = fit.scale;
    this.offsetX = fit.offsetX;
    this.offsetY = fit.offsetY;
    this.loadBackdrop(fit.backdrop);
    this.paintBackdrop();
    this.layerContext.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    const budget = this.constrained ? 64 : fit.compact ? 84 : 210;
    this.treeLanes = this.progress < 1 && !this.reduced
      ? buildCouriers(this.data.particles, fit.pixelWidth, fit.pixelHeight, budget, (dot) => ({
        x: this.offsetX + dot.x * this.scale,
        y: this.offsetY + dot.y * this.scale,
        radius: dot.radius * this.scale,
      }))
      : [];
    this.next = 0;
    this.paintUntil(growthProgress(this.elapsed, this.reduced));
    this.present(this.elapsed);
  }

  private paintUntil(progress: number): void {
    if (!this.data || !this.layerContext) return;
    this.progress = progress;
    this.paintBackdropUntil(progress);
    const dots = this.data.particles;
    while (this.next < dots.length && dots[this.next].reveal <= progress) {
      const dot = dots[this.next++];
      if (!this.windDots.has(dot)) this.drawDot(this.layerContext, dot, dot.x, dot.y, dot.opacity);
      if (this.isGroundExtension(dot)) {
        const fall = 13 + ((Math.round(dot.x * 4) * 17 + Math.round(dot.y * 4) * 31) % 23);
        this.drawDot(this.layerContext, dot, dot.x, dot.y + fall, dot.opacity * .34, dot.radius * .72);
      }
    }
    if (progress === 1) {
      this.treeLanes.length = 0;
      this.backdropLanes.length = 0;
    }
  }

  private present(elapsed: number): void {
    if (!this.context || !this.layer || !this.landscape || !this.view) return;
    const context = this.context;
    const { pixelWidth, pixelHeight, compact, shore, backdrop } = this.view;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    const instant = this.reduced;
    const sceneryReady = this.landmarks.get(backdrop) !== 'pending';
    const fadeAge = this.backdropFadeAt === undefined ? 1 : Math.min(1, (elapsed - this.backdropFadeAt) / 650);
    const lateFade = this.paused || instant ? 1 : ease(fadeAge);
    const water = sceneryReady ? lateFade * swarmWeight('water', this.progress) : 0;
    const atmosphere = sceneryReady ? lateFade * swarmWeight('atmosphere', this.progress) : 0;
    const opacity = lateFade * (this.backdropAssembly || instant ? 1 : ease(this.progress));
    if (opacity < 1) {
      context.fillStyle = this.backdropAssembly?.data.background ?? PAPER;
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      context.globalAlpha = opacity;
    }
    context.drawImage(this.landscape, 0, 0);
    context.globalAlpha = 1;
    if (water) this.drawReflection(context, pixelWidth, pixelHeight, shore, water, this.backdropAssembly ? backdrop : undefined);
    if ((water || atmosphere) && !instant) {
      context.setTransform(pixelWidth / this.viewportWidth, 0, 0, pixelHeight / this.viewportHeight, 0, 0);
      paintLandscapeMotion(context, this.viewportWidth, this.viewportHeight, compact, elapsed,
        this.backdropAssembly ? backdrop : undefined, water, atmosphere, this.atmosphereStamps);
      if (atmosphere) this.drawAtmosphere(context, elapsed, compact, atmosphere);
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    context.drawImage(this.layer, 0, 0);
    if (this.progress < 1 && !instant) {
      this.drawSeeds(context, elapsed, pixelWidth, pixelHeight, compact, 1 - ease(Math.min(1, this.progress / .25)));
      this.drawCouriers(context, this.backdropLanes);
      this.drawCouriers(context, this.treeLanes);
    }
    context.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    const phase = elapsed / 2200;
    const landingAge = elapsed - (this.birdLandedAt ?? -Infinity);
    const landingShake = landingAge < 1300 && !instant
      ? Math.sin(landingAge / 55) * Math.exp(-landingAge / 350) * 5
      : 0;
    for (const { dot, grass, phase: offset, tempo, landing } of this.animatedDots) {
      if (dot.reveal > this.progress) break;
      const sway = instant ? 0 : Math.sin(phase * tempo + offset) * (grass ? 1.05 : .9);
      const pointer = !instant && this.cursor && !grass
        ? Math.max(0, 1 - Math.hypot(dot.x - this.cursor.x, dot.y - this.cursor.y) / 170) * 6
        : 0;
      const shake = landingShake * landing;
      const opacity = instant ? dot.opacity : dot.opacity * (.98 + .02 * Math.sin(phase * .8 + offset));
      this.drawDot(context, dot, dot.x + sway * (grass ? .35 : 1) + shake + pointer * Math.sin(phase * 3 + offset), dot.y + shake * .25, opacity);
      if (grass) {
        this.drawDot(context, dot, dot.x + sway * .9, dot.y - 3, opacity * .42, .8);
        this.drawDot(context, dot, dot.x + sway * 1.4, dot.y - 5, opacity * .32, .5);
      }
    }
    this.drawFallingLeaves(elapsed);
    this.drawBird(elapsed);
  }

  private showSeeds(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number): void {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = PAPER;
    context.fillRect(0, 0, width, height);
    this.drawSeeds(context, 0, width, height, width < 640, 1);
  }

  private drawSeeds(context: CanvasRenderingContext2D, elapsed: number, width: number, height: number, compact: boolean, gain: number): void {
    if (!gain) return;
    const count = compact ? 28 : 42;
    const scale = this.view?.dpr ?? 1;
    context.fillStyle = '#848a72';
    for (let index = 1; index <= count; index++) {
      const phase = variation(index * 17011);
      const drift = Math.sin(elapsed / 1100 + phase * 6) * 3 * scale;
      const x = width * ((compact ? .09 : .29) + (compact ? .85 : .67) * variation(index * 11243));
      const y = height * ((compact ? .52 : .23) + (compact ? .43 : .70) * variation(index * 7919));
      context.globalAlpha = gain * (.23 + phase * .22);
      const size = (.7 + phase * .55) * scale;
      context.fillRect(x + drift, y + drift * .4, size, size);
    }
    context.globalAlpha = 1;
  }

  private drawCouriers(context: CanvasRenderingContext2D, lanes: Lane[]): void {
    const progress = this.progress;
    const dpr = this.view?.dpr ?? 1;
    for (const lane of lanes) {
      const { members, duration, swarm } = lane;
      while (lane.next < members.length && members[lane.next].dot.reveal <= progress) lane.next++;
      for (let index = lane.next; index < members.length; index++) {
        const mark = members[index];
        const age = 1 - (mark.dot.reveal - progress) / duration;
        if (age <= 0) break;
        const travel = swarm === 'water' ? age * age * (2 - age) : ease(age);
        const remaining = 1 - travel;
        const curve = 2 * remaining * travel;
        const x = remaining * remaining * mark.fromX + curve * mark.bendX + travel * travel * mark.x;
        const y = remaining * remaining * mark.fromY + curve * mark.bendY + travel * travel * mark.y;
        const fadeIn = ease(Math.min(1, age * 5));
        const radius = Math.min(mark.radius, .7 * dpr) + (mark.radius - Math.min(mark.radius, .7 * dpr)) * travel;
        this.drawDot(context, mark.dot, x, y, mark.dot.opacity * fadeIn * (.55 + .45 * travel), radius);
      }
    }
  }

  private drawReflection(
    context: CanvasRenderingContext2D, width: number, height: number, shore: number, gain: number, backdrop?: Backdrop,
  ): void {
    if (!this.layer) return;
    const art = backdrop ? illustratedWater[backdrop] : undefined;
    const edge = Math.round(height * (art ? waterlineAt(art, art.reflectionX) / art.height : shore));
    const compression = .38;
    const strip = Math.min(edge, Math.ceil((height - edge) / compression));
    context.save();
    if (art) {
      const scaleX = width / art.width;
      const scaleY = height / art.height;
      const first = art.bank[0];
      const last = art.bank[art.bank.length - 1];
      context.beginPath();
      context.moveTo(first[0] * scaleX, first[1] * scaleY);
      for (let i = 1; i < art.bank.length; i++) {
        const [x, y] = art.bank[i];
        context.lineTo(x * scaleX, y * scaleY);
      }
      context.lineTo(last[0] * scaleX, height);
      context.lineTo(first[0] * scaleX, height);
      context.closePath();
      context.clip();
    }
    context.globalAlpha = gain * .116;
    context.translate(0, edge);
    context.scale(1, -compression);
    context.drawImage(this.layer, 0, edge - strip, width, strip, 0, -strip, width, strip);
    context.restore();
  }

  private drawAtmosphere(context: CanvasRenderingContext2D, elapsed: number, compact: boolean, gain: number): void {
    const count = this.constrained ? 10 : compact ? 15 : 24;
    for (let index = 1; index <= count; index++) {
      const phase = variation(index * 45631) * Math.PI * 2;
      const wind = Math.sin(elapsed / 6700 + phase);
      const opacity = (Math.sin(elapsed / (3100 + index * 80) + phase) - .22) * .28;
      if (opacity <= 0) continue;
      const x = this.viewportWidth * (.28 + .69 * variation(index * 9537)) + wind * 9;
      const y = this.viewportHeight * ((compact ? .55 : .24) + (compact ? .35 : .63) * variation(index * 8761)) + wind * 2;
      context.globalAlpha = gain * opacity;
      context.fillStyle = index % 5 === 0 ? '#ac765b' : '#889579';
      context.fillRect(x, y, .9, 1.1);
    }
    context.globalAlpha = 1;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.paused || this.reduced || this.progress < 1) return;
    this.cursor = this.artPoint(event);
  };

  private artPoint(event: MouseEvent): { x: number; y: number } {
    const canvas = this.surface.nativeElement;
    return {
      x: (event.offsetX * canvas.width / this.viewportWidth - this.offsetX) / this.scale,
      y: (event.offsetY * canvas.height / this.viewportHeight - this.offsetY) / this.scale,
    };
  }

  private readonly onCanvasClick = (event: MouseEvent): void => {
    if (this.paused || this.reduced || this.progress < 1 || !this.view || this.elapsed - this.lastTap < 850) return;
    const { x, y } = this.artPoint(event);
    const hitRadius = 25 * this.view.dpr / this.scale;
    let branch: BonsaiParticle | undefined;
    let nearest = hitRadius * hitRadius;
    for (const dot of this.branchSources) {
      if (dot.reveal > this.progress) continue;
      const distance = (dot.x - x) ** 2 + (dot.y - y) ** 2;
      if (distance < nearest) {
        nearest = distance;
        branch = dot;
      }
    }
    if (!branch) return;
    this.lastTap = this.elapsed;
    const nearby = this.fallingSources
      .filter((dot) => (dot.x - branch!.x) ** 2 + (dot.y - branch!.y) ** 2 < 200 ** 2)
      .sort((a, b) => (a.x - branch!.x) ** 2 + (a.y - branch!.y) ** 2 - ((b.x - branch!.x) ** 2 + (b.y - branch!.y) ** 2))
      .slice(0, 5);
    for (const dot of nearby) this.releaseLeaf(dot, this.elapsed, 2800 + Math.random() * 1000, (Math.random() - .5) * 100);
  };

  private releaseLeaf(dot: BonsaiParticle, start: number, duration: number, drift: number, burst = false): void {
    if (this.fallingLeaves.length >= (this.view?.compact ? 24 : 40)) return;
    const leaf = this.leafPool.pop();
    if (leaf) {
      leaf.dot = dot;
      leaf.start = start;
      leaf.duration = duration;
      leaf.drift = drift;
      leaf.burst = burst;
      this.fallingLeaves.push(leaf);
    } else {
      this.fallingLeaves.push({ dot, start, duration, drift, burst });
    }
  }

  private drawFallingLeaves(elapsed: number): void {
    if (!this.context || this.reduced || this.progress < 1 || !this.fallingSources.length) return;
    let active = 0;
    for (const leaf of this.fallingLeaves) {
      if (elapsed >= leaf.start + leaf.duration) this.leafPool.push(leaf);
      else this.fallingLeaves[active++] = leaf;
    }
    this.fallingLeaves.length = active;
    if (elapsed >= this.nextFallAt) {
      const first = this.fallingSources[Math.floor(Math.random() * this.fallingSources.length)];
      const sources = [first];
      if (Math.random() < .32) {
        const distant = this.fallingSources.filter((dot) => Math.abs(dot.y - first.y) > 180 && (dot.x - first.x) ** 2 + (dot.y - first.y) ** 2 > 320 ** 2);
        if (distant.length) sources.push(distant[Math.floor(Math.random() * distant.length)]);
      }
      let longest = 0;
      for (const dot of sources) {
        const duration = 9000 + Math.random() * 3500;
        this.releaseLeaf(dot, elapsed, duration, (Math.random() - .5) * 100);
        longest = Math.max(longest, duration);
      }
      this.nextFallAt = elapsed + longest + 6000 + Math.random() * 7000;
    }
    for (const leaf of this.fallingLeaves) {
      const t = (elapsed - leaf.start) / leaf.duration;
      if (t < 0) continue;
      const dot = leaf.dot;
      const x = dot.x + leaf.drift * t + Math.sin(t * 7 + dot.x * .01) * t * 9;
      const y = dot.y + (1300 - dot.y) * (t * .62 + t * t * .38);
      const opacity = (leaf.burst ? .9 : dot.opacity * .8) * Math.min(1, t * 10, (1 - t) * 12);
      this.drawDot(this.context, dot, x, y, opacity, leaf.burst ? Math.max(dot.radius, 4) * .6 : Math.max(dot.radius, 2));
    }
  }

  private scatterLandingLeaves(elapsed: number): void {
    const nearby = this.fallingSources.filter((dot) => (dot.x - 875) ** 2 + (dot.y - 590) ** 2 < 230 ** 2);
    const count = Math.min(this.view?.compact ? 8 : 16, nearby.length);
    for (let i = 0; i < count; i++) {
      const [dot] = nearby.splice(Math.floor(Math.random() * nearby.length), 1);
      this.releaseLeaf(dot, elapsed + Math.random() * 350, 3600 + Math.random() * 1200, (Math.random() - .5) * 150, true);
    }
  }

  private drawBird(elapsed: number): void {
    if (!this.context || (!this.reduced && elapsed < RAVEN_ENTRY_MS)) return;
    const flight = this.reduced ? 1 : Math.min(1, (elapsed - RAVEN_ENTRY_MS) / RAVEN_FLIGHT_MS);
    const eased = flight * flight * (3 - 2 * flight);
    const arc = Math.sin(Math.PI * flight);
    const entryX = -this.offsetX / this.scale - 110;
    const x = entryX + (875 - entryX) * eased;
    const birdScale = 1.05;
    const perchY = 670 - 20 * birdScale;
    const y = 540 + (perchY - 540) * eased - 190 * arc * arc + Math.sin(elapsed / 160) * 3 * arc * arc;
    const flying = flight < 1;
    const context = this.context;
    const wingFade = Math.min(1, (1 - flight) / .15);
    const wingStroke = .2 + .85 * Math.sin(elapsed / 85);
    if (!flying && !this.reduced && this.birdLandedAt === undefined) {
      this.birdLandedAt = elapsed;
      this.scatterLandingLeaves(elapsed);
    }
    const landingAge = elapsed - (this.birdLandedAt ?? -Infinity);
    const bounce = !this.reduced && landingAge < 900 ? Math.sin(landingAge / 100) * Math.exp(-landingAge / 300) * 5 : 0;

    context.save();
    context.translate(x, y + bounce);
    context.scale(birdScale, birdScale);
    context.rotate(-.12 * Math.sin(Math.PI * 2 * flight));
    context.globalAlpha = .96;
    if (flying) {
      context.save();
      context.translate(2, -2);
      context.scale(.8, wingStroke * .8);
      context.globalAlpha = .65 * wingFade;
      this.drawBirdDots(context, birdFlightWing, '#4d5658');
      context.restore();
    }
    this.drawBirdDots(context, birdTail, '#303839');
    this.drawBirdDots(context, birdBody, '#303638');
    this.drawBirdDots(context, birdFoldedWing, '#41494b');
    if (flying) {
      context.save();
      context.translate(-4, -3);
      context.scale(1, wingStroke);
      context.globalAlpha = .96 * wingFade;
      this.drawBirdDots(context, birdFlightWing, '#222b2d');
      context.restore();
    }
    const look = !flying && !this.reduced ? (landingAge % 9200 - 5600) / 760 : 0;
    context.save();
    context.translate(18, -6);
    if (look > 0 && look < 1) context.rotate(-.15 * Math.sin(look * Math.PI));
    context.translate(-18, 6);
    this.drawBirdDots(context, birdHead, '#252c2e');
    this.drawBirdDots(context, birdBeak, '#292f30');
    this.drawBirdDots(context, birdEye, '#d2d0bd');
    context.restore();
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, (flight - .82) / .18));
    this.drawBirdDots(context, birdFeet, '#252c2e');
    context.restore();
    context.restore();
  }

  private drawBirdDots(context: CanvasRenderingContext2D, dots: BirdDot[], color: string): void {
    context.fillStyle = color;
    context.beginPath();
    for (const dot of dots) {
      context.moveTo(dot.x + dot.radius, dot.y);
      context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    }
    context.fill();
  }

  private isAnimatedLeaf(dot: BonsaiParticle): boolean {
    return dot.material === 3 && (Math.round(dot.x * 4) * 73 + Math.round(dot.y * 4) * 17) % 19 === 0;
  }

  private isAnimatedGrass(dot: BonsaiParticle): boolean {
    return dot.lowVegetation && dot.y > 1220 && (Math.round(dot.x * 4) * 31 + Math.round(dot.y * 4) * 19) % 7 === 0;
  }

  private isGroundExtension(dot: BonsaiParticle): boolean {
    return dot.material === 4 && dot.y > 1290 && (Math.round(dot.x * 4) * 23 + Math.round(dot.y * 4) * 11) % 29 === 0;
  }

  private drawDot(context: CanvasRenderingContext2D, dot: BonsaiParticle, x: number, y: number, opacity: number, radius = dot.radius): void {
    context.fillStyle = dot.color;
    context.globalAlpha = opacity;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}
