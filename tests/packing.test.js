import test from 'node:test';
import assert from 'node:assert/strict';
import { packRectangles } from '../src/packing.js';
import { LEVEL } from '../src/level.js';

const areas = {
  desktop: { x: 690, y: 80, width: 890, height: 760 },
  mobile: { x: 20, y: 720, width: 660, height: 1080 },
};
const gap = 14;
const roughDogs = [
  [210, 300], [160, 110], [130, 145], [155, 260], [220, 130],
  [165, 225], [195, 175], [135, 120], [135, 185], [170, 140],
  [145, 180], [145, 165], [210, 195], [305, 120],
].map(([width, height], index) => ({ id: `dog-${index + 1}`, width, height }));

function assertPacking(rectangles, area, { requireAll = true } = {}) {
  const packed = packRectangles(rectangles, area, gap);
  if (requireAll) assert.equal(packed.size, rectangles.length, 'Every dog has an initial position');
  const actual = rectangles.filter(rect => packed.has(rect.id)).map(rect => ({ ...rect, ...packed.get(rect.id) }));
  const tolerance = 1e-7;
  for (const rect of actual) {
    assert.ok(Number.isFinite(rect.x) && Number.isFinite(rect.y));
    assert.ok(rect.x >= area.x + gap / 2 - tolerance && rect.y >= area.y + gap / 2 - tolerance,
      `${rect.id} retains the top/left breathing room`);
    assert.ok(rect.x + rect.width <= area.x + area.width - gap / 2 + tolerance
      && rect.y + rect.height <= area.y + area.height - gap / 2 + tolerance,
    `${rect.id} is fully reachable inside the scatter area`);
  }
  for (let i = 0; i < actual.length; i += 1) {
    for (let j = i + 1; j < actual.length; j += 1) {
      const a = actual[i], b = actual[j];
      const separated = a.x + a.width + gap <= b.x + tolerance
        || b.x + b.width + gap <= a.x + tolerance
        || a.y + a.height + gap <= b.y + tolerance
        || b.y + b.height + gap <= a.y + tolerance;
      assert.ok(separated, `${a.id} and ${b.id} do not overlap, including the ${gap}-unit gap`);
    }
  }
  return packed;
}

function orderedVariations(rectangles) {
  // Scatter randomizes input order. Exercise reproducible rotations and both
  // directions so equal-sized dogs cannot accidentally make a layout fail.
  return rectangles.flatMap((_, index) => {
    const rotated = [...rectangles.slice(index), ...rectangles.slice(0, index)];
    return [rotated, [...rotated].reverse()];
  });
}

for (const [name, area] of Object.entries(areas)) {
  test(`all actual dog bounds fit the ${name} scatter area without overlap`, () => {
    const rectangles = LEVEL.pieces.map(piece => ({ id: piece.id, width: piece.bounds.width, height: piece.bounds.height }));
    for (const variation of orderedVariations(rectangles)) assertPacking(variation, area);
  });

  test(`varied full-body dog proportions fit the ${name} scatter area without overlap`, () => {
    for (const variation of orderedVariations(roughDogs)) assertPacking(variation, area);
  });
}

test('packing never rotates a dog to force it into a narrow area', () => {
  const rectangles = [{ id: 'long-dog', width: 160, height: 70 }, { id: 'small-dog', width: 50, height: 50 }];
  const packed = assertPacking(rectangles, { x: 0, y: 0, width: 100, height: 220 }, { requireAll: false });
  assert.equal(packed.has('long-dog'), false);
  assert.equal(packed.has('small-dog'), true);
});

test('packing leaves source dimensions and source order unchanged', () => {
  const rectangles = structuredClone(roughDogs);
  const original = structuredClone(rectangles);
  assertPacking(rectangles, areas.desktop);
  assert.deepEqual(rectangles, original);
});
