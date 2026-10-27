import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAZE_DATA as maze,MAZE_CONFIG,HEART_POINTS,createMazeGeometry,tileRectangle,pointInPolygon} from '../src/maze-geometry.js';
import {mazePreview} from '../src/maze-art.js';
import {PuzzleEngine} from '../src/puzzle-engine.js';

// Parse the actual SVG rather than trusting the generator's cached points.
function polygon(piece) {
  assert.match(piece.path,/^M(?:[\d .L]+) Z$/);
  const values=piece.path.match(/\d+(?:\.\d+)?/g).map(Number);
  return Array.from({length:values.length/2},(_,i)=>values.slice(i*2,i*2+2));
}
const polygons=maze.pieces.map(polygon);
const key=(x,y)=>`${x},${y}`;
const neighbors=id=>{const [x,y]=id.split(',').map(Number);return [key(x+1,y),key(x-1,y),key(x,y+1),key(x,y-1)];};
function flood(start,adjacent) {
  const visited=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++) for(const next of adjacent(queue[i])) if(!visited.has(next)) {visited.add(next);queue.push(next);}
  return visited;
}
function engine() {
  return new PuzzleEngine(maze.pieces,{puzzleId:maze.id,boardOrigin:{x:45,y:60},threshold:12,
    initialPositions:Object.fromEntries(maze.pieces.map((p,i)=>[p.id,{x:1000+i*300,y:1000+i*250}]))});
}

test('maze is deterministic and has a connected, acyclic passage graph',()=>{
  assert.deepEqual(createMazeGeometry(),maze);
  assert.equal(maze.pieces.length,24);
  assert.equal(maze.rooms.length,224);
  const rooms=new Set(maze.rooms);
  assert.equal(flood(maze.start,id=>maze.passages[id]).size,rooms.size);
  let edges=0;
  for(const [id,nexts] of Object.entries(maze.passages)) {
    for(const next of nexts) {
      assert.ok(rooms.has(next));
      assert.ok(neighbors(id).includes(next),'Passages join orthogonal adjacent rooms');
      assert.ok(maze.passages[next].includes(id));
      edges++;
    }
  }
  assert.equal(edges/2,rooms.size-1,'A tree has exactly one route between any two rooms');
});

test('every actual piece is a simple connected solid with an interior grab point',()=>{
  for(const [index,piece] of maze.pieces.entries()) {
    const tiles=new Set(piece.tiles),points=polygons[index],b=piece.bounds;
    assert.equal(flood(piece.tiles[0],id=>neighbors(id).filter(n=>tiles.has(n))).size,tiles.size);
    assert.ok(tiles.size>=10,'No tiny isolated fragment');
    assert.equal(new Set(points.map(p=>p.join(','))).size,points.length,'No pinched/self-touching vertex');
    assert.ok(pointInPolygon([piece.center.x,piece.center.y],points),'Grab point lies on solid pink material');
    for(let i=0;i<points.length;i++) {
      const a=points[i],bnext=points[(i+1)%points.length];
      assert.ok(a[0]===bnext[0]||a[1]===bnext[1]);
      assert.ok(a[0]>=b.x&&a[0]<=b.x+b.width&&a[1]>=b.y&&a[1]<=b.y+b.height);
      assert.ok(pointInPolygon(a,HEART_POINTS),'Entire wall contour stays inside the ceramic tray');
      // Non-adjacent axis-aligned segments must never cross or touch.
      for(let j=i+2;j<points.length;j++) {
        if(i===0&&j===points.length-1) continue;
        const c=points[j],d=points[(j+1)%points.length];
        const intersects=Math.max(Math.min(a[0],bnext[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],bnext[0]),Math.max(c[0],d[0]))
          && Math.max(Math.min(a[1],bnext[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],bnext[1]),Math.max(c[1],d[1]));
        assert.equal(intersects,false,`${piece.id} has no self intersection`);
      }
    }
    const area=Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
    const tileArea=piece.tiles.reduce((sum,id)=>{const r=tileRectangle(id);return sum+r.width*r.height;},0);
    assert.equal(area,tileArea,'Contour preserves exactly the material area, with no hidden holes');
  }
});

test('pieces exactly cover all maze walls once, leaving only the intended corridors',()=>{
  const owners=new Map();
  for(const piece of maze.pieces) for(const id of piece.tiles) {
    assert.ok(!owners.has(id),`Wall tile ${id} has one owner`);owners.set(id,piece.id);
  }
  assert.deepEqual(new Set(owners.keys()),new Set(maze.walls));
  // Independently derive the solid region from rooms and passage connections.
  const expected=new Set();
  for(const room of maze.rooms) {
    const [x,y]=room.split(',').map(Number);
    for(const [dx,dy] of [[0,0],[2,0],[0,2],[2,2]]) expected.add(key(2*x+dx,2*y+dy));
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if(!maze.passages[room].includes(key(x+dx,y+dy))) expected.add(key(2*x+1+dx,2*y+1+dy));
    }
  }
  assert.deepEqual(new Set(owners.keys()),expected);
  const rectangles=[...expected].map(tileRectangle);
  let checked=0;
  // Sample SVG interiors, edges, channels and outside space at sub-wall spacing.
  for(let y=1.31;y<600;y+=3.7) for(let x=2.17;x<600;x+=3.7) {
    const inWall=rectangles.some(r=>x>r.x&&x<r.x+r.width&&y>r.y&&y<r.y+r.height);
    const count=polygons.reduce((n,p)=>n+Number(pointInPolygon([x,y],p)),0);
    assert.equal(count,Number(inWall),`Unexpected gap or overlap at ${x},${y}`);checked++;
  }
  assert.ok(checked>25000);
});

test('solution is independently reachable and never crosses SVG walls or their extrusion',()=>{
  const parent=new Map([[maze.start,null]]),queue=[maze.start];
  for(let i=0;i<queue.length;i++) for(const next of maze.passages[queue[i]]) if(!parent.has(next)) {parent.set(next,queue[i]);queue.push(next);}
  const route=[];for(let id=maze.end;id!==null;id=parent.get(id)) route.push(id);route.reverse();
  assert.deepEqual(route,maze.solution);
  assert.equal(route.length,81);
  const c=MAZE_CONFIG,center=id=>{const [x,y]=id.split(',').map(Number);return [c.x+(x+.5)*c.step,c.y+(y+.5)*c.step];};
  for(let i=1;i<route.length;i++) {
    const a=center(route[i-1]),b=center(route[i]);
    for(let j=0;j<=48;j++) {
      const point=a.map((v,axis)=>v+(b[axis]-v)*j/48);
      for(const p of polygons) {
        assert.equal(pointInPolygon(point,p),false);
        assert.equal(pointInPolygon([point[0],point[1]-4],p),false,'Visible extrusion does not block the solution');
      }
    }
  }
});

test('piece adjacency matches shared material seams and forms one assembly',()=>{
  const owners=new Map(maze.pieces.flatMap(p=>p.tiles.map(tile=>[tile,p.id])));
  for(const p of maze.pieces) {
    const actual=new Set(p.tiles.flatMap(id=>neighbors(id).map(next=>owners.get(next))).filter(id=>id&&id!==p.id));
    assert.deepEqual(new Set(p.neighbors),actual);
    for(const id of p.neighbors) assert.ok(maze.pieces.find(p=>p.id===id).neighbors.includes(p.id));
  }
  const lookup=new Map(maze.pieces.map(p=>[p.id,p]));
  assert.equal(flood(maze.pieces[0].id,id=>lookup.get(id).neighbors).size,24);
});

test('off-board joining, group movement and incorrect-drop rejection work for maze pieces',()=>{
  const game=engine(),a=maze.pieces[0],b=maze.pieces.find(p=>p.id===a.neighbors[0]);
  const first=game.items.get(a.id),second=game.items.get(b.id);
  game.moveGroup(b.id,first.x+6-second.x,first.y-3-second.y);
  assert.equal(game.drop(b.id).joined,1);
  assert.equal(game.getGroup(a.id).length,2);
  game.moveGroup(a.id,100,-30);
  assert.equal(first.x,second.x);assert.equal(first.y,second.y);
  game.moveGroup(a.id,45+18-first.x,60-first.y);
  assert.equal(game.drop(a.id).placed,0,'18-unit offset must not falsely snap onto the 24-unit grid');
  game.moveGroup(a.id,-14,0);
  assert.equal(game.drop(a.id).placed,2);
});

test('all 24 pieces can be manually placed, restored mid-game, completed and restarted',()=>{
  let game=engine();
  for(const [i,piece] of maze.pieces.entries()) {
    const item=game.items.get(piece.id);
    game.moveGroup(piece.id,48-item.x,58-item.y);
    assert.ok(game.drop(piece.id).placed>=1);
    if(i===10) {const saved=game.serialize();game=engine();assert.equal(game.restore(saved),true);assert.equal(game.progress.placed,11);}
  }
  assert.equal(game.completed,true);assert.equal(game.groups.size,1);
  for(const item of game.items.values()) {assert.equal(item.x,45);assert.equal(item.y,60);assert.equal(item.locked,true);}
  const restored=engine();assert.equal(restored.restore(game.serialize()),true);assert.equal(restored.completed,true);
  restored.reset();assert.equal(restored.progress.placed,0);assert.equal(restored.groups.size,24);
});

test('exported SVG preview and solution use the exact playable geometry with no external assets',async()=>{
  for(const [file,solution] of [['preview.svg',false],['solution.svg',true]]) {
    const svg=await readFile(new URL(`../public/assets/heart-maze-v1/${file}`,import.meta.url),'utf8');
    assert.equal(svg,mazePreview(maze,{solution}));
    assert.doesNotMatch(svg,/<image|<script|foreignObject|href=/);
    for(const piece of maze.pieces) assert.ok(svg.includes(`d="${piece.path}"`));
    assert.equal(svg.includes(`d="${maze.solutionPath}"`),solution);
  }
});
