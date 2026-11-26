import { Component, computed, signal, type OnDestroy } from '@angular/core';
import { profile, translations, type Language } from './profile';
import { BonsaiCanvas } from './bonsai-canvas';
import { InterfaceSwarm } from './interface-swarm';

type Panel = 'work' | 'experience' | 'lab' | 'contact';
const languageKey = 'portfolio-language';

function loadLanguage(): Language {
  try {
    return localStorage.getItem(languageKey) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

@Component({
  selector: 'app-root',
  styleUrls: ['./app.scss', './details-dialog.scss'],
  templateUrl: './app.html',
  imports: [BonsaiCanvas, InterfaceSwarm],
})
export class App implements OnDestroy {
  protected readonly profile = profile;
  protected readonly language = signal(loadLanguage());
  protected readonly copy = computed(() => translations[this.language()]);
  protected readonly paused = signal(false);
  protected readonly panel = signal<Panel>('work');
  protected readonly cvFeedback = signal('');
  protected readonly emailFeedback = signal('');
  private panelTrigger?: HTMLElement;
  private cvFeedbackTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    document.documentElement.lang = this.language();
  }

  ngOnDestroy(): void {
    clearTimeout(this.cvFeedbackTimer);
  }

  protected setLanguage(language: Language): void {
    this.language.set(language);
    document.documentElement.lang = language;
    this.cvFeedback.set('');
    try {
      localStorage.setItem(languageKey, language);
    } catch {
      // Language selection is also available when storage is disabled.
    }
  }

  protected openPanel(dialog: HTMLDialogElement, panel: Panel, event: Event): void {
    this.panelTrigger = event.currentTarget as HTMLElement;
    this.panel.set(panel);
    this.emailFeedback.set('');
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  protected openProjectLink(event: MouseEvent, href: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.location.assign(href);
  }

  protected restoreFocus(): void {
    this.panelTrigger?.focus({ preventScroll: true });
    this.panelTrigger = undefined;
  }

  protected async copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(profile.email);
      this.emailFeedback.set(this.copy().emailCopied);
    } catch {
      this.emailFeedback.set(this.copy().emailCopyFailed);
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
      this.cvFeedback.set(this.copy().cvUnavailable);
      clearTimeout(this.cvFeedbackTimer);
      this.cvFeedbackTimer = setTimeout(() => this.cvFeedback.set(''), 3500);
    }
  }
}
