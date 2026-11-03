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

test('each language offers three distinct, grounded professional messages', () => {
  for (const language of ['en', 'es']) {
    const messages = translations[language].messages;
    assert.equal(messages.length, 3);
    assert.deepEqual(messages.map((message) => message.topic), language === 'en' ? ['Backend', 'AI Engineering', 'Access control'] : ['Backend', 'AI Engineering', 'Control de acceso']);
    assert.ok(messages.every((message) => message.headline && message.summary));
    assert.match(messages[0].summary, /IBICARE/);
    assert.match(messages[1].summary, /MLflow/);
    assert.match(messages[2].summary, /IBICARE/);
    assert.doesNotMatch(messages.map((message) => `${message.headline} ${message.summary}`).join(' '), /CaseLens/);
  }
});

test('the initial HTML exposes the profile and contact links without JavaScript', () => {
  const html = readFileSync('src/index.html', 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\//);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<app-root>[\s\S]*<h1>Walter Ambriz/);
  assert.match(html, /href="mailto:walterardev@gmail\.com"/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/walterambriz"/);
});
