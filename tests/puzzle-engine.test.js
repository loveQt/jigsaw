import test from 'node:test';
import assert from 'node:assert/strict';
import { PuzzleEngine } from '../src/puzzle-engine.js';

const pieces = [
  { id: 'a', neighbors: ['b'] },
  { id: 'b', neighbors: ['a', 'c'] },
  { id: 'c', neighbors: ['b'] },
  { id: 'd', neighbors: [] },
];
const origin = { x: 400, y: 100 };

function makeEngine(positions = {}) {
  return new PuzzleEngine(pieces, {
    boardOrigin: origin,
    threshold: 18,
    initialPositions: {
      a: { x: -200, y: 350 },
      b: { x: 200, y: 500 },
      c: { x: 700, y: 400 },
      d: { x: -100, y: -100 },
      ...positions,
    },
  });
}

test('neighbors form a movable group away from the board', () => {
  const engine = makeEngine({ b: { x: -190, y: 354 } });
  const result = engine.drop('a');
  assert.deepEqual(result, { joined: 1, placed: 0, completed: false });
  assert.deepEqual(engine.getGroup('a').map(item => item.id).sort(), ['a', 'b']);
  assert.equal(engine.items.get('a').x, -190);
  assert.equal(engine.items.get('a').y, 354);
  assert.equal(engine.moveGroup('b', 30, -40), true);
  for (const item of engine.getGroup('a')) {
    assert.equal(item.x, -160);
    assert.equal(item.y, 314);
    assert.equal(item.locked, false);
  }
});

test('unrelated pieces do not join even at exactly the same translation', () => {
  const engine = makeEngine({ d: { x: -200, y: 350 } });
  assert.equal(engine.drop('a').joined, 0);
  assert.equal(engine.getGroup('a').length, 1);
  assert.notEqual(engine.items.get('a').groupId, engine.items.get('d').groupId);
});

test('dropping joins neighbors exposed transitively by the first join', () => {
  const engine = makeEngine({ b: { x: -195, y: 350 }, c: { x: -190, y: 350 } });
  assert.equal(engine.drop('a').joined, 2);
  assert.equal(engine.getGroup('c').length, 3);
  assert.equal(engine.groups.size, 2);
  assert.deepEqual(engine.getGroup('a').map(({ x, y }) => [x, y]), [
    [-195, 350], [-195, 350], [-195, 350],
  ]);
});

test('a chain of nearby translations cannot accumulate snap drift', () => {
  const engine = makeEngine({ b: { x: -185, y: 350 }, c: { x: -166, y: 350 } });
  assert.equal(engine.drop('a').joined, 1);
  assert.equal(engine.getGroup('c').length, 1);
  assert.equal(engine.items.get('a').x, -185);
});

test('partial groups snap to the board and become immovable together', () => {
  const engine = makeEngine({ b: { x: -190, y: 354 } });
  engine.drop('a');
  engine.moveGroup('a', 580, -250);
  assert.deepEqual(engine.drop('b'), { joined: 0, placed: 2, completed: false });
  for (const item of engine.getGroup('a')) {
    assert.equal(item.x, origin.x);
    assert.equal(item.y, origin.y);
    assert.equal(item.locked, true);
  }
  assert.equal(engine.moveGroup('a', 100, 100), false);
  assert.deepEqual(engine.progress, { placed: 2, total: 4, percent: 50, completed: false });
});

test('placing beside a locked neighbor preserves its board alignment', () => {
  const engine = makeEngine({ a: { x: 405, y: 105 }, b: { x: 800, y: 300 } });
  engine.drop('a');
  engine.moveGroup('b', -390, -205);
  const result = engine.drop('b');
  assert.equal(result.placed, 1);
  assert.equal(result.joined, 1);
  assert.equal(engine.getGroup('a').length, 2);
  assert.equal(engine.items.get('a').x, origin.x);
  assert.equal(engine.items.get('b').x, origin.x);
});

test('arbitrary free placement stays where released beyond snapping distance', () => {
  const engine = makeEngine();
  engine.moveGroup('a', -500, 123.5);
  assert.deepEqual(engine.drop('a'), { joined: 0, placed: 0, completed: false });
  assert.equal(engine.items.get('a').x, -700);
  assert.equal(engine.items.get('a').y, 473.5);
  assert.equal(engine.moveGroup('a', Infinity, 0), false);
  assert.equal(engine.items.get('a').x, -700);
});

test('snap threshold uses Euclidean distance', () => {
  const engine = makeEngine({ a: { x: origin.x + 13, y: origin.y + 13 } });
  assert.equal(engine.drop('a').placed, 0);
  engine.moveGroup('a', -1, -1);
  assert.equal(engine.drop('a').placed, 1);
});

test('save and restore preserve off-board groups, positions and progress', () => {
  const engine = makeEngine({ b: { x: -190, y: 354 } });
  engine.drop('a');
  engine.moveGroup('a', 22.5, 11.25);
  engine.hint('d');
  const json = JSON.stringify(engine.serialize());
  const restored = makeEngine();
  assert.equal(restored.restore(json), true);
  assert.deepEqual(restored.serialize(), engine.serialize());
  assert.deepEqual(restored.progress, engine.progress);
  assert.equal(restored.getGroup('b').length, 2);
  assert.equal(restored.moveGroup('b', 5, 5), true);
  assert.equal(restored.items.get('a').x, engine.items.get('a').x + 5);
});

test('invalid restores are atomic and reject corrupt or incompatible groups', () => {
  const engine = makeEngine();
  const initial = engine.serialize();
  const cases = [
    null,
    '{invalid JSON',
    { ...initial, version: 99 },
    { ...initial, signature: 'another level' },
    { ...initial, items: initial.items.slice(1) },
  ];
  const change = (index, changes) => {
    const snapshot = structuredClone(initial);
    Object.assign(snapshot.items[index], changes);
    return snapshot;
  };
  cases.push(change(0, { x: NaN }));
  cases.push(change(0, { locked: true }));
  cases.push(change(0, { id: 'b' }));
  cases.push(change(0, { groupId: 'missing' }));
  cases.push(change(0, { groupId: 'b' })); // Different group translations.
  cases.push(change(3, { groupId: 'a', x: -200, y: 350 })); // Non-neighbors.
  for (const snapshot of cases) {
    assert.equal(engine.restore(snapshot), false);
    assert.deepEqual(engine.serialize(), initial);
  }
});

test('hints complete a puzzle and reset restores the original scatter', () => {
  const engine = makeEngine({ b: { x: -190, y: 354 } });
  const original = engine.serialize();
  engine.drop('a');
  assert.equal(engine.hint().placed, 2); // Largest loose group first.
  engine.hint('c');
  assert.deepEqual(engine.hint('d'), { joined: 0, placed: 1, completed: true });
  assert.equal(engine.completed, true);
  assert.deepEqual(engine.hint(), { joined: 0, placed: 0, completed: true });
  assert.deepEqual(engine.reset(), { placed: 0, total: 4, percent: 0, completed: false });
  assert.deepEqual(engine.serialize(), original);
});

test('restart can remember a new scatter without retaining group membership', () => {
  const engine = makeEngine();
  engine.hint('a');
  engine.reset({ a: { x: 12, y: 34 } });
  assert.equal(engine.items.get('a').x, 12);
  assert.equal(engine.items.get('a').locked, false);
  engine.moveGroup('a', 5, 5);
  engine.reset();
  assert.equal(engine.items.get('a').x, 12);
});

test('metadata normalizes one-sided adjacency and rejects invalid identities', () => {
  const engine = new PuzzleEngine([
    { id: 1, neighbors: [2] }, { id: 2, neighbors: [] },
  ], { boardOrigin: { x: 500, y: 500 } });
  assert.equal(engine.drop(2).joined, 1);
  assert.equal(engine.getGroup(1).length, 2);
  assert.throws(() => new PuzzleEngine([{ id: 'a', neighbors: ['unknown'] }]), TypeError);
  assert.throws(() => new PuzzleEngine([{ id: 'a' }, { id: 'a' }]), TypeError);
  assert.throws(() => new PuzzleEngine([], {}), TypeError);
});
