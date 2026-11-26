import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';

type Courier = { x: number; y: number; tx: number; ty: number; bend: number; size: number; color: string; phase: number };
const duration = [1150, 1050, 980, 900, 900, 850, 800];
const delay = (group: number) => group * 670;
const end = delay(6) + duration[6] * 1.3;
const ease = (t: number) => t * t * (3 - 2 * t);

@Component({
  selector: 'app-interface-swarm',
  standalone: true,
  template: '<canvas #surface aria-hidden="true"></canvas>',
  styles: `:host{position:absolute;inset:0;display:block;pointer-events:none}canvas{width:100%;height:100%;display:block}`,
})
export class InterfaceSwarm implements AfterViewInit, OnChanges, OnDestroy {
  @Input() paused = false;
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly listeners = new AbortController();
  @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private groups: Courier[][] = [];
  private width = 0;
  private height = 0;
  private scale = 0;
  private elapsed = 0;
  private lastFrame = 0;
  private frame = 0;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.canvas = this.surface.nativeElement;
      if (this.motion.matches) return this.finish();
      this.context = this.canvas.getContext('2d') ?? undefined;
      if (!this.context) return this.finish();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);
      document.addEventListener('visibilitychange', this.updateAnimation, { signal: this.listeners.signal });
      this.motion.addEventListener('change', this.updateAnimation, { signal: this.listeners.signal });
      this.updateAnimation();
    });
  }

  ngOnChanges(): void {
    this.zone.runOutsideAngular(this.updateAnimation);
  }

  ngOnDestroy(): void {
    this.finish();
  }

  private finish(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.listeners.abort();
    this.groups.length = 0;
    this.context = undefined;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
  }

  private readonly updateAnimation = (): void => {
    cancelAnimationFrame(this.frame);
    this.lastFrame = 0;
    if (!this.context) return;
    if (this.motion.matches) this.finish();
    else if (!this.paused && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 1.35, Math.sqrt(1_500_000 / (width * height)));
    if (width === this.width && height === this.height && scale === this.scale) return;
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.context?.setTransform(scale, 0, 0, scale, 0, 0);
    this.sampleTargets();
  }

  private sampleTargets(): void {
    const targets = this.host.nativeElement.parentElement?.querySelectorAll<HTMLElement>('[data-assemble]');
    if (!targets) return;
    this.groups = duration.map(() => []);
    const width = this.width;
    const height = this.height;
    const range = document.createRange();
    for (const target of targets) {
      const group = Number(target.dataset['assemble']);
      const couriers = this.groups[group];
      const lines: DOMRect[] = [];
      const edges: number[] = [];
      let totalWidth = 0;
      let characters = 0;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          lines.push(rect);
          edges.push(totalWidth += rect.width);
        }
        characters += node.textContent?.trim().length ?? 0;
      }
      const icons = [...target.querySelectorAll<SVGElement>('svg')].map((icon) => icon.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
      if (!lines.length) {
        const box = target.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        lines.push(box);
        edges.push(totalWidth = box.width);
      }
      const budget = Math.min(group === 1 ? 210 : group === 2 || group === 3 ? 150 : 115, Math.max(38, characters * 2));
      const color = getComputedStyle(target).color;
      for (let index = 0; index < budget; index++) {
        const position = Math.random() * totalWidth;
        const rect = lines[edges.findIndex((edge) => position < edge)];
        const source = Math.random() < .25 && icons.length ? icons[Math.floor(Math.random() * icons.length)] : rect;
        const tx = source.left + Math.random() * source.width;
        const ty = source.top + Math.random() * source.height;
        couriers.push({
          x: Math.random() * width, y: Math.random() * height,
          tx, ty, bend: (Math.random() - .5) * Math.min(width, height) * .4,
          size: .65 + Math.random() * 1.25, color,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.context || this.paused || document.hidden) return;
    if (!this.groups.length) this.resize();
    if (this.lastFrame && now - this.lastFrame < 1000 / 30 - 1) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    if (this.lastFrame) this.elapsed += Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    const elapsed = this.elapsed;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    for (let group = 0; group < this.groups.length; group++) {
      const age = (elapsed - delay(group)) / duration[group];
      if (age < 0 || age > 1.28) continue;
      const progress = ease(Math.min(1, age));
      const rest = 1 - progress;
      const arc = Math.sin(progress * Math.PI);
      const alpha = age < 1 ? .35 + .65 * Math.min(1, age * 4) : Math.max(0, 1 - (age - 1) / .28);
      for (const dot of this.groups[group]) {
        const x = dot.x * rest + dot.tx * progress + dot.bend * arc;
        const y = dot.y * rest + dot.ty * progress - Math.abs(dot.bend) * .3 * arc + Math.sin(age * 19 + dot.phase) * rest * 3;
        context.globalAlpha = alpha;
        context.fillStyle = dot.color;
        context.beginPath();
        context.arc(x, y, dot.size * (age < 1 ? .7 + progress * .3 : 1), 0, Math.PI * 2);
        context.fill();
        if (age < 1) {
          context.globalAlpha = alpha * .22 * rest;
          context.beginPath();
          context.arc(x - (dot.tx - dot.x) * .025, y - (dot.ty - dot.y) * .025, dot.size * 2.4, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.globalAlpha = 1;
    if (elapsed < end) this.frame = requestAnimationFrame(this.tick);
    else this.finish();
  };
}
