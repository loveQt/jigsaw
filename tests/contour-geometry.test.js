import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTOUR_GEOMETRY as geometry } from '../src/contour-geometry.js';
import { packRectangles } from '../src/packing.js';

// Read the exported SVG itself: coverage must describe the paths the browser
// paints, rather than merely agreeing with an unrelated metadata polygon.
function sampleSvg(path) {
  const tokens = path.match(/[MCZ]|-?\d+(?:\.\d+)?/g);
  assert.equal(tokens.shift(), 'M');
  let point = [Number(tokens.shift()), Number(tokens.shift())];
  const points = [point];
  while (tokens[0] === 'C') {
    tokens.shift();
    const values = tokens.splice(0, 6).map(Number);
    for (let step = 1; step <= 64; step += 1) {
      const t = step / 64, u = 1 - t;
      points.push([0, 1].map(axis => u ** 3 * point[axis]
        + 3 * u ** 2 * t * values[axis]
        + 3 * u * t ** 2 * values[axis + 2]
        + t ** 3 * values[axis + 4]));
    }
    point = values.slice(4);
  }
  assert.deepEqual(tokens, ['Z']);
  assert.deepEqual(point, points[0], 'The final cubic returns exactly to the initial vertex');
  return points;
}

function inside([x, y], polygon) {
  let result = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

function signedArea(points) {
  return points.reduce((sum, a, index) => {
    const b = points[(index + 1) % points.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
}

const pieces = geometry.pieces.map(piece => ({ ...piece, polygon: sampleSvg(piece.path) }));
const outer = sampleSvg(geometry.outline);
const edges = new Map(geometry.edges.map(edge => [edge.id, edge]));

function endpoints(reference) {
  const edge = edges.get(reference.id);
  const points = [edge.start, edge.segments.at(-1).slice(4)];
  return reference.reversed ? points.reverse() : points;
}

test('the outline is a closed boundary authored separately from the nine cells', () => {
  assert.equal(pieces.length, 9);
  assert.equal(new Set(pieces.map(piece => piece.id)).size, 9);
  assert.equal(geometry.outlineEdges.length, geometry.edges.filter(edge => edge.boundary).length);
  for (const reference of geometry.outlineEdges) assert.equal(edges.get(reference.id).boundary, true);
  assert.ok(signedArea(outer) > 190000);
  for (const piece of pieces) {
    assert.ok(signedArea(piece.polygon) > 10000, `${piece.id} has usable area, rather than a sliver`);
    assert.ok(Math.max(piece.bounds.width, piece.bounds.height) / Math.min(piece.bounds.width, piece.bounds.height) < 1.65, `${piece.id} is broad enough for a natural dog head`);
    assert.ok((piece.path.match(/C/g) ?? []).length <= 8, `${piece.id} avoids small decorative contour waves`);
    assert.ok(inside([piece.center.x, piece.center.y], piece.polygon), `${piece.id} anchor is inside its own tile`);
    for (const [x, y] of piece.polygon) {
      assert.ok(x >= piece.bounds.x && x <= piece.bounds.x + piece.bounds.width);
      assert.ok(y >= piece.bounds.y && y <= piece.bounds.y + piece.bounds.height);
    }
  }
});

test('all cut lines are owned twice with exactly opposite traversal', () => {
  const references = new Map(geometry.edges.map(edge => [edge.id, []]));
  for (const piece of pieces) {
    piece.edges.forEach((reference, index) => {
      references.get(reference.id).push({ owner: piece.id, reversed: reference.reversed });
      const [, end] = endpoints(reference);
      const [nextStart] = endpoints(piece.edges[(index + 1) % piece.edges.length]);
      assert.deepEqual(end, nextStart, `${piece.id} has no implicit closing lines between curves`);
    });
  }
  for (const edge of geometry.edges) {
    const owners = references.get(edge.id);
    assert.equal(owners.length, edge.boundary ? 1 : 2, `${edge.id} has the expected number of owners`);
    assert.deepEqual(owners.map(owner => owner.owner).sort(), [...edge.owners].sort());
    if (!edge.boundary) {
      assert.notEqual(owners[0].reversed, owners[1].reversed, `${edge.id} reverses the same curve`);
      for (const owner of owners) {
        const other = owners.find(candidate => candidate !== owner).owner;
        assert.ok(pieces.find(piece => piece.id === owner.owner).neighbors.includes(other));
      }
    }
  }
});

test('SVG pieces cover every sampled silhouette point exactly once, with no spill', () => {
  let covered = 0;
  // A dense, offset grid exercises all concavities and junctions. Unlike the
  // legacy traced-image tolerance, the geometry-first partition allows no gaps.
  for (let y = 1.273; y < 600; y += 4.71) {
    for (let x = 2.139; x < 600; x += 4.93) {
      const expected = Number(inside([x, y], outer));
      const owners = pieces.filter(piece => {
        const b = piece.bounds;
        return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
          && inside([x, y], piece.polygon);
      });
      assert.equal(owners.length, expected,
        `(${x.toFixed(3)}, ${y.toFixed(3)}) expected ${expected} owner, got ${owners.map(piece => piece.id)}`);
      covered += expected;
    }
  }
  assert.ok(covered > 8000);
  const sum = pieces.reduce((total, piece) => total + signedArea(piece.polygon), 0);
  assert.ok(Math.abs(sum - signedArea(outer)) < 1e-6, 'The tile areas sum to the silhouette area');
});

test('all nine new tiles fit both scatter layouts without changing shape or scale', () => {
  const rectangles = pieces.map(piece => ({ id: piece.id, ...piece.bounds }));
  for (const area of [
    { x: 690, y: 80, width: 890, height: 760 },
    { x: 20, y: 720, width: 660, height: 1080 },
  ]) {
    const positions = packRectangles(rectangles, area);
    assert.equal(positions.size, pieces.length);
    const placed = rectangles.map(rectangle => ({ ...rectangle, ...positions.get(rectangle.id) }));
    for (const a of placed) {
      assert.ok(a.x >= area.x && a.y >= area.y);
      assert.ok(a.x + a.width <= area.x + area.width && a.y + a.height <= area.y + area.height);
      for (const b of placed) {
        if (a === b) continue;
        assert.ok(a.x + a.width + 14 <= b.x || b.x + b.width + 14 <= a.x
          || a.y + a.height + 14 <= b.y || b.y + b.height + 14 <= a.y,
        `${a.id} and ${b.id} retain breathing room`);
      }
    }
  }
});
