import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { CONTOUR_DATA } from '../src/contour-data.js';
import { CONTOUR_GEOMETRY } from '../src/contour-geometry.js';
import { PuzzleEngine } from '../src/puzzle-engine.js';

const publicRoot = new URL('../public/', import.meta.url);
const geometry = new Map(CONTOUR_GEOMETRY.pieces.map(piece => [piece.id, piece]));

// Pillow exports RGBA8 PNGs. Decode their actual pixels with Node's built-in
// zlib so masks, crops and preview parity remain testable without dependencies.
async function readPNG(asset) {
  assert.match(asset, /^\/assets\//, 'Runtime images resolve inside public assets');
  const file = await readFile(new URL(asset.slice(1), publicRoot));
  assert.deepEqual(file.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${asset} is a PNG`);
  const compressed = [];
  let width, height;
  for (let offset = 8; offset < file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0], `${asset} uses noninterlaced 8-bit RGBA`);
      assert.ok(width > 0 && height > 0 && width <= 10000 && height <= 10000);
    } else if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const stride = width * 4;
  const filtered = inflateSync(Buffer.concat(compressed));
  assert.equal(filtered.length, (stride + 1) * height, `${asset} contains every scanline`);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const type = filtered[y * (stride + 1)];
    assert.ok(type <= 4, `${asset} uses a valid PNG filter`);
    for (let x = 0; x < stride; x += 1) {
      const target = y * stride + x;
      const left = x >= 4 ? pixels[target - 4] : 0;
      const up = y > 0 ? pixels[target - stride] : 0;
      const corner = y > 0 && x >= 4 ? pixels[target - stride - 4] : 0;
      const predictor = type === 0 ? 0 : type === 1 ? left : type === 2 ? up
        : type === 3 ? Math.floor((left + up) / 2) : paeth(left, up, corner);
      pixels[target] = (filtered[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

let loaded;
function assets() {
  loaded ??= Promise.all([
    readPNG(CONTOUR_DATA.image),
    Promise.all(CONTOUR_DATA.pieces.map(async piece => ({ piece, image: await readPNG(piece.image) }))),
  ]).then(([preview, pieces]) => ({ preview, pieces }));
  return loaded;
}

function inside([x, y], polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

function nearBoundary([x, y], polygon, margin) {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
    if ((x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2 <= margin ** 2) return true;
  }
  return false;
}

function* samples(image, bounds, polygon) {
  const scale = CONTOUR_DATA.pixelScale;
  const step = 3 * scale;
  for (let y = Math.floor(step / 2); y < image.height; y += step) {
    for (let x = Math.floor(step / 2); x < image.width; x += step) {
      const point = [bounds.x + (x + 0.5) / scale, bounds.y + (y + 0.5) / scale];
      // Lanczos has a three-pixel reconstruction support around a cut edge.
      if (nearBoundary(point, polygon, 3.25 / scale)) continue;
      yield { x, y, index: (y * image.width + x) * 4, interior: inside(point, polygon) };
    }
  }
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
