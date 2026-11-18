import assert from 'node:assert/strict';
import test from 'node:test';
import { paintLandscape, paintLandscapeMotion } from '../src/app/landscape.ts';

test('landscape marks are reproducible while the water and mist move within a bounded frame budget', () => {
  class RecordedPath {
    marks = [];
    moveTo(...values) { this.marks.push(values); }
    arc(...values) { this.marks.push(values); }
    rect(...values) { this.marks.push(values); }
  }

  function observe(paint, elapsed, backdrop, water = 1, mist = 1) {
    let fills = 0;
    let droplets = 0;
    let mistDraws = 0;
    let signature = 0;
    const record = (value) => {
      signature = (Math.imul(signature, 31) + Math.round(value * 100)) | 0;
    };
    const gradient = { addColorStop() {} };
    const ctx = {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      save() {}, restore() {}, beginPath() {},
      translate(...values) { values.forEach(record); },
      scale(...values) { values.forEach(record); },
      fill(path) {
        fills++;
        for (const mark of path?.marks ?? []) mark.forEach(record);
      },
      fillRect(...values) { fills++; values.forEach(record); },
      arc(...values) { droplets++; values.forEach(record); },
      moveTo(...values) { values.forEach(record); },
      lineTo(...values) { values.forEach(record); },
      quadraticCurveTo(...values) { values.forEach(record); },
      bezierCurveTo(...values) { values.forEach(record); },
      stroke() {},
      drawImage(_stamp, ...values) { mistDraws++; values.forEach(record); },
    };
    paint(ctx, 390, 844, true, elapsed, backdrop, water, mist, {});
    return { fills, signature, droplets, mistDraws };
  }

  const path = globalThis.Path2D;
  globalThis.Path2D = RecordedPath;
  try {
    const first = observe(paintLandscape, 0);
    assert.ok(first.fills > 30);
    assert.deepEqual(observe(paintLandscape, 0), first);
    const motion = observe(paintLandscapeMotion, 0);
    assert.ok(motion.fills < 50);
    assert.equal(motion.mistDraws, 1);
    assert.equal(observe(paintLandscapeMotion, 0, undefined, 1, 0).mistDraws, 0);
    assert.equal(observe(paintLandscapeMotion, 0, undefined, 0, 0).droplets, 0);
    assert.ok(motion.droplets >= 20 && motion.droplets <= 80);
    assert.notEqual(observe(paintLandscapeMotion, 2700).signature, motion.signature);
    const portrait = observe(paintLandscapeMotion, 0, 'portrait');
    const wide = observe(paintLandscapeMotion, 0, 'wide');
    assert.notEqual(portrait.signature, motion.signature);
    assert.notEqual(wide.signature, portrait.signature);
  } finally {
    globalThis.Path2D = path;
  }
});
