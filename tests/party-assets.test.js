import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readPNG, samples as sampleImage, nearBoundary } from './helpers/image-utils.js';
import { PARTY_DATA } from '../src/party-data.js';
import { PARTY_GEOMETRY } from '../src/party-geometry.js';

const geometry = new Map(PARTY_GEOMETRY.pieces.map(piece => [piece.id, piece]));
const samples = (image, bounds, polygon) => sampleImage(image, bounds, polygon, PARTY_DATA.pixelScale);
let loaded;
function assets() {
  loaded ??= Promise.all([
    readPNG(PARTY_DATA.image),
    Promise.all(PARTY_DATA.pieces.map(async piece => ({ piece, image: await readPNG(piece.image) }))),
  ]).then(([preview, pieces]) => ({ preview, pieces }));
  return loaded;
}

test('the party has thirty individually identified dogs with mixed framing and illustration styles', () => {
  const pieces = PARTY_DATA.pieces;
  assert.equal(pieces.length, 30);
  assert.equal(new Set(pieces.map(piece => piece.id)).size, 30);
  assert.equal(new Set(pieces.map(piece => piece.name)).size, 30);
  assert.equal(new Set(pieces.map(piece => piece.image)).size, 30);
  assert.ok(new Set(pieces.map(piece => piece.style)).size >= 8, 'Media vary across the collection');
  assert.ok(pieces.filter(piece => piece.category === 'photography').length >= 10, 'Photographic work is a substantial part of the collection');
  assert.ok(pieces.filter(piece => piece.category === 'fine-art').length >= 5, 'Painted work complements photography');
  assert.ok(pieces.filter(piece => piece.category === 'graphic').length <= 5, 'Cartoons are a minority');
  assert.ok(pieces.filter(piece => piece.framing.includes('局部')).length >= 6, 'Body details vary the crops');
  assert.equal(new Set(pieces.map(piece => piece.source)).size, 30, 'Each dog has an independent source image');
  assert.equal(PARTY_DATA.artRevision, 'full-bleed-v2');
});

test('all thirty dog images preserve their fixed cut line, exact crop size and source scale', async () => {
  const { preview, pieces } = await assets();
  assert.equal(PARTY_DATA.pixelScale, 3);
  assert.equal(preview.width, PARTY_DATA.width * PARTY_DATA.pixelScale);
  assert.equal(preview.height, PARTY_DATA.height * PARTY_DATA.pixelScale);
  for (const { piece, image } of pieces) {
    const expected = geometry.get(piece.id);
    assert.equal(piece.path, expected.path);
    assert.deepEqual(piece.bounds, expected.bounds);
    assert.equal(image.width, piece.bounds.width * PARTY_DATA.pixelScale, `${piece.id} crop width`);
    assert.equal(image.height, piece.bounds.height * PARTY_DATA.pixelScale, `${piece.id} crop height`);
  }
});

test('the thirty PNG alpha masks fill each organic tile exactly and stay transparent outside it', async () => {
  const { pieces } = await assets();
  for (const { piece, image } of pieces) {
    let interior = 0, exterior = 0;
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      const alpha = image.pixels[sample.index + 3];
      if (sample.interior) {
        interior += 1;
        assert.ok(alpha >= 254, `${piece.id} has an interior hole at ${sample.x},${sample.y} (alpha ${alpha})`);
      } else {
        exterior += 1;
        assert.ok(alpha <= 1, `${piece.id} spills outside its cut at ${sample.x},${sample.y} (alpha ${alpha})`);
      }
    }
    assert.ok(interior > 100, `${piece.id} provides a substantial playable area`);
    assert.ok(exterior > 10, `${piece.id} has transparent space beyond its irregular edges`);
  }
});

test('every dog has distinct detailed image pixels throughout its cut region', async () => {
  const { pieces } = await assets();
  const fingerprints = new Set();
  for (const { piece, image } of pieces) {
    const colors = new Set();
    const digest = createHash('sha256');
    let count = 0, sum = 0, squares = 0;
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      if (!sample.interior) continue;
      const rgb = image.pixels.subarray(sample.index, sample.index + 3);
      digest.update(rgb);
      const [r, g, blue] = rgb;
      colors.add(`${r >> 4},${g >> 4},${blue >> 4}`);
      const brightness = (r + g + blue) / 3;
      count += 1; sum += brightness; squares += brightness ** 2;
    }
    assert.ok(count > 100, `${piece.id} has enough illustration area to inspect`);
    // Flat cartoons and pixel art can be detailed with a deliberately small palette.
    assert.ok(colors.size >= 8, `${piece.id} contains image detail instead of only a tile color`);
    assert.ok(squares / count - (sum / count) ** 2 > 60, `${piece.id} has visible character features`);
    fingerprints.add(digest.digest('hex'));
  }
  assert.equal(fingerprints.size, 30, 'All thirty illustrations have distinct image content');
});

test('image detail reaches the cut edges instead of leaving a solid backing around a sticker', async () => {
  const { pieces } = await assets();
  const scale = PARTY_DATA.pixelScale;
  for (const { piece, image } of pieces) {
    const polygon = geometry.get(piece.id).points;
    const colors = new Set();
    let count = 0, sum = 0, squares = 0;
    for (const sample of samples(image, piece.bounds, polygon)) {
      if (!sample.interior) continue;
      const point = [piece.bounds.x + (sample.x + 0.5) / scale, piece.bounds.y + (sample.y + 0.5) / scale];
      if (!nearBoundary(point, polygon, 9)) continue;
      const [r, g, b] = image.pixels.subarray(sample.index, sample.index + 3);
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      const brightness = (r + g + b) / 3;
      count += 1; sum += brightness; squares += brightness ** 2;
    }
    assert.ok(count > 50, `${piece.id} has an independently sampled perimeter band`);
    assert.ok(colors.size >= 8, `${piece.id} has image detail at its perimeter, not a plain tile color`);
    assert.ok(squares / count - (sum / count) ** 2 > 60, `${piece.id} has textured content up to its cut line`);
  }
});

test('the completed party reference matches the playable pieces and has no holes or exterior spill', async () => {
  const { preview, pieces } = await assets();
  const scale = PARTY_DATA.pixelScale;
  for (const { piece, image } of pieces) {
    for (const sample of samples(image, piece.bounds, geometry.get(piece.id).points)) {
      if (!sample.interior) continue;
      const x = piece.bounds.x * scale + sample.x;
      const y = piece.bounds.y * scale + sample.y;
      const assembledIndex = (y * preview.width + x) * 4;
      assert.deepEqual(preview.pixels.subarray(assembledIndex, assembledIndex + 4),
        image.pixels.subarray(sample.index, sample.index + 4),
        `${piece.id} reference differs from its playable image at ${x},${y}`);
    }
  }
  for (const sample of samples(preview, { x: 0, y: 0 }, PARTY_GEOMETRY.outlinePoints)) {
    const alpha = preview.pixels[sample.index + 3];
    assert.ok(sample.interior ? alpha >= 254 : alpha <= 1,
      `Party reference has ${sample.interior ? 'a hole' : 'a spill'} at ${sample.x},${sample.y} (alpha ${alpha})`);
  }
});
