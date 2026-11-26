import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';

type Courier = { x: number; y: number; tx: number; ty: number; bend: number; size: number; color: string; group: number; phase: number };
const duration = [1150, 1050, 980, 900, 900, 850, 800];
const delay = (group: number) => group * 670;
const ease = (t: number) => t * t * (3 - 2 * t);

@Component({
  selector: 'app-interface-swarm',
  standalone: true,
  template: '<canvas #surface aria-hidden="true"></canvas>',
  styles: `:host{position:absolute;inset:0;display:block;pointer-events:none}canvas{width:100%;height:100%;display:block}`,
})
export class InterfaceSwarm implements AfterViewInit, OnChanges, OnDestroy {
  @Input() paused = false;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private dots: Courier[] = [];
  private elapsed = 0;
  private lastFrame = 0;
  private sampled = false;
  private frame = 0;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.canvas = this.surface.nativeElement;
      this.context = this.canvas.getContext('2d') ?? undefined;
      if (!this.context || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);
      this.resize();
      this.dots = this.sampleTargets();
      this.sampled = true;
      this.frame = requestAnimationFrame(this.tick);
    });
  }

  ngOnChanges(): void {
    this.lastFrame = 0;
    if (!this.paused && this.context && this.dots.length) this.frame = requestAnimationFrame(this.tick);
    else cancelAnimationFrame(this.frame);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
  }

  private resize(): void {
    const bounds = this.host.nativeElement.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(bounds.width * dpr);
    this.canvas.height = Math.round(bounds.height * dpr);
    this.context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.sampled) this.dots = this.sampleTargets();
  }

  private sampleTargets(): Courier[] {
    const targets = [...document.querySelectorAll<HTMLElement>('[data-assemble]')];
    const result: Courier[] = [];
    const width = this.host.nativeElement.clientWidth;
    const height = this.host.nativeElement.clientHeight;
    for (const target of targets) {
      const group = Number(target.dataset['assemble']);
      const glyphs: DOMRect[] = [];
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let index = 0; index < (node.textContent?.length ?? 0); index++) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width && rect.height) glyphs.push(rect);
        }
      }
      const icons = [...target.querySelectorAll<SVGElement>('svg')].map((icon) => icon.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
      const box = target.getBoundingClientRect();
      if (!glyphs.length && box.width && box.height) glyphs.push(box);
      const budget = Math.min(group === 1 ? 210 : group === 2 || group === 3 ? 150 : 115, Math.max(38, glyphs.length * 2));
      const color = getComputedStyle(target).color;
      for (let index = 0; index < budget; index++) {
        const rect = glyphs[Math.floor(Math.random() * glyphs.length)];
        const source = Math.random() < .25 && icons.length ? icons[Math.floor(Math.random() * icons.length)] : rect;
        const tx = source.left + Math.random() * source.width;
        const ty = source.top + Math.random() * source.height;
        result.push({
          x: Math.random() * width, y: Math.random() * height,
          tx, ty, bend: (Math.random() - .5) * Math.min(width, height) * .4,
          size: .65 + Math.random() * 1.25, color, group,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    return result;
  }

  private readonly tick = (now: number): void => {
    if (!this.context || this.paused) return;
    if (this.lastFrame && now - this.lastFrame < 1000 / 30 - 1) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const bounds = this.host.nativeElement.getBoundingClientRect();
    if (this.lastFrame) this.elapsed += Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    const elapsed = this.elapsed;
    const context = this.context;
    context.clearRect(0, 0, bounds.width, bounds.height);
    for (const dot of this.dots) {
      const age = (elapsed - delay(dot.group)) / duration[dot.group];
      if (age < 0 || age > 1.28) continue;
      const progress = ease(Math.min(1, age));
      const rest = 1 - progress;
      const arc = Math.sin(progress * Math.PI);
      const x = dot.x * rest + dot.tx * progress + dot.bend * arc;
      const y = dot.y * rest + dot.ty * progress - Math.abs(dot.bend) * .3 * arc + Math.sin(age * 19 + dot.phase) * rest * 3;
      const alpha = age < 1 ? .35 + .65 * Math.min(1, age * 4) : Math.max(0, 1 - (age - 1) / .28);
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
    context.globalAlpha = 1;
    if (elapsed < delay(6) + duration[6] * 1.3) this.frame = requestAnimationFrame(this.tick);
  };
}
