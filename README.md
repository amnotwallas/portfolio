# Walter Ambriz — portfolio

A single-screen personal landing page for Walter Ambriz. It introduces his backend and AI work, provides contact actions, and pairs the hero with an animated Canvas reconstruction of the original pointillist bonsai.

## Stack

Angular 22, TypeScript, and SCSS. There is no backend, router, translation library, or animation dependency.

## Run locally

Use Node.js 22 or newer and npm.

```bash
npm ci
make
```

`make` (or `make dev`) starts the Angular development server at `http://127.0.0.1:4200/`. To check the build and portfolio configuration:

```bash
npm test
npm run build
```

The production files are written to `dist/portfolio/browser/`.

## Update content

Edit `src/app/profile.ts` for the name, company, email, LinkedIn URL, CV path, and EN/ES copy. The language buttons switch between two local content objects. Keep both translations aligned when changing copy.

Place the finished CV at `public/cv/Walter-Ambriz-CV.pdf`. The CV control checks that a PDF exists before downloading. Until then, it shows “CV not available yet” or “CV no disponible por ahora” without navigating to a missing file.

## Bonsai artwork

`public/bonsai.png` remains the source artwork and the fallback when Canvas or particle loading fails. The hero normally draws individual marks from `public/bonsai-particles.bin` over 6.2 seconds, then gently animates selected leaves and low vegetation with an occasional leaf drifting to the rocky base. A sparse ground scatter blends the base into the page. Above mobile widths, the artwork grows behind a soft text backing that keeps the hero readable. Reduced-motion visitors see the completed, still tree immediately. See [the extraction guide](tools/bonsai-particles/README.md) for regeneration, format, visual comparison, and limitations.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys pushes to `main`. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**. The workflow builds with `--base-href "/<repository-name>/"`, so it works at the normal GitHub Pages project URL. If you deploy at the domain root instead, change the workflow base href to `/`.

The workflow runs `npm ci`, `npm test`, and a production build before uploading `dist/portfolio/browser/`. Add the CV PDF before publishing if you want the download to be available.

## Accessibility and performance

The page uses semantic landmarks, keyboard controls, visible focus styles, a polite live status for copy/CV feedback, and `lang` updates on language changes. The illustration is decorative and hidden from assistive technology. Motion respects `prefers-reduced-motion`.
