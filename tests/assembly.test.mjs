import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCouriers, scheduleAssembly, swarmWeight } from '../src/app/forest-assembly.ts';

const dot = (x, y, material, color, reveal = .5) =>
  ({ x, y, material, color, reveal, radius: 1.75, opacity: 1, lowVegetation: false });

test('the scene assigns overlapping roles with ordered destination waves', () => {
  const scenery = [
    dot(50, 85, 4, 'rgb(86 73 58)'),
    dot(75, 70, 4, 'rgb(72 113 90)'),
    dot(25, 78, 4, 'rgb(200 204 185)'),
    dot(70, 45, 4, 'rgb(195 199 176)'),
    dot(90, 80, 4, 'rgb(184 126 83)'),
  ];
  const water = { cascades: [{ top: [.26, .7], foot: [.24, .85], width: .12 }], shoreline: .93 };
  const plan = scheduleAssembly({ width: 100, height: 100, background: '#f5efe5', particles: scenery }, water);
  assert.deepEqual(new Set(plan.particles.map((mark) => mark.swarm)), new Set(['structure', 'foliage', 'water', 'atmosphere', 'detail']));
  assert.equal(new Set(plan.particles.map(({ x, y, color }) => JSON.stringify([x, y, color]))).size, 5);
  assert.ok(plan.particles.every((mark, i, marks) => i === 0 || mark.reveal > marks[i - 1].reveal));
  assert.ok(swarmWeight('water', .29) === 0 && swarmWeight('water', .55) > .6 && swarmWeight('water', .67) === 1);
  assert.ok(swarmWeight('atmosphere', .74) === 0 && swarmWeight('atmosphere', 1) === 1);
});

test('courier budgets and repeatable routes retain each role at mobile sizes', () => {
  const scenery = Array.from({ length: 250 }, (_, i) => [
    dot(50, 85, 4, 'rgb(86 73 58)', i / 250),
    dot(75, 70, 4, 'rgb(72 113 90)', i / 250),
    dot(25, 78, 4, 'rgb(200 204 185)', i / 250),
    dot(70, 45, 4, 'rgb(195 199 176)', i / 250),
    dot(90, 80, 4, 'rgb(184 126 83)', i / 250),
  ]).flat();
  const water = { cascades: [{ top: [.26, .7], foot: [.24, .85], width: .12 }], shoreline: .93 };
  const plan = scheduleAssembly({ width: 100, height: 100, background: '#f5efe5', particles: scenery }, water);
  const project = (mark) => ({ x: mark.x * 3.6, y: mark.y * 8, radius: 1 });
  const lanes = buildCouriers(plan.particles, 360, 800, 100, project, water);

  assert.deepEqual(lanes, buildCouriers(plan.particles, 360, 800, 100, project, water));
  assert.ok(lanes.flatMap((lane) => lane.members).length <= 100);
  assert.equal(lanes.length, 5);
  const structure = lanes.find((lane) => lane.swarm === 'structure').members[0];
  const cascade = lanes.find((lane) => lane.swarm === 'water').members[0];
  assert.ok(structure.fromY > structure.y);
  assert.ok(cascade.fromY < cascade.y);
  for (const { members, duration } of lanes) {
    assert.ok(members.every(({ dot: mark }) => mark.reveal > 0 && mark.reveal <= 1));
    assert.ok(members.every((mark, i) => i === 0 || mark.dot.reveal >= members[i - 1].dot.reveal));
    assert.ok(duration > .1 && duration < .4);
  }
});

test('water meets the neighboring land without a jump in deposit time', () => {
  const layout = { cascades: [{ top: [.26, .7], foot: [.24, .85], width: .12 }], shoreline: .93 };
  const neighbors = [
    [[31.9, 80], [32.1, 80]],
    [[26, 69.9], [26, 70.1]],
    [[50, 92.9], [50, 93.1]],
  ];
  for (const [a, b] of neighbors) {
    const particles = [a, b].map(([x, y]) => dot(x, y, 4, 'rgb(96 108 92)'));
    const { particles: planned } = scheduleAssembly({ width: 100, height: 100, background: '', particles }, layout);
    assert.ok(planned.some((mark) => mark.swarm === 'water'));
    assert.ok(planned.some((mark) => mark.swarm !== 'water'));
    assert.ok(planned[1].reveal - planned[0].reveal < .13, 'the motion lane should not gate deposition');
    assert.ok(planned.every((mark) => mark.reveal < .58));
  }
});

test('assembly reserves separate fronts for each fall despite a large pool population', () => {
  const layout = {
    cascades: [
      { top: [.4, .5], foot: [.35, .7], width: .07 },
      { top: [.32, .78], foot: [.31, .86], width: .10 },
    ],
    shoreline: .92,
  };
  const art = {
    width: 100, height: 100,
    falls: [
      { strands: [[40, 50, 36, 56, 35, 70]] },
      { strands: [[32, 78, 32, 81, 31, 86]] },
    ],
  };
  const marks = [
    ...Array.from({ length: 1000 }, (_, i) => dot(20 + i % 60, 94, 4, 'rgb(96 108 92)', i / 1000)),
    ...Array.from({ length: 20 }, (_, i) => dot(36, 60 + i % 2, 4, 'rgb(125 152 133)', i / 20)),
    ...Array.from({ length: 20 }, (_, i) => dot(32, 83 + i % 2, 4, 'rgb(125 152 133)', i / 20)),
  ];
  const { particles } = scheduleAssembly({ width: 100, height: 100, background: '', particles: marks }, layout);
  const lanes = buildCouriers(particles, 100, 100, 18, (p) => p, layout, art);
  const upper = lanes.flatMap((lane) => lane.members).filter((p) => p.y < 75);
  const lower = lanes.flatMap((lane) => lane.members).filter((p) => p.y >= 75 && p.y < 90);
  assert.ok(upper.length >= 5 && lower.length >= 5);
  assert.ok(upper.every((p) => p.fromY <= p.bendY && p.bendY < p.y && p.fromX >= 40));
  assert.ok(lower.every((p) => p.fromY <= p.bendY && p.bendY < p.y && p.fromX >= 32));
  assert.ok(lanes.reduce((total, lane) => total + lane.members.length, 0) <= 18);
});

test('foliage paths approach from the supporting branch before spreading into the crown', () => {
  const marks = [
    { ...dot(20, 65, 0, 'rgb(80 60 40)', .16), swarm: 'structure' },
    { ...dot(60, 31, 1, 'rgb(80 60 40)', .3), swarm: 'structure' },
    ...Array.from({ length: 20 }, (_, i) => ({
      ...dot(76 + i % 4, 26, 3, 'rgb(70 110 80)', .45 + i*.007), swarm: 'foliage',
    })),
  ];
  const foliage = buildCouriers(marks, 100, 100, 24, (p) => p)
    .filter((lane) => lane.swarm === 'foliage').flatMap((lane) => lane.members);
  assert.ok(foliage.length > 0);
  assert.ok(foliage.every((p) => p.fromX < 60 && p.bendX < p.x && p.bendY >= p.y));
});
