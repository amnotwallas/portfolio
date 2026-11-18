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
  assert.deepEqual(plan.particles.map((mark) => mark.swarm), ['structure', 'foliage', 'water', 'atmosphere', 'detail']);
  assert.equal(new Set(plan.particles.map(({ x, y, color }) => JSON.stringify([x, y, color]))).size, 5);
  assert.ok(plan.particles.every((mark, i, marks) => i === 0 || mark.reveal > marks[i - 1].reveal));
  assert.ok(swarmWeight('water', .55) === 0 && swarmWeight('water', .86) === 1);
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
