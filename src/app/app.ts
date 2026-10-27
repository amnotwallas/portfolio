import { Component, computed, signal } from '@angular/core';
import { profile, translations, type Language } from './profile';
import { BonsaiCanvas } from './bonsai-canvas';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  imports: [BonsaiCanvas],
})
export class App {
  protected readonly profile = profile;
  protected readonly language = signal<Language>('en');
  protected readonly copy = computed(() => translations[this.language()]);
  protected readonly feedback = signal('');
  private feedbackTimer?: ReturnType<typeof setTimeout>;

  protected setLanguage(language: Language): void {
    this.language.set(language);
    document.documentElement.lang = language;
    this.feedback.set('');
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
