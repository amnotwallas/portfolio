import { Component, computed, signal, type OnDestroy } from '@angular/core';
import { profile, translations, type Language } from './profile';
import { BonsaiCanvas } from './bonsai-canvas';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  imports: [BonsaiCanvas],
})
export class App implements OnDestroy {
  protected readonly profile = profile;
  protected readonly language = signal<Language>('en');
  protected readonly copy = computed(() => translations[this.language()]);
  protected readonly selectedMessage = signal(0);
  protected readonly treeStarted = signal(false);
  protected readonly feedback = signal('');
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly rotationTimer = window.setInterval(() => {
    if (!document.hidden && !this.reducedMotion.matches) {
      this.selectedMessage.update((index) => (index + 1) % this.copy().messages.length);
    }
  }, 10000);

  ngOnDestroy(): void {
    clearInterval(this.rotationTimer);
    clearTimeout(this.feedbackTimer);
  }

  protected setLanguage(language: Language): void {
    this.language.set(language);
    document.documentElement.lang = language;
    this.feedback.set('');
  }

  protected selectMessage(index: number): void {
    this.selectedMessage.set(index);
    this.stopRotation();
  }

  protected startHeroAnimation(): void {
    this.treeStarted.set(true);
  }

  protected stopRotation(): void {
    clearInterval(this.rotationTimer);
  }

  protected async copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(profile.email);
      this.showFeedback(this.copy().emailCopied);
    } catch {
      this.showFeedback(this.copy().emailCopyFailed);
    }
  }

  protected async downloadCv(event: Event): Promise<void> {
    event.preventDefault();
    try {
      const response = await fetch(profile.cvUrl, { method: 'HEAD' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error('CV missing');
      }
      const link = document.createElement('a');
      link.href = profile.cvUrl;
      link.download = 'Walter-Ambriz-CV.pdf';
      link.click();
    } catch {
      this.showFeedback(this.copy().cvUnavailable);
    }
  }

  private showFeedback(message: string): void {
    this.feedback.set(message);
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => this.feedback.set(''), 2600);
  }

}
