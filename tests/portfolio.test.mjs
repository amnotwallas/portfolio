import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { profile, translations } from '../src/app/profile.ts';

test('the static bonsai asset, contact destinations, and both language copies are present', () => {
  assert.ok(existsSync('public/bonsai.png'));
  assert.match(profile.email, /^[^@]+@[^@]+\.[^@]+$/);
  assert.match(profile.linkedinUrl, /^https:\/\/www\.linkedin\.com\//);
  assert.equal(profile.cvUrl, 'cv/Walter-Ambriz-CV.pdf');
  assert.deepEqual(Object.keys(translations.en), Object.keys(translations.es));
});
