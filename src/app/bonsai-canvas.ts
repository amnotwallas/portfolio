import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, output } from '@angular/core';
import { decodeBonsai, fitBonsai, growthProgress, type BonsaiData, type BonsaiParticle } from './bonsai-data';

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
  private fallingLeaves: { dot: BonsaiParticle; start: number; duration: number; drift: number }[] = [];
  private nextFallAt = 6700 + Math.random() * 1000;
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
    for (let i = 0; i < this.animatedDots.length; i++) {
      const dot = this.animatedDots[i];
      if (dot.reveal > this.progress) break;
      const group = Math.floor(dot.x / 100) + Math.floor(dot.y / 100) * 11;
      const grass = this.isAnimatedGrass(dot);
      const sway = this.motion.matches ? 0 : Math.sin(phase * (.88 + group % 5 * .06) + group * .7) * (grass ? 1.05 : .9);
      const opacity = this.motion.matches ? dot.opacity : dot.opacity * (.95 + .05 * Math.sin(phase * .8 + group));
      this.drawDot(this.context, dot, dot.x + sway * (grass ? .35 : 1), dot.y, opacity);
      if (grass) {
        this.drawDot(this.context, dot, dot.x + sway * .9, dot.y - 3, opacity * .42, .8);
        this.drawDot(this.context, dot, dot.x + sway * 1.4, dot.y - 5, opacity * .32, .5);
      }
    }
    this.drawFallingLeaves(elapsed);
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
      if (t >= 1) continue;
      const dot = leaf.dot;
      const x = dot.x + leaf.drift * t + Math.sin(t * 7 + dot.x * .01) * t * 9;
      const y = dot.y + (1300 - dot.y) * (t * .62 + t * t * .38);
      const opacity = dot.opacity * .8 * Math.min(1, t * 10, (1 - t) * 12);
      this.drawDot(this.context, dot, x, y, opacity, Math.max(dot.radius, 2));
    }
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
