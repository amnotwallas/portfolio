import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { profile, translations } from '../src/app/profile.ts';

test('the static bonsai asset, contact destinations, and both language copies are present', () => {
  assert.ok(existsSync('public/bonsai.png'));
  assert.ok(existsSync('public/bonsai.jpg'));
  assert.match(readFileSync('src/app/bonsai-canvas.ts', 'utf8'), /this\.fallback\.nativeElement\.src = 'bonsai\.jpg'/);
  assert.match(profile.email, /^[^@]+@[^@]+\.[^@]+$/);
  assert.match(profile.linkedinUrl, /^https:\/\/www\.linkedin\.com\//);
  assert.equal(profile.cvUrl, 'cv/Walter-Ambriz-CV.pdf');
  assert.deepEqual(Object.keys(translations.en), Object.keys(translations.es));
});

test('both languages present the same projects with public sources and a separate IBICARE case', () => {
  for (const language of ['en', 'es']) {
    const copy = translations[language];
    assert.match(copy.summary ?? '', /IBICARE.*Neuroa/);
    assert.deepEqual(copy.work.map((entry) => entry.id), ['caseLens', 'coffee']);
    assert.deepEqual(copy.lab.map((entry) => entry.id), ['sentinel', 'factory', 'kern', 'forest']);
    assert.equal(copy.experienceHighlights.length, 3);
    assert.match(copy.experienceHighlights[0].summary, /MLflow.*400/);
    assert.match(copy.experienceHighlights[1].summary, /GET.*POST/);
    for (const entry of [...copy.work, ...copy.lab]) {
      assert.ok(entry.title && entry.summary && entry.evidence);
      const { repository, evidence } = profile.projectLinks[entry.id];
      assert.equal(new URL(repository).origin, 'https://github.com');
      assert.notEqual(evidence, repository);
      assert.ok(evidence.startsWith(`${repository}/`) || evidence.startsWith(`${repository}#`));
    }
  }
});

test('the initial HTML exposes the profile and contact links without JavaScript', () => {
  const html = readFileSync('src/index.html', 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\//);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<app-root>[\s\S]*<h1>Walter Ambriz/);
  assert.match(html, /href="mailto:hello@wallas\.dev"/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/walterambriz"/);
});

test('the production site uses the custom domain root and keeps its Pages domain file', () => {
  const html = readFileSync('src/index.html', 'utf8');
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const cname = readFileSync('public/CNAME', 'utf8').trim();

  assert.match(html, /<base href="\/"\s*\/>/);
  assert.doesNotMatch(workflow, /--base-href\s+.*repository\.name/);
  assert.equal(cname, 'wallas.dev');
  assert.match(html, /rel="canonical" href="https:\/\/wallas\.dev\/"/);
  assert.match(html, /property="og:url" content="https:\/\/wallas\.dev\/"/);
  assert.match(html, /property="og:image" content="https:\/\/wallas\.dev\/bonsai\.jpg"/);
  assert.match(html, /name="twitter:image" content="https:\/\/wallas\.dev\/bonsai\.jpg"/);
  assert.match(html, /"url": "https:\/\/wallas\.dev\/"/);
  assert.doesNotMatch(html, /amnotwallas\.github\.io\/portfolio/);
});

test('the interface is visible independently of the forest and details open within one modal', () => {
  const template = readFileSync('src/app/app.html', 'utf8');
  assert.doesNotMatch(template, /treeStarted|growthStarted/);
  assert.match(template, /\[paused\]="paused\(\)"/);
  assert.equal((template.match(/<dialog\b/g) ?? []).length, 1);
  assert.match(template, /aria-labelledby="details-heading"/);
  for (const panel of ['work', 'experience', 'lab', 'contact']) {
    assert.match(template, new RegExp(`data-panel="${panel}"`));
  }
});
