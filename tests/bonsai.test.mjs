import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ASSEMBLY_MS, decodeBonsai, fitBonsai, growthProgress } from '../src/app/bonsai-data.ts';
import { variation } from '../src/app/forest-assembly.ts';
import { illustratedWater, pondSplashLift, waterlineAt } from '../src/app/landscape.ts';

test('loads the generated dots with valid dimensions and growth metadata', () => {
  const file = readFileSync('public/bonsai-particles.bin');
  const data = decodeBonsai(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  assert.equal(data.width, 1122);
  assert.equal(data.height, 1402);
  assert.equal(data.background, `rgb(${file[16]} ${file[17]} ${file[18]})`);
  assert.ok(data.particles.length > 20000);
  assert.ok(data.particles.every((dot) => dot.x < data.width && dot.y < data.height && dot.reveal <= 1));
  const groups = Array.from({ length: 5 }, (_, material) => data.particles.filter((dot) => dot.material === material));
  assert.ok(groups.every((group) => group.length > 1000));
  assert.ok(data.particles.filter((dot) => dot.lowVegetation).length > 500);
  assert.ok(groups[0][Math.floor(groups[0].length / 2)].reveal < groups[3][Math.floor(groups[3].length / 2)].reveal);
  assert.ok(groups[3][Math.floor(groups[3].length / 2)].reveal < groups[4][Math.floor(groups[4].length / 2)].reveal);
  assert.throws(() => decodeBonsai(new ArrayBuffer(20)), /particle/);
});

test('growth has a full reduced-motion state', () => {
  assert.equal(growthProgress(0, false), 0);
  assert.equal(growthProgress(6200, false), 1);
  assert.equal(growthProgress(0, true), 1);
});

test('viewport sizing protects the text clearing and aligns the tree with the shore', () => {
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1440, 900], [1920, 1080]]) {
    const fit = fitBonsai(1122, 1402, width, height, 3);
    const top = (fit.offsetY + 78 * fit.scale) / fit.pixelHeight;
    const left = (fit.offsetX + 38 * fit.scale) / fit.pixelWidth;
    const right = (fit.offsetX + 1089 * fit.scale) / fit.pixelWidth;
    const bottom = (fit.offsetY + 1354 * fit.scale) / fit.pixelHeight;
    if (width < 640) {
      assert.ok(top >= .54 && top < .6);
      assert.ok(left > .22 && left < .34);
    } else if (width >= 1440) {
      assert.ok(top > .12 && top < .18);
      assert.ok(left > .53 && left < .63);
    }
    assert.ok(right > .95 && right < 1);
    assert.ok(bottom > .9 && bottom < .95);
    assert.equal(fit.backdrop, height > width ? 'portrait' : 'wide');
    assert.ok(fit.pixelWidth * fit.pixelHeight <= 2_304_000);
  }
  const constrained = fitBonsai(1122, 1402, 390, 844, 3, true);
  assert.equal(constrained.dpr, 1.25);
});

const compiledCanvas = ts.transpileModule(readFileSync('src/app/bonsai-canvas.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
}).outputText;

function createCanvas(motion = {}, browser = {}) {
  const angular = {
    Component: () => (component) => component,
    ViewChild: () => () => {},
    Input: () => () => {},
    ElementRef: class ElementRef {},
    NgZone: class NgZone {},
  };
  angular.inject = (token) => token === angular.ElementRef
    ? { nativeElement: {} }
    : { runOutsideAngular: (run) => run() };
  const module = { exports: {} };
  runInNewContext(compiledCanvas, {
    module,
    exports: module.exports,
    require: (name) => name === '@angular/core' ? angular : { ASSEMBLY_MS, illustratedWater, pondSplashLift, waterlineAt, variation },
    window: { matchMedia: () => motion },
    AbortController,
    cancelAnimationFrame() {},
    ...browser,
  });
  return new module.exports.BonsaiCanvas();
}

test('the Canvas component releases its loading and browser resources', () => {
  const removed = [];
  const cancelled = [];
  const media = { removeEventListener: (...args) => removed.push(args) };
  const component = createCanvas(media, {
    document: { removeEventListener: (...args) => removed.push(args) },
    cancelAnimationFrame: (frame) => cancelled.push(frame),
  });
  let disconnected = false;
  component.frame = 42;
  component.resizeObserver = { disconnect: () => { disconnected = true; } };
  component.ngOnDestroy();
  assert.equal(component.abort.signal.aborted, true);
  assert.equal(disconnected, true);
  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(removed.map(([event]) => event), ['visibilitychange', 'change']);
});

test('the sampled landscape deposits each mark at its arrival and retains settled marks', () => {
  const component = createCanvas();
  const context = {};
  const dots = [
    { x: 10, y: 25, radius: 2, opacity: .8, reveal: .2 },
    { x: 20, y: 50, radius: 3, opacity: 1, reveal: .55 },
  ];
  component.landscapeContext = context;
  component.backdropAssembly = { data: { particles: dots }, next: 0, scaleX: 2, scaleY: .5, radiusScale: 1 };
  const marks = [];
  component.drawDot = (target, dot, x, y, opacity, radius) => {
    assert.equal(target, context);
    marks.push([dot, x, y, opacity, radius]);
  };

  component.paintBackdropUntil(.18);
  assert.equal(marks.length, 0);
  component.paintBackdropUntil(.22);
  assert.deepEqual(marks, [[dots[0], 20, 12.5, .8, 2]]);
  component.paintBackdropUntil(.6);
  component.paintBackdropUntil(1);
  assert.deepEqual(marks, [[dots[0], 20, 12.5, .8, 2], [dots[1], 40, 25, 1, 3]]);
});

test('the dragonfly crosses the pond, rests on the shoreline and takes off again', () => {
  for (const [width, height, perchX, perchY] of [
    [390, 844, 37, 806],
    [768, 1024, 73, 977],
    [1440, 900, 414, 770],
  ]) {
    const component = createCanvas({}, { Path2D: class { moveTo() {} arc() {} } });
    const positions = [];
    const poses = [];
    component.context = {
      save() {}, restore() {}, setTransform() {}, rotate() {},
      scale: (x, y) => poses.at(-1).scales.push([x, y]),
      fill() { poses.at(-1).colors.push(this.fillStyle); },
      translate(x, y) {
        positions.push([x, y]);
        poses.push({ scales: [], colors: [] });
      },
    };
    component.viewportWidth = width;
    component.viewportHeight = height;
    component.view = fitBonsai(1122, 1402, width, height, 2);
    component.backdropAssembly = {};
    component.progress = 1;

    component.drawDragonfly(6500);
    assert.equal(positions.length, 0);
    for (const elapsed of [7900, 11100, 12500, 17200, 23700, 25700, 27350]) {
      component.drawDragonfly(elapsed);
    }
    assert.equal(positions.length, 7);
    for (const [x, y] of positions) {
      assert.ok(x > 15 && x < width - 15 && y > height * .79 && y < height - 12, `${width} × ${height}: ${x}, ${y}`);
    }
    assert.ok(positions[2][0] < positions[1][0], 'the dragonfly should briefly double back');
    assert.ok(positions[3][0] - positions[4][0] > width * .5, 'the route should span the pond');
    assert.deepEqual(positions[4], positions[5], 'it should stay still on the perch');
    assert.notDeepEqual(poses[4].scales, poses[5].scales, 'its wings should keep moving on the perch');
    assert.ok(poses[4].colors.includes('#087bc5') && poses[4].colors.includes('#a4ecff'));
    const [x, y] = positions[4];
    assert.ok(Math.abs(x - perchX) < 2 && Math.abs(y + 4 - perchY) < 2, 'the feet should reach the grass');
    assert.ok(positions[6][0] > x && positions[6][1] < y, 'it climbs away from the grass');
    component.drawDragonfly(33000);
    assert.equal(positions.length, 7);
    component.drawDragonfly(39_000);
    component.drawDragonfly(67_500);
    assert.equal(positions.length, 9);
    assert.ok(Math.abs(positions[7][0] - positions[8][0]) > width * .08, 'later visits should follow different routes');
    component.reduced = true;
    component.drawDragonfly(23700);
    assert.equal(positions.length, 9);
  }
});

test('the reflection mirrors at the local waterline and clips to the illustrated pond', () => {
  const component = createCanvas();
  component.layer = {};
  for (const [layout, width, height] of [['wide', 1440, 900], ['portrait', 390, 844]]) {
    const points = [];
    const operations = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, scale() {},
      moveTo(x, y) { points.push([x, y]); },
      lineTo(x, y) { points.push([x, y]); },
      clip() { operations.push('clip'); },
      translate(_x, y) { operations.push(y); },
      drawImage() { operations.push('draw'); },
    };
    const art = illustratedWater[layout];
    const edge = Math.round(waterlineAt(art, art.reflectionX) / art.height * height);
    component.drawReflection(ctx, width, height, .916, 1, layout);
    assert.deepEqual(operations, ['clip', edge, 'draw']);
    assert.deepEqual(points.slice(0, art.bank.length), art.bank.map(([x, y]) => [x * (width / art.width), y * (height / art.height)]));
    assert.ok(points.slice(-2).every((point) => point[1] === height));
  }
});

test('ambient particles use only foliage and low vegetation, with a sparse ground extension', () => {
  const component = createCanvas();
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
  const motion = { matches: false };
  let randomValue = .2;
  const randomMath = Object.create(Math);
  randomMath.random = () => randomValue;
  const component = createCanvas(motion, { Math: randomMath });
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
  component.onMotionChange({ matches: true });
  drawn.length = 0;
  component.drawFallingLeaves(nextFallAt + 2000);
  assert.equal(drawn.length, 0);
});

test('switching reduced motion on during construction settles the scene', () => {
  const component = createCanvas({ matches: false }, {
    cancelAnimationFrame() {},
    document: { hidden: false },
  });
  component.view = {};
  component.elapsed = 1250;
  let progress;
  let presented;
  component.paintUntil = (value) => { progress = value; };
  component.present = (time) => { presented = time; };

  component.onMotionChange({ matches: true });

  assert.equal(progress, 1);
  assert.ok(presented > 6200);
});
