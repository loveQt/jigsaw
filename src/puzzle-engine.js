const STATE_VERSION = 1;
const EPSILON = 1e-7;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Translation-only puzzle model. Every item's x/y is added to its source path.
 * Neighboring pieces fit whenever their translations are equal, wherever they
 * are on the table. A group is always connected and shares one translation.
 */
export class PuzzleEngine {
  constructor(pieces, options = {}) {
    if (!Array.isArray(pieces) || pieces.length === 0) {
      throw new TypeError('A puzzle needs at least one piece.');
    }
    this.boardOrigin = { ...(options.boardOrigin ?? { x: 0, y: 0 }) };
    this.threshold = options.threshold ?? 18;
    if (!finitePoint(this.boardOrigin) || !Number.isFinite(this.threshold) || this.threshold < 0) {
      throw new TypeError('Board origin and snap threshold must be finite.');
    }

    this.pieces = new Map();
    this.neighbors = new Map();
    for (const piece of pieces) {
      if (piece.id === undefined || piece.id === null || String(piece.id).length === 0) {
        throw new TypeError('Every piece needs an id.');
      }
      const id = String(piece.id);
      if (this.pieces.has(id)) throw new TypeError(`Duplicate piece id: ${id}`);
      this.pieces.set(id, { ...piece, id });
      this.neighbors.set(id, new Set());
    }
    for (const piece of pieces) {
      const id = String(piece.id);
      for (const rawNeighbor of piece.neighbors ?? []) {
        const neighbor = String(rawNeighbor);
        if (!this.pieces.has(neighbor) || neighbor === id) {
          throw new TypeError(`Invalid neighbor ${neighbor} for ${id}.`);
        }
        // Shared boundaries are undirected, even if metadata lists one side.
        this.neighbors.get(id).add(neighbor);
        this.neighbors.get(neighbor).add(id);
      }
    }

    this.signature = JSON.stringify([
      options.puzzleId ?? null,
      [...this.pieces.keys()].sort().map(id => [id, [...this.neighbors.get(id)].sort()]),
    ]);
    this.items = new Map();
    this.groups = new Map();
    this.initialPositions = this._readPositions(options.initialPositions);
    this.reset();
  }

  _readPositions(positions) {
    const result = new Map();
    for (const id of this.pieces.keys()) {
      const point = positions instanceof Map ? positions.get(id) : positions?.[id];
      if (point !== undefined && !finitePoint(point)) {
        throw new TypeError(`Initial position for ${id} must be finite.`);
      }
      result.set(id, point ? { x: point.x, y: point.y } : { x: 0, y: 0 });
    }
    return result;
  }

  getGroup(id) {
    const item = this.items.get(String(id));
    if (!item) return [];
    return [...this.groups.get(item.groupId)].map(memberId => this.items.get(memberId));
  }

  get progress() {
    const total = this.items.size;
    const placed = [...this.items.values()].filter(item => item.locked).length;
    return { placed, total, percent: (placed / total) * 100, completed: placed === total };
  }

  get completed() {
    return this.progress.completed;
  }

  /** Move the entire free group by a delta. Locked groups cannot be moved. */
  moveGroup(id, dx, dy) {
    const group = this.getGroup(id);
    if (!group.length || group[0].locked || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const x = group[0].x + dx;
    const y = group[0].y + dy;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    for (const item of group) Object.assign(item, { x, y });
    return true;
  }

  _positionGroup(groupId, position, locked = false) {
    for (const id of this.groups.get(groupId)) {
      Object.assign(this.items.get(id), { x: position.x, y: position.y, locked });
    }
  }

  _adjacentGroups(groupId) {
    const adjacent = new Set();
    for (const id of this.groups.get(groupId)) {
      for (const neighborId of this.neighbors.get(id)) {
        const neighborGroup = this.items.get(neighborId).groupId;
        if (neighborGroup !== groupId) adjacent.add(neighborGroup);
      }
    }
    return [...adjacent];
  }

  _groupAnchor(groupId) {
    return this.items.get(this.groups.get(groupId).values().next().value);
  }

  _mergeInto(groupId, otherGroupId, position, locked) {
    const members = this.groups.get(groupId);
    for (const id of this.groups.get(otherGroupId)) {
      this.items.get(id).groupId = groupId;
      members.add(id);
    }
    this.groups.delete(otherGroupId);
    this._positionGroup(groupId, position, locked);
  }

  /**
   * Snap on release. joined counts other groups absorbed; placed counts newly
   * locked pieces. Snapping works off-board, including transitive connections.
   */
  drop(id) {
    const item = this.items.get(String(id));
    const before = this.progress.placed;
    let joined = 0;
    if (!item || item.locked) return { joined, placed: 0, completed: this.completed };

    const groupId = item.groupId;
    if (distance(item, this.boardOrigin) <= this.threshold) {
      this._positionGroup(groupId, this.boardOrigin, true);
    } else {
      // The nearest adjacent group determines the first anchor. Once chosen,
      // preserve it for the remaining joins so a chain cannot drift sideways.
      const candidates = this._adjacentGroups(groupId)
        .map(otherId => ({ id: otherId, anchor: this._groupAnchor(otherId) }))
        .filter(candidate => distance(item, candidate.anchor) <= this.threshold)
        .sort((a, b) => Number(b.anchor.locked) - Number(a.anchor.locked)
          || distance(item, a.anchor) - distance(item, b.anchor)
          || a.id.localeCompare(b.id));
      if (candidates.length) {
        const target = candidates[0];
        this._mergeInto(groupId, target.id, target.anchor, target.anchor.locked);
        joined += 1;
      }
    }

    // New joins may expose additional neighboring groups. Absorb all groups
    // aligned with the anchor, including already placed board neighbors.
    let changed = true;
    while (changed) {
      changed = false;
      const anchor = this._groupAnchor(groupId);
      for (const otherId of this._adjacentGroups(groupId)) {
        const other = this._groupAnchor(otherId);
        if (distance(anchor, other) > this.threshold) continue;
        // Locked pieces are always the fixed anchor when a group joins them.
        const position = other.locked ? this.boardOrigin : { x: anchor.x, y: anchor.y };
        this._mergeInto(groupId, otherId, position, anchor.locked || other.locked);
        joined += 1;
        changed = true;
      }
    }

    // An off-board neighbor can itself be within board snapping distance.
    const anchor = this._groupAnchor(groupId);
    if (!anchor.locked && distance(anchor, this.boardOrigin) <= this.threshold) {
      this._positionGroup(groupId, this.boardOrigin, true);
    }
    const progress = this.progress;
    return { joined, placed: progress.placed - before, completed: progress.completed };
  }

  /** Place a selected loose group, or the largest loose group, as one hint. */
  hint(id) {
    const selected = id === undefined
      ? [...this.groups.keys()]
        .filter(groupId => !this._groupAnchor(groupId).locked)
        .sort((a, b) => this.groups.get(b).size - this.groups.get(a).size)[0]
      : this.items.get(String(id))?.groupId;
    if (selected === undefined) return { joined: 0, placed: 0, completed: this.completed };
    const item = this._groupAnchor(selected);
    this.moveGroup(item.id, this.boardOrigin.x - item.x, this.boardOrigin.y - item.y);
    return this.drop(item.id);
  }

  serialize() {
    return {
      version: STATE_VERSION,
      signature: this.signature,
      items: [...this.items.values()].map(item => ({ ...item })),
    };
  }

  /** Atomically restore a compatible snapshot. Invalid input leaves play intact. */
  restore(snapshot) {
    try {
      const state = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
      if (!state || state.version !== STATE_VERSION || state.signature !== this.signature
        || !Array.isArray(state.items) || state.items.length !== this.pieces.size) return false;
      const items = new Map();
      const groups = new Map();
      for (const saved of state.items) {
        if (!saved || typeof saved.id !== 'string' || !this.pieces.has(saved.id) || items.has(saved.id)
          || typeof saved.groupId !== 'string' || !this.pieces.has(saved.groupId)
          || !finitePoint(saved) || typeof saved.locked !== 'boolean') return false;
        if (saved.locked && distance(saved, this.boardOrigin) > EPSILON) return false;
        const item = { id: saved.id, groupId: saved.groupId, x: saved.x, y: saved.y, locked: saved.locked };
        items.set(item.id, item);
        if (!groups.has(item.groupId)) groups.set(item.groupId, new Set());
        groups.get(item.groupId).add(item.id);
      }
      for (const [groupId, members] of groups) {
        if (!members.has(groupId)) return false;
        const anchor = items.get(groupId);
        for (const id of members) {
          const item = items.get(id);
          if (item.locked !== anchor.locked || distance(item, anchor) > EPSILON) return false;
        }
        const visited = new Set([groupId]);
        const queue = [groupId];
        for (let index = 0; index < queue.length; index += 1) {
          for (const neighbor of this.neighbors.get(queue[index])) {
            if (members.has(neighbor) && !visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        if (visited.size !== members.size) return false;
        // Normalize floating point round-off back to exact group alignment.
        for (const id of members) Object.assign(items.get(id), { x: anchor.x, y: anchor.y });
      }
      this.items = items;
      this.groups = groups;
      return true;
    } catch {
      return false;
    }
  }

  /** Restart from the original scatter, optionally remembering a new scatter. */
  reset(initialPositions) {
    if (initialPositions !== undefined) this.initialPositions = this._readPositions(initialPositions);
    this.items.clear();
    this.groups.clear();
    for (const id of this.pieces.keys()) {
      const position = this.initialPositions.get(id);
      this.items.set(id, { id, groupId: id, x: position.x, y: position.y, locked: false });
      this.groups.set(id, new Set([id]));
    }
    return this.progress;
  }
}

export default PuzzleEngine;
