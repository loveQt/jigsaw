import { CONTOUR_GEOMETRY } from './contour-geometry.js';

/**
 * A little crowd, rather than rows of identical tiles. Thirty relaxed Voronoi
 * cells are cut inside the existing dog silhouette. A seam is authored once,
 * including its gentle bend, and its two owners traverse it in reverse.
 */
const outlinePoints = CONTOUR_GEOMETRY.outlinePoints;
const round = value => Math.round(value * 1e6) / 1e6;
const key = point => point.map(round).join(',');
const cross = (a, b) => a[0] * b[1] - b[0] * a[1];

function measure(points) {
  let twiceArea = 0, cx = 0, cy = 0;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length], weight = cross(a, b);
    twiceArea += weight;
    cx += (a[0] + b[0]) * weight;
    cy += (a[1] + b[1]) * weight;
  });
  const x = Math.floor(Math.min(...points.map(p => p[0])));
  const y = Math.floor(Math.min(...points.map(p => p[1])));
  return {
    area: twiceArea / 2,
    center: { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) },
    bounds: { x, y, width: Math.ceil(Math.max(...points.map(p => p[0]))) - x,
      height: Math.ceil(Math.max(...points.map(p => p[1]))) - y },
  };
}

function clipHalfPlane(polygon, nx, ny, distance) {
  const result = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const da = nx * a[0] + ny * a[1] - distance;
    const db = nx * b[0] + ny * b[1] - distance;
    if (da <= 1e-8) result.push(a);
    if ((da < -1e-8 && db > 1e-8) || (da > 1e-8 && db < -1e-8)) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}

function tessellate(sites) {
  return sites.map((site, index) => {
    let polygon = outlinePoints;
    for (let other = 0; other < sites.length; other += 1) {
      if (other === index) continue;
      const next = sites[other], nx = next[0] - site[0], ny = next[1] - site[1];
      polygon = clipHalfPlane(polygon, nx, ny,
        (next[0] ** 2 + next[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2);
    }
    return polygon;
  });
}

// Deliberately staggered seeds preserve both broad and tall regions. Two mild
// Lloyd steps remove slivers without relaxing the crowd into a regular lattice.
let sites = [
  [71, 94], [174, 151], [294, 126], [418, 150], [530, 92],
  [76, 217], [164, 235], [263, 215], [359, 229], [446, 228], [530, 221],
  [61, 327], [145, 317], [225, 321], [310, 308], [390, 331], [467, 310], [549, 337],
  [71, 418], [151, 417], [234, 410], [318, 410], [399, 421], [474, 385], [495, 449],
  [137, 501], [226, 517], [310, 517], [368, 519], [438, 510],
];
for (let step = 0; step < 2; step += 1) {
  sites = tessellate(sites).map((polygon, index) => {
    const { center } = measure(polygon), old = sites[index];
    return [old[0] * 0.45 + center.x * 0.55, old[1] * 0.45 + center.y * 0.55];
  });
}
const cells = tessellate(sites).map(polygon => polygon.map(point => point.map(round))
  .filter((point, index, points) => key(point) !== key(points[(index + 1) % points.length])));

const edges = new Map();
const references = cells.map((polygon, index) => polygon.map((a, vertex) => {
  const b = polygon[(vertex + 1) % polygon.length];
  const reversed = key(a) > key(b);
  const start = reversed ? b : a, end = reversed ? a : b;
  const id = `${key(start)}:${key(end)}`;
  if (!edges.has(id)) edges.set(id, { id, start, end, owners: [] });
  edges.get(id).owners.push(`p${String(index + 1).padStart(2, '0')}`);
  return { id, reversed };
}));

function cubicPoint(start, segment, t) {
  const u = 1 - t;
  return [0, 1].map(axis => u ** 3 * start[axis]
    + 3 * u ** 2 * t * segment[axis]
    + 3 * u * t ** 2 * segment[axis + 2] + t ** 3 * segment[axis + 4]);
}

let cutIndex = 0;
for (const edge of edges.values()) {
  const [x, y] = edge.start, dx = edge.end[0] - x, dy = edge.end[1] - y;
  edge.boundary = edge.owners.length === 1;
  const style = cutIndex % 5;
  const bend = edge.boundary ? 0 : [0.13, -0.11, 0.16, -0.15, 0.09][style];
  const secondBend = style === 2 || style === 4 ? -bend : bend * 0.72;
  edge.segments = [[
    round(x + dx * 0.32 - dy * bend), round(y + dy * 0.32 + dx * bend),
    round(x + dx * 0.68 - dy * secondBend), round(y + dy * 0.68 + dx * secondBend),
    ...edge.end,
  ]];
  edge.points = [edge.start, ...Array.from({ length: edge.boundary ? 1 : 32 }, (_, i) =>
    cubicPoint(edge.start, edge.segments[0], (i + 1) / (edge.boundary ? 1 : 32)))];
  if (!edge.boundary) cutIndex += 1;
}

function inside(point, polygon) {
  let value = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) value = !value;
  }
  return value;
}

// A centered, checked rectangle gives artwork a safe home. Its perimeter is
// sampled, not just its corners: concave seams must not crop feet or ears.
function safeArtBounds(points, center, bounds) {
  let best;
  for (const ratio of [0.72, 0.9, 1, 1.15, 1.4]) {
    for (const offsetX of [-7, 0, 7]) for (const offsetY of [-7, 0, 7]) {
      const cx = center.x + offsetX, cy = center.y + offsetY;
      let low = 0, high = Math.min(bounds.height, bounds.width / ratio);
      for (let step = 0; step < 12; step += 1) {
        const height = (low + high) / 2, width = height * ratio;
        let fits = true;
        for (let sample = 0; sample <= 12 && fits; sample += 1) {
          const t = sample / 12;
          fits = [[cx - width / 2 + width * t, cy - height / 2],
            [cx - width / 2 + width * t, cy + height / 2],
            [cx - width / 2, cy - height / 2 + height * t],
            [cx + width / 2, cy - height / 2 + height * t]].every(p => inside(p, points));
        }
        if (fits) low = height; else high = height;
      }
      const height = Math.max(0, low - 5), width = height * ratio;
      if (!best || width * height > best.width * best.height) {
        best = { x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height) };
      }
    }
  }
  return best;
}

const pieces = references.map((refs, index) => {
  let path = '', points = [];
  for (const reference of refs) {
    const edge = edges.get(reference.id);
    const samples = reference.reversed ? [...edge.points].reverse() : edge.points;
    if (!path) path = `M ${samples[0].join(' ')}`;
    const segment = edge.segments[0];
    const oriented = reference.reversed
      ? [segment[2], segment[3], segment[0], segment[1], ...edge.start] : segment;
    path += ` C ${oriented.join(' ')}`;
    points.push(...samples.slice(0, -1));
  }
  const measured = measure(points);
  const id = `p${String(index + 1).padStart(2, '0')}`;
  return {
    id, name: `派对小狗 ${index + 1}`, path: `${path} Z`, points, ...measured, edges: refs,
    neighbors: [...new Set(refs.flatMap(ref => edges.get(ref.id).owners).filter(owner => owner !== id))],
    artBounds: safeArtBounds(points, measured.center, measured.bounds),
  };
});

export const PARTY_GEOMETRY = {
  id: 'puppy-party-30-v1', name: '汪汪大派对', width: 600, height: 600,
  outline: CONTOUR_GEOMETRY.outline, outlinePoints,
  edges: [...edges.values()].map(({ points, end, ...edge }) => edge),
  pieces,
};
export default PARTY_GEOMETRY;
