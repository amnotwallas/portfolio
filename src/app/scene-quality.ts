const windowMs = 1200;
const initialRecoveryMs = 6500;

export const sceneProfiles = [
  { resolution: 1, constructionFps: 30, ambientFps: 20, detail: 1 },
  { resolution: .85, constructionFps: 20, ambientFps: 15, detail: .7 },
  { resolution: .7, constructionFps: 15, ambientFps: 12, detail: .45 },
] as const;

export class SceneQuality {
  private current = 0;
  private started = 0;
  private samples = 0;
  private slow = 0;
  private headroom = 0;
  private slowWindows = 0;
  private steadyWindows = 0;
  private lastChange = -Infinity;
  private lastUpgrade = -Infinity;
  private recoveryMs = initialRecoveryMs;

  get level(): number { return this.current; }
  get profile() { return sceneProfiles[this.current]; }

  reset(): void {
    this.samples = this.slow = this.headroom = 0;
    this.slowWindows = this.steadyWindows = 0;
  }

  observe(now: number, cost: number, gap: number, interval: number): boolean {
    if (!this.samples) this.started = now;
    this.samples++;
    if (cost > Math.min(10, interval * .3) || gap > interval + 20) this.slow++;
    if (cost < 4 && gap < interval + 13) this.headroom++;
    if (now - this.started < windowMs) return false;
    this.slowWindows = this.slow / this.samples >= .25 ? this.slowWindows + 1 : 0;
    this.steadyWindows = this.headroom / this.samples >= .9 ? this.steadyWindows + 1 : 0;
    this.samples = this.slow = this.headroom = 0;
    let next = this.current;
    if (this.slowWindows >= 2 && now - this.lastChange >= 2500) next = Math.min(2, next + 1);
    if (this.steadyWindows >= 5 && now - this.lastChange >= this.recoveryMs) next = Math.max(0, next - 1);
    if (next === this.current) return false;
    if (next < this.current) this.lastUpgrade = now;
    else if (this.lastUpgrade === this.lastChange && now - this.lastUpgrade < initialRecoveryMs) {
      this.recoveryMs = Math.min(45_000, this.recoveryMs * 2);
    }
    this.current = next;
    this.lastChange = now;
    this.reset();
    return true;
  }
}
