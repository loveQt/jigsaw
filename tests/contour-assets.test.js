import test from 'node:test';
import assert from 'node:assert/strict';
import { readPNG, samples as sampleImage } from './helpers/image-utils.js';
import { CONTOUR_DATA } from '../src/contour-data.js';
import { CONTOUR_GEOMETRY } from '../src/contour-geometry.js';
import { PuzzleEngine } from '../src/puzzle-engine.js';

const geometry = new Map(CONTOUR_GEOMETRY.pieces.map(piece => [piece.id, piece]));
const samples = (image, bounds, polygon) => sampleImage(image, bounds, polygon, CONTOUR_DATA.pixelScale);


let loaded;
function assets() {
  loaded ??= Promise.all([
    readPNG(CONTOUR_DATA.image),
    Promise.all(CONTOUR_DATA.pieces.map(async piece => ({ piece, image: await readPNG(piece.image) }))),
  ]).then(([preview, pieces]) => ({ preview, pieces }));
  return loaded;
}


test('painted pieces retain exact geometry crop sizes and source scale', async () => {
  const { preview, pieces } = await assets();
  assert.equal(CONTOUR_DATA.id, 'dog-expressions-painted-v2');
  assert.equal(CONTOUR_DATA.pixelScale, 3);
  assert.equal(pieces.length, 9);
  assert.equal(new Set(pieces.map(({ piece }) => piece.image)).size, 9);
  assert.equal(preview.width, CONTOUR_DATA.width * CONTOUR_DATA.pixelScale);
  assert.equal(preview.height, CONTOUR_DATA.height * CONTOUR_DATA.pixelScale);
  for (const { piece, image } of pieces) {
    assert.equal(piece.path, geometry.get(piece.id).path, `${piece.id} preserves its fixed cut line`);
    assert.deepEqual(piece.bounds, geometry.get(piece.id).bounds, `${piece.id} preserves its source position`);
    assert.equal(image.width, piece.bounds.width * CONTOUR_DATA.pixelScale, `${piece.id} has the correct crop width`);
    assert.equal(image.height, piece.bounds.height * CONTOUR_DATA.pixelScale, `${piece.id} has the correct crop height`);
  }
});

test('each painted piece fills its entire region and has transparent pixels outside the cut line', async () => {
  const { pieces } = await assets();
  for (const { piece, image } of pieces) {
    let interior = 0, exterior = 0;
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      const alpha = image.pixels[sample.index + 3];
      if (sample.interior) {
        interior += 1;
        assert.ok(alpha >= 254, `${piece.id} has an unfilled interior at crop pixel ${sample.x},${sample.y} (alpha ${alpha})`);
      } else {
        exterior += 1;
        assert.ok(alpha <= 1, `${piece.id} spills outside its fixed contour at crop pixel ${sample.x},${sample.y} (alpha ${alpha})`);
      }
    }
    assert.ok(interior > 100, `${piece.id} has substantial opaque playable area`);
    assert.ok(exterior > 10, `${piece.id} crop includes independently checked transparent surroundings`);
  }
});

test('every region contains detailed artwork rather than a blank or solid fill', async () => {
  const { pieces } = await assets();
  for (const { piece, image } of pieces) {
    const colors = new Set();
    let count = 0, sum = 0, squares = 0;
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      if (!sample.interior) continue;
      const [r, g, b] = image.pixels.subarray(sample.index, sample.index + 3);
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      const brightness = (r + g + b) / 3;
      count += 1; sum += brightness; squares += brightness ** 2;
    }
    assert.ok(colors.size >= 16, `${piece.id} has enough color detail to distinguish facial features`);
    assert.ok(squares / count - (sum / count) ** 2 > 60, `${piece.id} contains visible detail instead of a uniform background`);
  }
});

test('the complete reference preserves every piece pixel and has no interior holes', async () => {
  const { preview, pieces } = await assets();
  const scale = CONTOUR_DATA.pixelScale;
  for (const { piece, image } of pieces) {
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      if (!sample.interior) continue;
      const x = piece.bounds.x * scale + sample.x;
      const y = piece.bounds.y * scale + sample.y;
      const assembledIndex = (y * preview.width + x) * 4;
      assert.deepEqual(preview.pixels.subarray(assembledIndex, assembledIndex + 4),
        image.pixels.subarray(sample.index, sample.index + 4),
        `${piece.id} preserves its exact artwork at assembly pixel ${x},${y}`);
    }
  }
  for (const sample of samples(preview, { x: 0, y: 0 }, CONTOUR_GEOMETRY.outlinePoints)) {
    const alpha = preview.pixels[sample.index + 3];
    assert.ok(sample.interior ? alpha >= 254 : alpha <= 1,
      `Complete reference has ${sample.interior ? 'a hole' : 'a spill'} at ${sample.x},${sample.y} (alpha ${alpha})`);
  }
});

test('the painted revision rejects saved progress from the earlier SVG revision atomically', () => {
  const current = new PuzzleEngine(CONTOUR_DATA.pieces, { puzzleId: CONTOUR_DATA.id });
  // Use the same current topology to prove that revision identity itself guards
  // against stale saves, even if a later edit happens to reuse all piece IDs.
  const earlier = new PuzzleEngine(CONTOUR_DATA.pieces, { puzzleId: 'dog-expressions-svg-v1' });
  earlier.hint();
  const before = current.serialize();
  assert.equal(current.restore(earlier.serialize()), false);
  assert.deepEqual(current.serialize(), before);
});
