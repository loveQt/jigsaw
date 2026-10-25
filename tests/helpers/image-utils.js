import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const publicRoot = new URL('../../public/', import.meta.url);

// Pillow exports RGBA8 PNGs. Decode their actual pixels with Node's built-in
// zlib so masks, crops and preview parity remain testable without dependencies.
export async function readPNG(asset) {
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


export function inside([x, y], polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

export function nearBoundary([x, y], polygon, margin) {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
    if ((x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2 <= margin ** 2) return true;
  }
  return false;
}

export function* samples(image, bounds, polygon, scale) {
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
