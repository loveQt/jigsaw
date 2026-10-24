/**
 * Level 02 is authored from the outside in. The silhouette and a planar network
 * of cut lines are the source of truth; illustrations never define geometry.
 * Every cubic edge is stored once, then traversed in opposite directions by its
 * two owners. Changing an edge therefore cannot introduce a seam or overlap.
 */
const vertices = [
  [[55, 190], [210, 115], [390, 115], [545, 190]],
  [[40, 240], [210, 240], [390, 240], [560, 240]],
  [[50, 395], [220, 395], [380, 395], [550, 395]],
  [[115, 525], [230, 550], [370, 550], [485, 525]],
];

const edgeMap = new Map();
function edge(id, start, segments, boundary = false) {
  edgeMap.set(id, { id, start, segments, boundary });
}

// First, a large dog head with two upright ears, broad cheeks and a round jaw.
// Its top corner cells read as side profiles; its crown is a rounded dog head.
edge('h0-0', vertices[0][0], [[48, 142, 45, 75, 59, 42], [68, 22, 91, 44, 112, 63], [145, 88, 171, 108, 210, 115]], true);
edge('h0-1', vertices[0][1], [[260, 80, 340, 80, 390, 115]], true);
edge('h0-2', vertices[0][2], [[429, 108, 455, 88, 488, 63], [509, 44, 532, 22, 541, 42], [555, 75, 552, 142, 545, 190]], true);
edge('v0-0', vertices[0][0], [[48, 205, 42, 222, 40, 240]], true);
edge('v1-0', vertices[1][0], [[17, 307, 18, 370, 50, 395]], true);
edge('v2-0', vertices[2][0], [[55, 455, 76, 502, 115, 525]], true);
edge('v0-3', vertices[0][3], [[552, 205, 558, 222, 560, 240]], true);
edge('v1-3', vertices[1][3], [[583, 307, 582, 370, 550, 395]], true);
edge('v2-3', vertices[2][3], [[545, 455, 524, 502, 485, 525]], true);
edge('h3-0', vertices[3][0], [[145, 546, 186, 550, 230, 550]], true);
edge('h3-1', vertices[3][1], [[276, 568, 324, 568, 370, 550]], true);
edge('h3-2', vertices[3][2], [[414, 550, 455, 546, 485, 525]], true);

// Then six broad chin cuts. The upper dog's rounded jaw becomes the generous
// ear notch of the dog beneath. There are no small knobs or decorative waves.
edge('h1-0', vertices[1][0], [[75, 260, 87, 285, 130, 282], [167, 279, 194, 262, 210, 240]]);
edge('h1-1', vertices[1][1], [[240, 256, 257, 280, 300, 281], [343, 280, 360, 256, 390, 240]]);
edge('h1-2', vertices[1][2], [[406, 262, 433, 279, 470, 282], [513, 285, 525, 260, 560, 240]]);
edge('h2-0', vertices[2][0], [[79, 415, 100, 438, 135, 438], [170, 438, 201, 417, 220, 395]]);
edge('h2-1', vertices[2][1], [[246, 414, 265, 438, 300, 438], [335, 438, 354, 414, 380, 395]]);
edge('h2-2', vertices[2][2], [[399, 417, 430, 438, 465, 438], [500, 438, 521, 415, 550, 395]]);

// Side seams describe a cheek or one modest profile muzzle. Their low curve
// count keeps all nine pieces broad enough for an undistorted dog illustration.
edge('v0-1', vertices[0][1], [[194, 155, 197, 209, 210, 240]]);
edge('v0-2', vertices[0][2], [[406, 155, 403, 209, 390, 240]]);
edge('v1-1', vertices[1][1], [[202, 285, 235, 332, 220, 395]]);
edge('v1-2', vertices[1][2], [[398, 285, 365, 332, 380, 395]]);
edge('v2-1', vertices[2][1], [[207, 445, 220, 515, 230, 550]]);
edge('v2-2', vertices[2][2], [[393, 445, 380, 515, 370, 550]]);

const ref = (id, reversed = false) => ({ id, reversed });
function orientedEdge(reference) {
  const source = edgeMap.get(reference.id);
  if (!reference.reversed) return { start: source.start, segments: source.segments };
  const starts = [source.start, ...source.segments.slice(0, -1).map(segment => segment.slice(4))];
  return {
    start: source.segments.at(-1).slice(4),
    segments: source.segments.map((segment, index) => [
      segment[2], segment[3], segment[0], segment[1], ...starts[index],
    ]).reverse(),
  };
}

function cubicPoint(start, segment, t) {
  const u = 1 - t;
  return [0, 1].map(axis => u ** 3 * start[axis]
    + 3 * u ** 2 * t * segment[axis]
    + 3 * u * t ** 2 * segment[axis + 2]
    + t ** 3 * segment[axis + 4]);
}

// Reusing canonical samples in reverse also makes the diagnostic polygons
// watertight; sampling each direction separately can introduce round-off gaps.
const edgeSamples = new Map([...edgeMap].map(([id, source]) => {
  const points = [source.start];
  let start = source.start;
  for (const segment of source.segments) {
    for (let step = 1; step <= 64; step += 1) points.push(cubicPoint(start, segment, step / 64));
    start = segment.slice(4);
  }
  return [id, points];
}));

function contour(references) {
  const first = orientedEdge(references[0]);
  let path = `M ${first.start.join(' ')}`;
  const points = [];
  for (const reference of references) {
    const current = orientedEdge(reference);
    for (const segment of current.segments) path += ` C ${segment.join(' ')}`;
    const samples = edgeSamples.get(reference.id);
    points.push(...(reference.reversed ? [...samples].reverse() : samples).slice(0, -1));
  }
  return { path: `${path} Z`, points };
}

function measured(points) {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  // Outward rounding includes extrema that fall between sampling steps.
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  const bounds = { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y };
  let twiceArea = 0, cx = 0, cy = 0;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  });
  return { bounds, center: { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) }, area: twiceArea / 2 };
}

const names = ['侧脸德牧', '微笑金毛', '侧脸柴柴', '垂耳可卡', '开心柯基', '斑点小狗', '歪头小狗', '奶油比熊', '歪头边牧'];
const pieces = [];
for (let row = 0; row < 3; row += 1) {
  for (let column = 0; column < 3; column += 1) {
    const index = row * 3 + column;
    const edges = [ref(`h${row}-${column}`), ref(`v${row}-${column + 1}`), ref(`h${row + 1}-${column}`, true), ref(`v${row}-${column}`, true)];
    const shape = contour(edges);
    pieces.push({
      id: `s${String(index + 1).padStart(2, '0')}`,
      name: names[index], row, column, edges,
      ...shape, ...measured(shape.points), neighbors: [],
    });
  }
}
const owners = new Map([...edgeMap.keys()].map(id => [id, []]));
for (const piece of pieces) for (const reference of piece.edges) owners.get(reference.id).push(piece.id);
for (const piece of pieces) piece.neighbors = piece.edges.flatMap(reference => owners.get(reference.id)).filter(id => id !== piece.id);

const outlineEdges = [
  ...[0, 1, 2].map(column => ref(`h0-${column}`)),
  ...[0, 1, 2].map(row => ref(`v${row}-3`)),
  ...[2, 1, 0].map(column => ref(`h3-${column}`, true)),
  ...[2, 1, 0].map(row => ref(`v${row}-0`, true)),
];
const outer = contour(outlineEdges);
export const CONTOUR_GEOMETRY = {
  id: 'puppy-contours-v2', name: '九只小狗的好心情', width: 600, height: 600,
  outline: outer.path, outlinePoints: outer.points, outlineEdges,
  edges: [...edgeMap.values()].map(source => ({ ...source, owners: owners.get(source.id) })),
  pieces,
};
export default CONTOUR_GEOMETRY;
