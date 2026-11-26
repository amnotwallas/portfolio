import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneQuality } from '../src/app/scene-quality.ts';

test('quality drops after sustained load and recovers one level after sustained headroom', () => {
  const quality = new SceneQuality();
  let now = 0;
  const run = (ms, cost, interval = 33) => {
    const stop = now + ms;
    while (now < stop) {
      now += interval;
      quality.observe(now, cost, interval, interval);
    }
  };
  run(1500, 14);
  assert.equal(quality.level, 0);
  run(1250, 14);
  assert.equal(quality.level, 1);
  run(2700, 14);
  assert.equal(quality.level, 2);
  run(4000, 1);
  assert.equal(quality.level, 2);
  run(11500, 1);
  assert.equal(quality.level, 0);
});

test('a hidden interval and sporadic spikes do not count as persistent pressure', () => {
  const quality = new SceneQuality();
  for (let now = 0; now < 1500; now += 33) quality.observe(now, 20, 33, 33);
  quality.reset();
  for (let now = 30000; now < 37000; now += 33) {
    quality.observe(now, now % 7 === 0 ? 22 : 2, 33, 33);
  }
  assert.equal(quality.level, 0);
});

test('a failed quality recovery extends the interval before another attempt', () => {
  const quality = new SceneQuality();
  let now = 0;
  const run = (ms, cost) => {
    const stop = now + ms;
    while (now < stop) {
      now += 33;
      quality.observe(now, cost, 33, 33);
    }
  };
  run(2700, 15);
  assert.equal(quality.level, 1);
  run(7600, 1);
  assert.equal(quality.level, 0);
  run(2700, 15);
  assert.equal(quality.level, 1);
  run(9000, 1);
  assert.equal(quality.level, 1);
  run(5200, 1);
  assert.equal(quality.level, 0);
});
