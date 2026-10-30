import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, output } from '@angular/core';
import { decodeBonsai, fitBonsai, growthProgress, type BonsaiData, type BonsaiParticle } from './bonsai-data';

type BirdDot = { x: number; y: number; radius: number };

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
  styles: `:host { display: block; aspect-ratio: 1122 / 1402; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; } canvas, img { display: block; width: 100%; height: 100%; } canvas { cursor: pointer; pointer-events: auto; } canvas[hidden], img[hidden] { display: none; }`,
})
export class BonsaiCanvas implements AfterViewInit, OnDestroy {
  @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fallback', { static: true }) private fallback!: ElementRef<HTMLImageElement>;
  readonly growthStarted = output<void>();
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly abort = new AbortController();
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private resizeObserver?: ResizeObserver;
  private data?: BonsaiData;
  private animatedDots: BonsaiParticle[] = [];
  private fallingSources: BonsaiParticle[] = [];
  private branchSources: BonsaiParticle[] = [];
  private fallingLeaves: { dot: BonsaiParticle; start: number; duration: number; drift: number; burst?: boolean }[] = [];
  private nextFallAt = 6700 + Math.random() * 1000;
  private birdLandedAt?: number;
  private context?: CanvasRenderingContext2D;
  private layer?: HTMLCanvasElement;
  private layerContext?: CanvasRenderingContext2D;
  private frame = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private next = 0;
  private progress = 0;
  private hasAnnouncedGrowth = false;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.start());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motion.removeEventListener('change', this.onMotion);
  }

  private async start(): Promise<void> {
    const canvas = this.surface.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return this.showFallback();
    this.context = context;
    try {
      const compressed = typeof DecompressionStream !== 'undefined';
      const response = await fetch(new URL(compressed ? 'bonsai-particles.pack' : 'bonsai-particles.bin', document.baseURI), { signal: this.abort.signal });
      if (!response.ok) throw new Error('Particle dataset unavailable');
      const buffer = compressed
        ? await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : await response.arrayBuffer();
      const data = decodeBonsai(buffer);
      if (this.destroyed) return;
      this.data = data;
      this.animatedDots = data.particles.filter((dot) => this.isAnimatedLeaf(dot) || this.isAnimatedGrass(dot));
      this.fallingSources = this.animatedDots.filter((dot) => dot.material === 3 && dot.y < 850 && dot.x > 90 && dot.x < data.width - 90);
      this.branchSources = data.particles.filter((dot) => dot.material === 1 || dot.material === 2);
      canvas.addEventListener('click', this.onCanvasClick, { signal: this.abort.signal });
      this.layer = document.createElement('canvas');
      this.layerContext = this.layer.getContext('2d') ?? undefined;
      if (!this.layerContext) return this.showFallback();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.motion.addEventListener('change', this.onMotion);
      this.resize();
      this.frame = requestAnimationFrame(this.tick);
    } catch {
      if (!this.destroyed) this.showFallback();
    }
  }

  private showFallback(): void {
    this.surface.nativeElement.hidden = true;
    this.fallback.nativeElement.src = 'bonsai.jpg';
    this.fallback.nativeElement.hidden = false;
    this.announceGrowthStarted();
  }

  private readonly onVisibility = (): void => {
    cancelAnimationFrame(this.frame);
    this.lastFrame = 0;
    if (!document.hidden) this.frame = requestAnimationFrame(this.tick);
  };

  private readonly onMotion = (): void => {
    if (this.motion.matches) {
      this.paintUntil(1);
      this.present(0);
      cancelAnimationFrame(this.frame);
    } else {
      this.lastFrame = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed || document.hidden || !this.data) return;
    if (this.lastFrame) this.elapsed += Math.min(now - this.lastFrame, 80);
    this.lastFrame = now;
    const progress = growthProgress(this.elapsed, this.motion.matches);
    this.paintUntil(progress);
    this.present(this.elapsed);
    if (!this.motion.matches) this.frame = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    if (!this.data || !this.layer || !this.context || !this.layerContext) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const fit = fitBonsai(this.data.width, this.data.height, box.width, box.height, Math.min(devicePixelRatio || 1, 2));
    const canvas = this.surface.nativeElement;
    if (canvas.width === fit.pixelWidth && canvas.height === fit.pixelHeight) return;
    canvas.width = this.layer.width = fit.pixelWidth;
    canvas.height = this.layer.height = fit.pixelHeight;
    this.scale = fit.scale;
    this.offsetX = fit.offsetX;
    this.offsetY = fit.offsetY;
    this.layerContext.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    this.next = 0;
    this.paintUntil(growthProgress(this.elapsed, this.motion.matches));
    this.present(this.elapsed);
  }

  private paintUntil(progress: number): void {
    if (!this.data || !this.layerContext) return;
    this.progress = progress;
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
    if (!this.context || !this.layer || !this.data) return;
    const canvas = this.surface.nativeElement;
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.globalAlpha = 1;
    this.context.clearRect(0, 0, canvas.width, canvas.height);
    this.context.drawImage(this.layer, 0, 0);
    this.context.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
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
      const nearbyShake = dot.material === 3 ? landingShake * Math.max(0, 1 - Math.hypot(dot.x - 875, dot.y - 590) / 260) : 0;
      const opacity = this.motion.matches ? dot.opacity : dot.opacity * (.95 + .05 * Math.sin(phase * .8 + group));
      this.drawDot(this.context, dot, dot.x + sway * (grass ? .35 : 1) + nearbyShake, dot.y + nearbyShake * .25, opacity);
      if (grass) {
        this.drawDot(this.context, dot, dot.x + sway * .9, dot.y - 3, opacity * .42, .8);
        this.drawDot(this.context, dot, dot.x + sway * 1.4, dot.y - 5, opacity * .32, .5);
      }
    }
    this.drawFallingLeaves(elapsed);
    this.drawBird(elapsed);
    if (this.next > 0) this.announceGrowthStarted();
  }

  private announceGrowthStarted(): void {
    if (this.hasAnnouncedGrowth) return;
    this.hasAnnouncedGrowth = true;
    this.growthStarted.emit();
  }

  private readonly onCanvasClick = (event: MouseEvent): void => {
    if (this.motion.matches || this.progress < 1 || !this.data || !this.branchSources.length) return;
    const canvas = this.surface.nativeElement;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) * canvas.width / bounds.width - this.offsetX) / this.scale;
    const y = ((event.clientY - bounds.top) * canvas.height / bounds.height - this.offsetY) / this.scale;
    const hitRadius = 28 * canvas.width / bounds.width / this.scale;
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
      this.fallingLeaves = sources.map((dot) => ({ dot, start: elapsed, duration: 9000 + Math.random() * 3500, drift: (Math.random() - .5) * 100 }));
      this.nextFallAt = elapsed + Math.max(...this.fallingLeaves.map((leaf) => leaf.duration)) + 6000 + Math.random() * 7000;
    }
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
    for (let i = 0; i < Math.min(24, nearby.length); i++) {
      const [dot] = nearby.splice(Math.floor(Math.random() * nearby.length), 1);
      this.fallingLeaves.push({ dot, start: elapsed + Math.random() * 350, duration: 3600 + Math.random() * 1200, drift: (Math.random() - .5) * 150, burst: true });
    }
  }

  private drawBird(elapsed: number): void {
    if (!this.context || (!this.motion.matches && elapsed < 6800)) return;
    const flight = this.motion.matches ? 1 : Math.min(1, (elapsed - 6800) / 4000);
    const eased = flight * flight * (3 - 2 * flight);
    const arc = Math.sin(Math.PI * flight);
    const x = -100 + (875 + 100) * eased;
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
    this.drawBirdDots(context, birdHead, '#252c2e');
    this.drawBirdDots(context, birdFoldedWing, '#41494b');
    if (flying) {
      context.save();
      context.translate(-4, -3);
      context.scale(1, wingStroke);
      context.globalAlpha = .96 * wingFade;
      this.drawBirdDots(context, birdFlightWing, '#222b2d');
      context.restore();
    }
    this.drawBirdDots(context, birdBeak, '#292f30');
    this.drawBirdDots(context, [{ x: 21, y: -12, radius: 1.6 }], '#d2d0bd');
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
