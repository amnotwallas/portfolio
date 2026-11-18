import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { ASSEMBLY_MS, decodeBonsai, fitBonsai, growthProgress, landscapeVariant, treeArrival, type BonsaiData, type BonsaiParticle } from './bonsai-data';
import { paintLandscape, paintLandscapeMotion } from './landscape';

type BirdDot = { x: number; y: number; radius: number };
type DriftingDot = { dot: BonsaiParticle; x: number; y: number; targetX: number; targetY: number; radius: number };
type Backdrop = ReturnType<typeof landscapeVariant>;
type BackdropAssembly = { data: BonsaiData; next: number; scaleX: number; scaleY: number; radiusScale: number };

const RAVEN_ENTRY_MS = 6800;
const RAVEN_FLIGHT_MS = 4000;
const PAPER = '#f5efe5';

function seed(index: number): number {
  const mixed = Math.imul(index ^ (index >>> 16), 0x45d9f3b);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

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
  private readonly constrained = (window.navigator?.hardwareConcurrency || 8) <= 4;
  private resizeObserver?: ResizeObserver;
  private data?: BonsaiData;
  private animatedDots: BonsaiParticle[] = [];
  private fallingSources: BonsaiParticle[] = [];
  private branchSources: BonsaiParticle[] = [];
  private fallingLeaves: { dot: BonsaiParticle; start: number; duration: number; drift: number; burst?: boolean }[] = [];
  private nextFallAt = 6700 + Math.random() * 1000;
  private birdLandedAt?: number;
  private context?: CanvasRenderingContext2D;
  private landscape?: HTMLCanvasElement;
  private landscapeContext?: CanvasRenderingContext2D;
  private readonly landmarks = new Map<Backdrop, BonsaiData | undefined>();
  private backdropAssembly?: BackdropAssembly;
  private backdropDrifters: DriftingDot[] = [];
  private layer?: HTMLCanvasElement;
  private layerContext?: CanvasRenderingContext2D;
  private view?: ReturnType<typeof fitBonsai>;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private drifters: DriftingDot[] = [];
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
    this.motion.removeEventListener('change', this.updateAnimation);
  }

  private async start(): Promise<void> {
    const canvas = this.surface.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return this.showFallback();
    this.context = context;
    try {
      const compressed = typeof DecompressionStream !== 'undefined';
      const box = this.host.nativeElement.getBoundingClientRect();
      if (box.width && box.height) this.loadBackdrop(landscapeVariant(box.width, box.height));
      const data = await this.readParticles(compressed ? 'bonsai-particles.pack' : 'bonsai-particles.bin');
      if (this.destroyed) return;
      for (const dot of data.particles) dot.reveal = treeArrival(dot.reveal);
      this.data = data;
      this.animatedDots = data.particles.filter((dot) => this.isAnimatedLeaf(dot) || this.isAnimatedGrass(dot));
      this.fallingSources = this.animatedDots.filter((dot) => dot.material === 3 && dot.y < 850 && dot.x > 90 && dot.x < data.width - 90);
      this.branchSources = data.particles.filter((dot) => dot.material === 1 || dot.material === 2);
      canvas.addEventListener('click', this.onCanvasClick, { signal: this.abort.signal });
      canvas.addEventListener('pointermove', this.onPointerMove, { signal: this.abort.signal, passive: true });
      canvas.addEventListener('pointerleave', () => { this.cursor = undefined; }, { signal: this.abort.signal });
      this.landscape = document.createElement('canvas');
      this.landscapeContext = this.landscape.getContext('2d', { alpha: false }) ?? undefined;
      this.layer = document.createElement('canvas');
      this.layerContext = this.layer.getContext('2d') ?? undefined;
      if (!this.layerContext || !this.landscapeContext) return this.showFallback();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', this.updateAnimation);
      this.motion.addEventListener('change', this.updateAnimation);
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
    this.landmarks.set(backdrop, undefined);
    void this.readParticles(`landscape-${backdrop}.pack`).then((data) => {
      if (this.destroyed || !data.particles.length) return;
      this.landmarks.set(backdrop, data);
      if (this.view?.backdrop !== backdrop) return;
      this.paintBackdrop();
      if (this.paused || this.motion.matches) this.present(this.elapsed);
    }).catch(() => {
      // A missing or invalid landscape pack leaves the procedural backdrop in use.
    });
  }

  private paintBackdrop(): void {
    if (!this.landscapeContext || !this.view) return;
    const context = this.landscapeContext;
    const { pixelWidth, pixelHeight, compact, backdrop } = this.view;
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    this.backdropAssembly = undefined;
    this.backdropDrifters = [];
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.globalAlpha = 1;
    const data = this.landmarks.get(backdrop);
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
    if (this.progress < 1 && !this.motion.matches) {
      const step = this.constrained ? 92 : compact ? 70 : 45;
      for (let index = 0; index < data.particles.length; index += step) {
        const dot = data.particles[index];
        this.backdropDrifters.push(this.makeDrifter(dot, index + 32817, dot.x * scaleX * pixelWidth / width,
          dot.y * scaleY * pixelHeight / height, dot.radius * radiusScale * this.view.dpr));
      }
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

  private readonly updateAnimation = (): void => {
    cancelAnimationFrame(this.frame);
    this.lastFrame = 0;
    if (this.destroyed || !this.view || document.hidden) return;
    if (this.motion.matches) {
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
    if (this.destroyed || document.hidden || this.paused || this.motion.matches || !this.view) return;
    const delta = this.lastFrame ? now - this.lastFrame : 0;
    const quiet = this.elapsed > RAVEN_ENTRY_MS + RAVEN_FLIGHT_MS;
    const frameInterval = this.view.compact || this.constrained || quiet ? 1000 / 30 - 1 : 0;
    if (!this.lastFrame || delta >= frameInterval) {
      this.elapsed += Math.min(delta, 100);
      this.lastFrame = now;
      this.paintUntil(growthProgress(this.elapsed, false));
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
    this.drifters = [];
    const dots = this.data.particles;
    const step = this.constrained ? 42 : fit.compact ? 32 : 20;
    for (let index = 0; index < dots.length; index += step) {
      const dot = dots[index];
      this.drifters.push(this.makeDrifter(dot, index, this.offsetX + dot.x * this.scale,
        this.offsetY + dot.y * this.scale, dot.radius * this.scale));
    }
    this.next = 0;
    this.paintUntil(growthProgress(this.elapsed, this.motion.matches));
    this.present(this.elapsed);
  }

  private paintUntil(progress: number): void {
    if (!this.data || !this.layerContext) return;
    this.progress = progress;
    this.paintBackdropUntil(progress);
    const dots = this.data.particles;
    while (this.next < dots.length && dots[this.next].reveal <= progress) {
      const dot = dots[this.next++];
      if (!this.isAnimatedLeaf(dot) && !this.isAnimatedGrass(dot)) this.drawDot(this.layerContext, dot, dot.x, dot.y, dot.opacity);
      if (this.isGroundExtension(dot)) {
        const fall = 13 + ((Math.round(dot.x * 4) * 17 + Math.round(dot.y * 4) * 31) % 23);
        this.drawDot(this.layerContext, dot, dot.x, dot.y + fall, dot.opacity * .34, dot.radius * .72);
      }
    }
  }

  private present(elapsed: number): void {
    if (!this.context || !this.layer || !this.landscape || !this.view) return;
    const context = this.context;
    const { pixelWidth, pixelHeight, compact, shore, backdrop } = this.view;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    if (this.progress < 1 && !this.backdropAssembly) {
      context.fillStyle = PAPER;
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      context.globalAlpha = .16 + .84 * this.progress;
    }
    context.drawImage(this.landscape, 0, 0);
    context.globalAlpha = 1;
    if (this.progress > .8) this.drawReflection(context, pixelWidth, pixelHeight, shore);
    if (this.progress === 1 && !this.motion.matches) {
      context.setTransform(pixelWidth / this.viewportWidth, 0, 0, pixelHeight / this.viewportHeight, 0, 0);
      paintLandscapeMotion(context, this.viewportWidth, this.viewportHeight, compact, elapsed - ASSEMBLY_MS,
        this.landmarks.get(backdrop) ? backdrop : undefined);
      this.drawAtmosphere(context, elapsed, compact);
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    context.drawImage(this.layer, 0, 0);
    if (this.progress < 1) {
      this.drawCloud(context, elapsed, this.backdropDrifters);
      this.drawCloud(context, elapsed, this.drifters);
    }
    context.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    const phase = elapsed / 2200;
    const landingAge = elapsed - (this.birdLandedAt ?? -Infinity);
    const landingShake = landingAge < 1300 && !this.motion.matches
      ? Math.sin(landingAge / 55) * Math.exp(-landingAge / 350) * 5
      : 0;
    for (let i = 0; i < this.animatedDots.length; i++) {
      const dot = this.animatedDots[i];
      if (dot.reveal > this.progress) break;
      const group = Math.floor(dot.x / 100) + Math.floor(dot.y / 100) * 11;
      const grass = this.isAnimatedGrass(dot);
      const sway = this.motion.matches ? 0 : Math.sin(phase * (.88 + group % 5 * .06) + group * .7) * (grass ? 1.05 : .9);
      const pointer = !this.motion.matches && this.cursor && !grass
        ? Math.max(0, 1 - Math.hypot(dot.x - this.cursor.x, dot.y - this.cursor.y) / 170) * 6
        : 0;
      const nearbyShake = dot.material === 3 ? landingShake * Math.max(0, 1 - Math.hypot(dot.x - 875, dot.y - 590) / 260) : 0;
      const opacity = this.motion.matches ? dot.opacity : dot.opacity * (.95 + .05 * Math.sin(phase * .8 + group));
      this.drawDot(context, dot, dot.x + sway * (grass ? .35 : 1) + nearbyShake + pointer * Math.sin(phase * 3 + group), dot.y + nearbyShake * .25, opacity);
      if (grass) {
        this.drawDot(this.context, dot, dot.x + sway * .9, dot.y - 3, opacity * .42, .8);
        this.drawDot(this.context, dot, dot.x + sway * 1.4, dot.y - 5, opacity * .32, .5);
      }
    }
    this.drawFallingLeaves(elapsed);
    this.drawBird(elapsed);
  }

  private makeDrifter(dot: BonsaiParticle, index: number, targetX: number, targetY: number, radius: number): DriftingDot {
    const { compact, pixelWidth, pixelHeight } = this.view!;
    const id = Math.imul(index + 1, 374761393);
    const spread = seed(id);
    const x = compact ? .12 + .86 * spread : .24 + .74 * spread;
    const y = compact ? .32 + .61 * seed(id + 91) : .10 + .80 * seed(id + 91);
    return { dot, x: x * pixelWidth, y: y * pixelHeight, targetX, targetY, radius };
  }

  private drawCloud(context: CanvasRenderingContext2D, elapsed: number, drifters: DriftingDot[]): void {
    const dpr = this.view?.dpr ?? 1;
    for (const { dot, x, y, targetX, targetY, radius } of drifters) {
      if (dot.reveal <= this.progress) continue;
      const fraction = this.progress / dot.reveal;
      const travel = fraction * fraction * (3 - 2 * fraction);
      const drift = Math.sin(elapsed / 980 + y * .041 / dpr) * (1 - travel) * 3 * dpr;
      const initialRadius = Math.max(.65 * dpr, Math.min(.99 * dpr, radius * .74));
      const opacity = dot.opacity * (.42 + .58 * travel ** 2);
      this.drawDot(context, dot,
        x + (targetX - x) * travel + drift,
        y + (targetY - y) * travel + drift * .4,
        opacity, initialRadius + (radius - initialRadius) * travel,
      );
    }
  }

  private drawReflection(context: CanvasRenderingContext2D, width: number, height: number, shore: number): void {
    if (!this.layer) return;
    const edge = Math.round(height * shore);
    const compression = .38;
    const strip = Math.min(edge, Math.ceil((height - edge) / compression));
    context.save();
    context.globalAlpha = (this.progress - .8) * .58;
    context.translate(0, edge);
    context.scale(1, -compression);
    context.drawImage(this.layer, 0, edge - strip, width, strip, 0, -strip, width, strip);
    context.restore();
  }

  private drawAtmosphere(context: CanvasRenderingContext2D, elapsed: number, compact: boolean): void {
    const count = this.constrained ? 10 : compact ? 15 : 24;
    for (let index = 1; index <= count; index++) {
      const phase = seed(index * 45631) * Math.PI * 2;
      const wind = Math.sin(elapsed / 6700 + phase);
      const opacity = (Math.sin(elapsed / (3100 + index * 80) + phase) - .22) * .28;
      if (opacity <= 0) continue;
      const x = this.viewportWidth * (.28 + .69 * seed(index * 9537)) + wind * 9;
      const y = this.viewportHeight * ((compact ? .55 : .24) + (compact ? .35 : .63) * seed(index * 8761)) + wind * 2;
      context.globalAlpha = opacity;
      context.fillStyle = index % 5 === 0 ? '#ac765b' : '#889579';
      context.fillRect(x, y, .9, 1.1);
    }
    context.globalAlpha = 1;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.paused || this.motion.matches || this.progress < 1) return;
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
    if (this.paused || this.motion.matches || this.progress < 1 || !this.view || this.elapsed - this.lastTap < 850) return;
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
    this.fallingLeaves.push(...nearby.map((dot) => ({ dot, start: this.elapsed, duration: 2800 + Math.random() * 1000, drift: (Math.random() - .5) * 100 })));
  };

  private drawFallingLeaves(elapsed: number): void {
    if (!this.context || this.motion.matches || this.progress < 1 || !this.fallingSources.length) return;
    if (elapsed >= this.nextFallAt) {
      const first = this.fallingSources[Math.floor(Math.random() * this.fallingSources.length)];
      const sources = [first];
      const distant = this.fallingSources.filter((dot) => Math.abs(dot.y - first.y) > 180 && (dot.x - first.x) ** 2 + (dot.y - first.y) ** 2 > 320 ** 2);
      if (distant.length && Math.random() < .32) sources.push(distant[Math.floor(Math.random() * distant.length)]);
      const fresh = sources.map((dot) => ({ dot, start: elapsed, duration: 9000 + Math.random() * 3500, drift: (Math.random() - .5) * 100 }));
      this.fallingLeaves.push(...fresh);
      this.nextFallAt = elapsed + Math.max(...fresh.map((leaf) => leaf.duration)) + 6000 + Math.random() * 7000;
    }
    this.fallingLeaves = this.fallingLeaves.filter((leaf) => elapsed < leaf.start + leaf.duration);
    for (const leaf of this.fallingLeaves) {
      const t = (elapsed - leaf.start) / leaf.duration;
      if (t < 0 || t >= 1) continue;
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
      this.fallingLeaves.push({ dot, start: elapsed + Math.random() * 350, duration: 3600 + Math.random() * 1200, drift: (Math.random() - .5) * 150, burst: true });
    }
  }

  private drawBird(elapsed: number): void {
    if (!this.context || (!this.motion.matches && elapsed < RAVEN_ENTRY_MS)) return;
    const flight = this.motion.matches ? 1 : Math.min(1, (elapsed - RAVEN_ENTRY_MS) / RAVEN_FLIGHT_MS);
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
    if (!flying && !this.motion.matches && this.birdLandedAt === undefined) {
      this.birdLandedAt = elapsed;
      this.scatterLandingLeaves(elapsed);
    }
    const landingAge = elapsed - (this.birdLandedAt ?? -Infinity);
    const bounce = landingAge < 900 ? Math.sin(landingAge / 100) * Math.exp(-landingAge / 300) * 5 : 0;

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
    const look = !flying && !this.motion.matches ? (landingAge % 9200 - 5600) / 760 : 0;
    context.save();
    context.translate(18, -6);
    if (look > 0 && look < 1) context.rotate(-.15 * Math.sin(look * Math.PI));
    context.translate(-18, 6);
    this.drawBirdDots(context, birdHead, '#252c2e');
    this.drawBirdDots(context, birdBeak, '#292f30');
    this.drawBirdDots(context, [{ x: 21, y: -12, radius: 1.6 }], '#d2d0bd');
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
