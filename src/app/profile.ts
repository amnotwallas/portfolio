export type Language = 'en' | 'es';

export const profile = {
  name: 'Walter Ambriz',
  company: 'IBICARE',
  companyUrl: 'https://ibicare.mx/',
  companyAppUrl: 'https://play.google.com/store/apps/details?id=mx.ibicare.IbicareApp&hl=es_HN',
  email: 'walterardev@gmail.com',
  linkedinUrl: 'https://www.linkedin.com/in/walterambriz',
  githubUrl: 'https://github.com/amnotwallas',
  cvUrl: 'cv/Walter-Ambriz-CV.pdf',
};

export const translations = {
  en: {
    navLabel: 'Language selection',
    languageLabel: 'Language',
    heroLabel: 'Introduction',
    role: 'BACKEND & AI ENGINEER',
    messageNavLabel: 'Explore my work; selecting a message stops automatic rotation',
    messages: [
      {
        topic: 'Backend',
        headline: 'I build backend APIs and integrate AI agents.',
        summary: 'At IBICARE, I connected Neuroa agents to APIs for health-record queries and appointment scheduling.',
      },
      {
        topic: 'AI Engineering',
        headline: 'I evaluate AI before deployment.',
        summary: 'At IBICARE, I built MLflow checks in CI/CD for prompt regressions, tool-calling failures, hallucinations, and safety issues.',
      },
      {
        topic: 'Access control',
        headline: 'I make AI respect user roles.',
        summary: 'At IBICARE, I applied role-based access across the app and Neuroa for users, admins, and health professionals.',
      },
    ],
    downloadCv: 'Download CV',
    emailAction: 'Copy email',
    emailCopied: 'Email copied',
    emailCopyFailed: 'Could not copy email',
    cvUnavailable: 'CV not available yet',
    linkedinAction: 'LinkedIn profile',
    githubAction: 'GitHub profile',
    experienceLabel: 'EXPERIENCE',
    experienceRole: 'Backend & AI Engineer',
    experienceSubtitle: 'Corporate health & wellbeing platform',
    experienceDate: '2025 — Present',
    companyAppAction: 'Open IBICARE app on Google Play',
  },
  es: {
    navLabel: 'Selección de idioma',
    languageLabel: 'Idioma',
    heroLabel: 'Presentación',
    role: 'BACKEND & AI ENGINEER',
    messageNavLabel: 'Explorar mi trabajo; elegir un mensaje detiene la rotación automática',
    messages: [
      {
        topic: 'Backend',
        headline: 'Desarrollo APIs de backend e integro agentes de IA.',
        summary: 'En IBICARE, conecté agentes Neuroa con APIs para consultar historiales de salud y programar citas.',
      },
      {
        topic: 'AI Engineering',
        headline: 'Evalúo la IA antes de desplegarla.',
        summary: 'En IBICARE, creé pruebas con MLflow en CI/CD para regresiones en prompts, fallos en llamadas a herramientas, alucinaciones y seguridad.',
      },
      {
        topic: 'Control de acceso',
        headline: 'Hago que la IA respete los roles.',
        summary: 'En IBICARE, apliqué permisos por rol en la app y Neuroa para usuarios, administradores y profesionales de salud.',
      },
    ],
    downloadCv: 'Descargar CV',
    emailAction: 'Copiar email',
    emailCopied: 'Email copiado',
    emailCopyFailed: 'No se pudo copiar el email',
    cvUnavailable: 'CV no disponible por ahora',
    linkedinAction: 'Perfil de LinkedIn',
    githubAction: 'Perfil de GitHub',
    experienceLabel: 'EXPERIENCIA',
    experienceRole: 'Ingeniero Backend e IA',
    experienceSubtitle: 'Plataforma de salud y bienestar corporativo',
    experienceDate: '2025 — Presente',
    companyAppAction: 'Abrir la app de IBICARE en Google Play',
  },
} as const;
