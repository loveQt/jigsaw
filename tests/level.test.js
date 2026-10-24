import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/level.js';
import { PuzzleEngine } from '../src/puzzle-engine.js';

// Read the level's actual outlines, rather than trusting their cached bounds.
// The authored/traced paths use line segments and quadratic/cubic curves.
function samplePath(path) {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let cursor = 0, command, point = [0, 0], start = [0, 0];
  const samples = [];
  const number = () => {
    const value = Number(tokens[cursor++]);
    assert.ok(Number.isFinite(value), 'Path contains a finite coordinate');
    return value;
  };
  const readPoint = (relative) => {
    const value = [number(), number()];
    return relative ? [value[0] + point[0], value[1] + point[1]] : value;
  };
  while (cursor < tokens.length) {
    if (/^[a-z]$/i.test(tokens[cursor])) command = tokens[cursor++];
    assert.ok(command, 'Path starts with a command');
    const type = command.toUpperCase();
    const relative = command !== type;
    if (type === 'M' || type === 'L') {
      point = readPoint(relative);
      samples.push(point);
      if (type === 'M') {
        start = point;
        command = relative ? 'l' : 'L';
      }
    } else if (type === 'H' || type === 'V') {
      const axis = type === 'H' ? 0 : 1;
      point = [...point];
      point[axis] = number() + (relative ? point[axis] : 0);
      samples.push(point);
    } else if (type === 'C' || type === 'Q') {
      const from = point;
      const first = readPoint(relative);
      const second = readPoint(relative);
      const end = type === 'C' ? readPoint(relative) : second;
      for (let i = 1; i <= 20; i += 1) {
        const t = i / 20, u = 1 - t;
        samples.push([0, 1].map(axis => type === 'C'
          ? u ** 3 * from[axis] + 3 * u ** 2 * t * first[axis]
            + 3 * u * t ** 2 * second[axis] + t ** 3 * end[axis]
          : u ** 2 * from[axis] + 2 * u * t * first[axis] + t ** 2 * end[axis]));
      }
      point = end;
    } else if (type === 'Z') {
      point = start;
      samples.push(point);
      command = null;
    } else {
      assert.fail(`Unsupported level path command: ${command}`);
    }
  }
  return samples;
}

function makeLevelEngine() {
  return new PuzzleEngine(LEVEL.pieces, {
    puzzleId: LEVEL.id,
    boardOrigin: { x: 45, y: 60 },
    initialPositions: Object.fromEntries(LEVEL.pieces.map((piece, index) => [
      piece.id, { x: 1000 + index * 200, y: 1000 + index * 180 },
    ])),
  });
}

function inside(point, polygon) {
  const [x, y] = point;
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

test('level has a complete set of individually named, uniquely identified pieces', () => {
  assert.ok(typeof LEVEL.id === 'string' && LEVEL.id.length > 0);
  assert.ok(Number.isFinite(LEVEL.width) && LEVEL.width > 0);
  assert.ok(Number.isFinite(LEVEL.height) && LEVEL.height > 0);
  assert.ok(LEVEL.pieces.length >= 8 && LEVEL.pieces.length <= 30,
    `This introductory level should contain 8–30 dogs, got ${LEVEL.pieces.length}`);
  assert.equal(new Set(LEVEL.pieces.map(piece => piece.id)).size, LEVEL.pieces.length);
  for (const piece of LEVEL.pieces) {
    assert.ok(typeof piece.id === 'string' && piece.id.length > 0);
    assert.ok(typeof piece.name === 'string' && piece.name.length > 0, `${piece.id} has an accessible name`);
  }
});

test('actual piece paths are closed, finite and contained by their interaction bounds', () => {
  for (const piece of LEVEL.pieces) {
    assert.match(piece.path, /^\s*M/i, `${piece.id} begins a contour`);
    assert.match(piece.path, /Z\s*$/i, `${piece.id} closes its contour`);
    const points = samplePath(piece.path);
    assert.ok(points.length >= 4, `${piece.id} has a nontrivial contour`);
    const b = piece.bounds;
    for (const value of [b.x, b.y, b.width, b.height, piece.center.x, piece.center.y]) {
      assert.ok(Number.isFinite(value), `${piece.id} has finite metadata`);
    }
    assert.ok(b.width > 5 && b.height > 5, `${piece.id} is large enough to interact with`);
    const tolerance = 0.75;
    for (const [x, y] of points) {
      assert.ok(x >= -tolerance && x <= LEVEL.width + tolerance
        && y >= -tolerance && y <= LEVEL.height + tolerance, `${piece.id} stays in source space`);
      assert.ok(x >= b.x - tolerance && x <= b.x + b.width + tolerance
        && y >= b.y - tolerance && y <= b.y + b.height + tolerance,
      `${piece.id} path fits the bounds used to constrain dragging`);
    }
    assert.ok(piece.center.x >= b.x && piece.center.x <= b.x + b.width
      && piece.center.y >= b.y && piece.center.y <= b.y + b.height,
    `${piece.id} scatter anchor lies within its bounds`);
  }
  const outline = samplePath(LEVEL.outline);
  assert.ok(outline.length >= 4);
  assert.ok(outline.every(([x, y]) => x >= -1 && x <= LEVEL.width + 1 && y >= -1 && y <= LEVEL.height + 1));
});

test('neighbor graph is connected, symmetric and only references existing pieces', () => {
  const pieces = new Map(LEVEL.pieces.map(piece => [piece.id, piece]));
  for (const piece of LEVEL.pieces) {
    assert.ok(Array.isArray(piece.neighbors) && piece.neighbors.length > 0, `${piece.id} can join another dog`);
    assert.equal(new Set(piece.neighbors).size, piece.neighbors.length);
    for (const id of piece.neighbors) {
      assert.notEqual(id, piece.id);
      assert.ok(pieces.has(id), `${piece.id} references an existing neighbor`);
      assert.ok(pieces.get(id).neighbors.includes(piece.id), `${piece.id} ↔ ${id} is symmetric`);
    }
  }
  const visited = new Set([LEVEL.pieces[0].id]);
  const queue = [...visited];
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of pieces.get(queue[index]).neighbors) {
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  }
  assert.equal(visited.size, LEVEL.pieces.length, 'Every dog belongs to the same assemblable puzzle');
});

test('piece shapes cover the assembled silhouette without substantial gaps or overlaps', () => {
  const outline = samplePath(LEVEL.outline);
  const contours = LEVEL.pieces.map(piece => samplePath(piece.path));
  let interior = 0, gaps = 0, overlaps = 0, outside = 0;
  // Offset a regular grid from integer boundaries; this also makes the check
  // reproducible when traced vertices lie exactly on image pixels.
  for (let y = 5.7; y < LEVEL.height; y += 11) {
    for (let x = 2.3; x < LEVEL.width; x += 11) {
      const point = [x, y];
      const inOutline = inside(point, outline);
      const owners = contours.filter(contour => inside(point, contour)).length;
      if (inOutline) {
        interior += 1;
        if (owners === 0) gaps += 1;
        if (owners > 1) overlaps += 1;
      } else if (owners > 0) outside += 1;
    }
  }
  assert.ok(interior > 100, 'The silhouette has meaningful playable area');
  assert.ok(gaps / interior < 0.02, `${gaps}/${interior} sampled interior points have no piece`);
  assert.ok(overlaps / interior < 0.02, `${overlaps}/${interior} sampled interior points have multiple pieces`);
  assert.ok(outside / interior < 0.02, `${outside}/${interior} sampled piece points spill outside the silhouette`);
});

test('actual adjacent dogs join off-board and their whole group moves together', () => {
  const engine = makeLevelEngine();
  const a = LEVEL.pieces[0];
  const b = LEVEL.pieces.find(piece => piece.id === a.neighbors[0]);
  const first = engine.items.get(a.id);
  const second = engine.items.get(b.id);
  engine.moveGroup(b.id, first.x + 8 - second.x, first.y - 4 - second.y);
  assert.deepEqual(engine.drop(a.id), { joined: 1, placed: 0, completed: false });
  assert.equal(engine.getGroup(a.id).length, 2);
  const before = { x: engine.items.get(a.id).x, y: engine.items.get(a.id).y };
  assert.equal(engine.moveGroup(b.id, -100, 50), true);
  for (const item of engine.getGroup(a.id)) {
    assert.equal(item.x, before.x - 100);
    assert.equal(item.y, before.y + 50);
    assert.equal(item.locked, false);
  }
  const restored = makeLevelEngine();
  assert.equal(restored.restore(engine.serialize()), true);
  assert.equal(restored.getGroup(b.id).length, 2);
});

test('the actual level can be completed, restored and restarted', () => {
  const engine = makeLevelEngine();
  for (const piece of LEVEL.pieces) engine.hint(piece.id);
  assert.equal(engine.progress.placed, LEVEL.pieces.length);
  assert.equal(engine.progress.percent, 100);
  assert.equal(engine.completed, true);
  assert.equal(engine.groups.size, 1, 'The final assembly is one connected group');
  for (const item of engine.items.values()) {
    assert.equal(item.x, 45);
    assert.equal(item.y, 60);
    assert.equal(item.locked, true);
  }
  const restored = makeLevelEngine();
  assert.equal(restored.restore(JSON.stringify(engine.serialize())), true);
  assert.equal(restored.completed, true);
  restored.reset();
  assert.equal(restored.progress.placed, 0);
  assert.equal(restored.groups.size, LEVEL.pieces.length);
});
