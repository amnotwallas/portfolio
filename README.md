# Walter Ambriz — portfolio

A single-screen bilingual portfolio for Walter Ambriz. The interface sits over a full-viewport forest formed by Canvas 2D particles. Work, experience, lab, and contact details open in keyboard-accessible panels while the forest keeps moving.

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

## Living Forest artwork

The original drawing in `public/bonsai.png` supplies the main tree and its branch-growth guides. Two text-free landscape plates provide the portrait and wide scenery. The same Python extractor turns the source artwork into colored points. The browser builds and caches the scenery and bonsai in Canvas, then layers moving water, reflections, mist, foliage, and the raven. The JPEG is a fallback if the Canvas or main particle asset fails.

See [the artwork notes](docs/redesign/README.md) for source files and regeneration, or [the extraction guide](tools/bonsai-particles/README.md) for the binary format.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys pushes to `main`. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**. The workflow builds with `--base-href "/<repository-name>/"`, so it works at the normal GitHub Pages project URL. If you deploy at the domain root instead, change the workflow base href to `/`.

The workflow runs `npm ci`, `npm test`, and a production build before uploading `dist/portfolio/browser/`. Add the CV PDF before publishing if you want the download to be available.

## Accessibility and performance

The profile and controls are usable during assembly. Panels restore focus on close and can scroll internally on short viewports. Desktop blur stays within the open panel. Touch layouts use an opaque paper surface. The scene respects reduced motion, pauses on request, and suspends its frame loop while the document is hidden.
