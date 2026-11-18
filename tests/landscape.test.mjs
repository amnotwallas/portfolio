import assert from 'node:assert/strict';
import test from 'node:test';
import { illustratedWater, paintLandscape, paintLandscapeMotion, waterlineAt } from '../src/app/landscape.ts';

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
    let rings = 0;
    let turns = 0;
    let streams = 0;
    let glowDraws = 0;
    let smokeDraws = 0;
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
      rotate(value) { turns++; record(value); },
      ellipse(...values) { rings++; values.forEach(record); },
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
      stroke() {
        if (this.strokeStyle === '#fffbee' || this.strokeStyle === '#80a29a') streams++;
      },
      drawImage(stamp, ...values) {
        if (stamp === 'glow') glowDraws++;
        else if (stamp === 'smoke') smokeDraws++;
        else mistDraws++;
        values.forEach(record);
      },
    };
    paint(ctx, 390, 844, true, elapsed, backdrop, water, mist, { mist: 'mist', glow: 'glow', smoke: 'smoke' });
    return { fills, signature, droplets, mistDraws, rings, turns, streams, glowDraws, smokeDraws };
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
    assert.ok(motion.streams >= 8 && motion.streams <= 24);
    assert.equal(observe(paintLandscapeMotion, 0, undefined, 0, 1).streams, 0);
    assert.notEqual(observe(paintLandscapeMotion, 2700).signature, motion.signature);
    const portrait = observe(paintLandscapeMotion, 0, 'portrait');
    const wide = observe(paintLandscapeMotion, 0, 'wide');
    assert.notEqual(portrait.signature, motion.signature);
    assert.notEqual(wide.signature, portrait.signature);
    assert.equal(motion.glowDraws, 0);
    assert.equal(motion.smokeDraws, 0);
    assert.ok(portrait.glowDraws > 0 && portrait.smokeDraws > 0);
    assert.ok(wide.glowDraws > 0 && wide.smokeDraws > 0);
    assert.equal(observe(paintLandscapeMotion, 0, 'portrait', 1, 0).glowDraws, 0);
    assert.equal(observe(paintLandscapeMotion, 0, 'portrait', 1, 0).smokeDraws, 0);
    const leap = observe(paintLandscapeMotion, 14050, 'portrait');
    assert.equal(leap.turns, 1);
    assert.ok(leap.rings > 0);
    const landing = observe(paintLandscapeMotion, 14700, 'portrait');
    assert.equal(landing.turns, 0);
    assert.ok(landing.rings > 0);
    assert.equal(observe(paintLandscapeMotion, 14050, 'portrait', 0).turns, 0);
    assert.equal(observe(paintLandscapeMotion, 16000, 'portrait').rings, 0);
  } finally {
    globalThis.Path2D = path;
  }
});

test('illustrated flow uses distinct strand widths and stays between sill rocks', () => {
  for (const [layout, width, height, sill, islands] of [
    ['wide', 1672, 941, 836, [[754, 774], [853, 890]]],
    ['portrait', 863, 1823, 1630, [[146, 164], [233, 255]]],
  ]) {
    const widths = new Set();
    const upper = [];
    const lower = [];
    const foam = new Set();
    const ripples = [];
    const points = [];
    const ctx = {
      save() {}, restore() {}, beginPath() { points.length = 0; },
      moveTo(x, y) { points.push([x, y]); },
      quadraticCurveTo(_cx, _cy, x, y) { points.push([x, y]); },
      arc() {}, fill() {},
      fillRect(x, y, length) { ripples.push({ x, y, length }); },
      stroke() {
        if (this.strokeStyle === '#fff8e5') {
          foam.add(Math.round((points[0][0] + points[1][0]) / 2));
          return;
        }
        if (!['#fffbee', '#80a29a'].includes(this.strokeStyle) || this.globalAlpha < .04) return;
        widths.add(this.lineWidth);
        for (const spot of points) (spot[1] >= sill ? lower : upper).push(spot);
      },
    };
    for (let elapsed = 0; elapsed < 2300; elapsed += 41) {
      paintLandscapeMotion(ctx, width, height, layout === 'portrait', elapsed, layout, 1, 0);
    }
    assert.ok(widths.size >= 3, 'strands should have independent widths');
    assert.ok(upper.length > 60 && lower.length > 60);
    for (const [x, y] of lower) {
      assert.ok(y <= (layout === 'portrait' ? 1678 : 864));
      assert.ok(islands.every(([left, right]) => x <= left || x >= right), `stream crosses a ${layout} sill rock at ${x},${y}`);
    }
    const [left, right] = layout === 'wide' ? [274, 1574] : [126, 813];
    const art = illustratedWater[layout];
    assert.ok(ripples.length > 0 && ripples.every(({ x, y, length }) =>
      x >= left && x + length <= right && y >= waterlineAt(art, x) && y >= waterlineAt(art, x + length)
    ));
    assert.deepEqual([...foam], art.falls.flatMap((fall) => fall.foam.map(([x]) => x)));
  }
});
