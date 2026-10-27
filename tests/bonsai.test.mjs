import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { decodeBonsai, fitBonsai, growthProgress } from '../src/app/bonsai-data.ts';

test('loads the generated dots with valid dimensions and growth metadata', () => {
  const file = readFileSync('public/bonsai-particles.bin');
  const data = decodeBonsai(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  assert.equal(data.width, 1122);
  assert.equal(data.height, 1402);
  assert.ok(data.particles.length > 20000);
  assert.ok(data.particles.every((dot) => dot.x < data.width && dot.y < data.height && dot.reveal <= 1));
  const groups = Array.from({ length: 5 }, (_, material) => data.particles.filter((dot) => dot.material === material));
  assert.ok(groups.every((group) => group.length > 1000));
  assert.ok(data.particles.filter((dot) => dot.lowVegetation).length > 500);
  assert.ok(groups[0][Math.floor(groups[0].length / 2)].reveal < groups[3][Math.floor(groups[3].length / 2)].reveal);
  assert.ok(groups[3][Math.floor(groups[3].length / 2)].reveal < groups[4][Math.floor(groups[4].length / 2)].reveal);
  assert.throws(() => decodeBonsai(new ArrayBuffer(20)), /particle/);
});

test('growth has a full reduced-motion state and responsive contain sizing', () => {
  assert.equal(growthProgress(0, false), 0);
  assert.equal(growthProgress(6200, false), 1);
  assert.equal(growthProgress(0, true), 1);
  const fit = fitBonsai(1122, 1402, 320, 320, 2);
  assert.equal(fit.pixelWidth, 640);
  assert.equal(fit.pixelHeight, 640);
  assert.ok(fit.scale > 0 && fit.offsetX > 0);
  assert.equal(fit.offsetY, 0);
});

test('the Canvas component releases its loading and browser resources', () => {
  const source = readFileSync('src/app/bonsai-canvas.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  const removed = [];
  const cancelled = [];
  const media = { removeEventListener: (...args) => removed.push(args) };
  const angular = {
    Component: () => (component) => component,
    ViewChild: () => () => {},
    ElementRef: class ElementRef {},
    NgZone: class NgZone {},
  };
  angular.inject = (token) => token === angular.ElementRef ? { nativeElement: {} } : { runOutsideAngular: (run) => run() };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => name === '@angular/core' ? angular : {},
    window: { matchMedia: () => media },
    document: { removeEventListener: (...args) => removed.push(args) },
    cancelAnimationFrame: (frame) => cancelled.push(frame),
    AbortController,
  });
  const component = new module.exports.BonsaiCanvas();
  let disconnected = false;
  component.frame = 42;
  component.resizeObserver = { disconnect: () => { disconnected = true; } };
  component.ngOnDestroy();
  assert.equal(component.abort.signal.aborted, true);
  assert.equal(disconnected, true);
  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(removed.map(([event]) => event), ['visibilitychange', 'change']);
});

test('ambient particles use only foliage and low vegetation, with a sparse ground extension', () => {
  const source = readFileSync('src/app/bonsai-canvas.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  const angular = {
    Component: () => (component) => component,
    ViewChild: () => () => {},
    ElementRef: class ElementRef {},
    NgZone: class NgZone {},
  };
  angular.inject = () => ({ nativeElement: {} });
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports,
    require: () => angular,
    window: { matchMedia: () => ({}) },
    AbortController,
  });
  const component = new module.exports.BonsaiCanvas();
  const file = readFileSync('public/bonsai-particles.bin');
  const dots = decodeBonsai(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)).particles;
  const leaves = dots.filter((dot) => component.isAnimatedLeaf(dot));
  const grass = dots.filter((dot) => component.isAnimatedGrass(dot));
  const extension = dots.filter((dot) => component.isGroundExtension(dot));
  assert.ok(leaves.length > 300 && leaves.length < 1200);
  assert.ok(grass.length > 30 && grass.length < 300);
  assert.ok(extension.length > 30 && extension.length < 300);
  assert.ok(leaves.every((dot) => dot.material === 3));
  assert.ok(grass.every((dot) => dot.lowVegetation));
  assert.ok(extension.every((dot) => dot.material === 4 && dot.y > 1290));
});

test('falling foliage varies its timing and can drift from separate canopies together', () => {
  const source = readFileSync('src/app/bonsai-canvas.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  const motion = { matches: false };
  let randomValue = .2;
  const randomMath = Object.create(Math);
  randomMath.random = () => randomValue;
  const angular = {
    Component: () => (component) => component,
    ViewChild: () => () => {},
    ElementRef: class ElementRef {},
    NgZone: class NgZone {},
  };
  angular.inject = () => ({ nativeElement: {} });
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports,
    require: () => angular,
    window: { matchMedia: () => motion },
    Math: randomMath,
    AbortController,
  });
  const component = new module.exports.BonsaiCanvas();
  const leaves = [
    { x: 500, y: 400, radius: 2, material: 3, color: 'rgb(50 90 75)', opacity: 1, reveal: 1 },
    { x: 900, y: 350, radius: 2, material: 3, color: 'rgb(50 90 75)', opacity: 1, reveal: 1 },
    { x: 100, y: 100, radius: 2, material: 3, color: 'rgb(50 90 75)', opacity: 1, reveal: 1 },
  ];
  component.fallingSources = leaves;
  component.context = {};
  component.progress = 1;
  const drawn = [];
  component.drawDot = (_context, dot, x, y, opacity) => drawn.push({ dot, x, y, opacity });

  const firstFallAt = component.nextFallAt;
  assert.ok(firstFallAt >= 6700 && firstFallAt <= 7700);
  component.drawFallingLeaves(6200);
  assert.equal(drawn.length, 0);
  component.drawFallingLeaves(firstFallAt);
  drawn.length = 0;
  component.drawFallingLeaves(firstFallAt + 2000);
  assert.equal(drawn.length, 2);
  assert.ok(Math.hypot(drawn[0].dot.x - drawn[1].dot.x, drawn[0].dot.y - drawn[1].dot.y) > 320);
  assert.ok(Math.abs(drawn[0].dot.y - drawn[1].dot.y) > 180);
  assert.ok(drawn.every(({ dot, x, y, opacity }) => x !== dot.x && y > dot.y && opacity > 0));
  const nextFallAt = component.nextFallAt;
  drawn.length = 0;
  component.drawFallingLeaves(firstFallAt + 9000);
  assert.ok(drawn[0]?.y > 1200 && drawn[0].y < 1320);
  drawn.length = 0;
  component.drawFallingLeaves(firstFallAt + 10000);
  assert.equal(drawn.length, 0);

  randomValue = .9;
  component.drawFallingLeaves(nextFallAt);
  assert.equal(component.fallingLeaves.length, 1);
  assert.notEqual(component.nextFallAt - nextFallAt, nextFallAt - firstFallAt);
  motion.matches = true;
  drawn.length = 0;
  component.drawFallingLeaves(nextFallAt + 2000);
  assert.equal(drawn.length, 0);
});
