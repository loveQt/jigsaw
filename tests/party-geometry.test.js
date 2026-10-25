import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY_GEOMETRY as geometry } from '../src/party-geometry.js';
import { CONTOUR_GEOMETRY } from '../src/contour-geometry.js';
import { packRectangles } from '../src/packing.js';

function inside([x, y], points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

function area(points) {
  return points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
}

// Read the actual browser paths as well as the diagnostics. Boundary fragments
// are straight approximations of the original densely sampled outer cubics.
function sampleSvg(path) {
  const tokens = path.match(/[MCZ]|-?\d+(?:\.\d+)?/g);
  assert.equal(tokens.shift(), 'M');
  let start = [Number(tokens.shift()), Number(tokens.shift())];
  const points = [start];
  while (tokens[0] === 'C') {
    tokens.shift();
    const s = tokens.splice(0, 6).map(Number);
    const dx = s[4] - start[0], dy = s[5] - start[1];
    const straight = Math.abs(dx * (s[1] - start[1]) - dy * (s[0] - start[0])) < 0.0001
      && Math.abs(dx * (s[3] - start[1]) - dy * (s[2] - start[0])) < 0.0001;
    const steps = straight ? 1 : 32;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps, u = 1 - t;
      points.push([0, 1].map(axis => u ** 3 * start[axis]
        + 3 * u ** 2 * t * s[axis] + 3 * u * t ** 2 * s[axis + 2] + t ** 3 * s[axis + 4]));
    }
    start = s.slice(4);
  }
  assert.deepEqual(tokens, ['Z']);
  assert.deepEqual(start, points[0], 'Each path closes without an implicit extra edge');
  return points;
}
const pieces = geometry.pieces.map(piece => ({ ...piece, polygon: sampleSvg(piece.path) }));
const edges = new Map(geometry.edges.map(edge => [edge.id, edge]));

test('third level has thirty broad, varied pieces inside the second-level silhouette', () => {
  assert.equal(pieces.length, 30);
  assert.equal(new Set(pieces.map(piece => piece.id)).size, 30);
  assert.equal(geometry.outline, CONTOUR_GEOMETRY.outline);
  assert.ok(new Set(pieces.map(piece => piece.neighbors.length)).size >= 5, 'Adjacency is not a repeated rectangular grid');
  for (const piece of pieces) {
    assert.ok(piece.area > 5000, `${piece.id} is a useful region rather than a sliver`);
    assert.ok(Math.max(piece.bounds.width, piece.bounds.height) / Math.min(piece.bounds.width, piece.bounds.height) < 1.8);
    assert.ok(inside([piece.center.x, piece.center.y], piece.polygon));
    assert.ok(Math.abs(area(piece.polygon) - piece.area) < 0.001, 'Metadata describes the rendered path');
    const b = piece.artBounds;
    assert.ok(b.width >= 40 && b.height >= 40, `${piece.id} has room for a whole character`);
    for (let row = 0; row <= 12; row += 1) for (let col = 0; col <= 12; col += 1) {
      assert.ok(inside([b.x + b.width * col / 12, b.y + b.height * row / 12], piece.polygon),
        `${piece.id} keeps its art rectangle inside its cut line`);
    }
  }
});

test('every internal curve has exactly two owners with opposite traversal', () => {
  const refs = new Map(geometry.edges.map(edge => [edge.id, []]));
  for (const piece of pieces) {
    piece.edges.forEach((reference, index) => {
      refs.get(reference.id).push({ id: piece.id, reversed: reference.reversed });
      const edge = edges.get(reference.id);
      const nextRef = piece.edges[(index + 1) % piece.edges.length], next = edges.get(nextRef.id);
      const end = reference.reversed ? edge.start : edge.segments.at(-1).slice(4);
      const start = nextRef.reversed ? next.segments.at(-1).slice(4) : next.start;
      assert.deepEqual(end, start, `${piece.id} joins its curves at one canonical vertex`);
    });
  }
  for (const edge of geometry.edges) {
    const owners = refs.get(edge.id);
    assert.equal(owners.length, edge.boundary ? 1 : 2);
    assert.deepEqual(owners.map(owner => owner.id).sort(), [...edge.owners].sort());
    if (!edge.boundary) assert.notEqual(owners[0].reversed, owners[1].reversed);
  }
  const visited = new Set([pieces[0].id]), queue = [pieces[0].id];
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of pieces.find(piece => piece.id === queue[index]).neighbors) {
      if (!visited.has(id)) { visited.add(id); queue.push(id); }
    }
  }
  assert.equal(visited.size, 30, 'Every piece can join the completed dog');
});

test('all thirty rendered paths cover the silhouette once without internal gaps or overlap', () => {
  let covered = 0;
  for (let y = 1.273; y < 600; y += 3.71) for (let x = 2.139; x < 600; x += 3.93) {
    const expected = Number(inside([x, y], geometry.outlinePoints));
    const owners = pieces.filter(piece => {
      const b = piece.bounds;
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
        && inside([x, y], piece.polygon);
    });
    assert.equal(owners.length, expected, `(${x.toFixed(3)}, ${y.toFixed(3)}): ${owners.map(p => p.id)}`);
    covered += expected;
  }
  assert.ok(covered > 14000);
  assert.ok(Math.abs(pieces.reduce((sum, piece) => sum + area(piece.polygon), 0)
    - area(geometry.outlinePoints)) < 0.01, 'The tile areas sum to the unchanged silhouette');
});

test('thirty unscaled pieces fit desktop and mobile trays without overlap', () => {
  const rectangles = pieces.map(piece => ({ id: piece.id, ...piece.bounds }));
  for (const tray of [
    { x: 690, y: 80, width: 890, height: 760 },
    { x: 20, y: 720, width: 660, height: 1080 },
  ]) {
    const positions = packRectangles(rectangles, tray);
    assert.equal(positions.size, 30);
    const placed = rectangles.map(rect => ({ ...rect, ...positions.get(rect.id) }));
    for (const a of placed) {
      assert.ok(a.x >= tray.x && a.y >= tray.y && a.x + a.width <= tray.x + tray.width
        && a.y + a.height <= tray.y + tray.height);
      for (const b of placed) {
        if (a === b) continue;
        assert.ok(a.x + a.width + 14 <= b.x || b.x + b.width + 14 <= a.x
          || a.y + a.height + 14 <= b.y || b.y + b.height + 14 <= a.y);
      }
    }
  }
});
