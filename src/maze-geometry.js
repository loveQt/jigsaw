// A perfect maze (a spanning tree of rooms), cut into connected wall pieces.
// The empty corridors are intentional: this puzzle assembles walls, not tiles.
export const MAZE_CONFIG = Object.freeze({ seed: 20261027, columns: 22, rows: 21, step: 24, wall: 8, x: 36, y: 60, pieceCount: 24 });
export const HEART_OUTLINE = 'M300 138 C214 21 45 58 36 192 C23 316 170 438 300 560 C430 438 577 316 564 192 C555 58 386 21 300 138 Z';
const curves = [
  [[300,138],[214,21],[45,58],[36,192]],
  [[36,192],[23,316],[170,438],[300,560]],
  [[300,560],[430,438],[577,316],[564,192]],
  [[564,192],[555,58],[386,21],[300,138]],
];
export const HEART_POINTS = curves.flatMap(points => Array.from({ length: 80 }, (_, i) => {
  const t = i / 80, u = 1 - t;
  return [0,1].map(axis => u**3*points[0][axis]+3*u*u*t*points[1][axis]+3*u*t*t*points[2][axis]+t**3*points[3][axis]);
}));
export function pointInPolygon([x,y], polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
const key = (x,y) => `${x},${y}`;
const parse = value => value.split(',').map(Number);
const directions = [[1,0],[0,1],[-1,0],[0,-1]];
function randomGenerator(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
function adjacent(id, set) {
  const [x,y]=parse(id);
  return directions.map(([dx,dy])=>key(x+dx,y+dy)).filter(next=>set.has(next));
}
// Even bands are walls; odd bands are corridors. All consumers share this map.
export function gridPoint(x,y) {
  const c=MAZE_CONFIG;
  const axis=value=>Math.floor(value/2)*c.step+(value%2?c.wall/2:-c.wall/2);
  return [c.x+axis(x),c.y+axis(y)];
}
export function tileRectangle(id) {
  const [x,y]=parse(id),[left,top]=gridPoint(x,y),[right,bottom]=gridPoint(x+1,y+1);
  return {x:left,y:top,width:right-left,height:bottom-top};
}

function contour(tiles) {
  const edges=new Map();
  const add=(a,b)=>edges.set(`${a}|${b}`,{a,b});
  for (const id of tiles) {
    const [x,y]=parse(id);
    if(!tiles.has(key(x,y-1))) add(key(x,y),key(x+1,y));
    if(!tiles.has(key(x+1,y))) add(key(x+1,y),key(x+1,y+1));
    if(!tiles.has(key(x,y+1))) add(key(x+1,y+1),key(x,y+1));
    if(!tiles.has(key(x-1,y))) add(key(x,y+1),key(x,y));
  }
  const from=new Map();
  for(const edge of edges.values()) {
    if(from.has(edge.a)) throw new Error('A maze piece has a pinched boundary.');
    from.set(edge.a,edge.b);
  }
  const start=edges.values().next().value.a, points=[];
  let current=start;
  do {
    points.push(gridPoint(...parse(current)));
    const next=from.get(current);
    if(!next) throw new Error('An open maze contour cannot be assembled.');
    from.delete(current);current=next;
  } while(current!==start);
  if(from.size) throw new Error('A maze piece has a hole or a disconnected island.');
  // Remove collinear vertices, preserving the exact orthogonal boundary.
  const simplified=points.filter((p,i)=>{
    const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    return (p[0]-prev[0])*(next[1]-p[1])!==(p[1]-prev[1])*(next[0]-p[0]);
  });
  return simplified;
}

export function createMazeGeometry() {
  const c=MAZE_CONFIG, random=randomGenerator(c.seed),rooms=new Set();
  // Keep the complete wall perimeter inside the smooth ceramic heart.
  for(let y=0;y<c.rows;y++) for(let x=0;x<c.columns;x++) {
    const left=c.x+x*c.step-12,top=c.y+y*c.step-12;
    if([[left,top],[left+c.step+24,top],[left,top+c.step+24],[left+c.step+24,top+c.step+24]]
      .every(p=>pointInPolygon(p,HEART_POINTS))) rooms.add(key(x,y));
  }
  const passages=new Map([...rooms].map(id=>[id,[]]));
  const visited=new Set(),stack=[rooms.values().next().value];visited.add(stack[0]);
  while(stack.length) {
    const current=stack.at(-1),options=adjacent(current,rooms).filter(id=>!visited.has(id));
    if(!options.length) {stack.pop();continue;}
    const next=options[Math.floor(random()*options.length)];
    passages.get(current).push(next);passages.get(next).push(current);
    visited.add(next);stack.push(next);
  }
  if(visited.size!==rooms.size) throw new Error('Heart room domain is disconnected.');
  const walls=new Set();
  for(const id of rooms) {
    const [x,y]=parse(id);
    for(let dy=0;dy<3;dy++) for(let dx=0;dx<3;dx++) {
      if(dx!==1||dy!==1) walls.add(key(2*x+dx,2*y+dy));
    }
  }
  // Carve only after all cell walls are present.
  for(const [id,neighbors] of passages) for(const next of neighbors) {
    const [x,y]=parse(id),[nx,ny]=parse(next);
    walls.delete(key(x+nx+1,y+ny+1));
  }

  // Farthest-point seeds + simultaneous graph flood give compact, connected
  // pieces, even along very thin branches. There is no independent cutting art.
  const seeds=[[...walls][0]],distance=new Map([...walls].map(id=>[id,Infinity]));
  while(seeds.length<=c.pieceCount) {
    const queue=[seeds.at(-1)];distance.set(queue[0],0);
    for(let i=0;i<queue.length;i++) for(const next of adjacent(queue[i],walls)) {
      const value=distance.get(queue[i])+1;
      if(value<distance.get(next)) {distance.set(next,value);queue.push(next);}
    }
    if(seeds.length===c.pieceCount) break;
    const farthest=[...walls].reduce((best,id)=>distance.get(id)>distance.get(best)?id:best,seeds[0]);
    if(!Number.isFinite(distance.get(farthest))) throw new Error('Maze walls are disconnected.');
    seeds.push(farthest);
  }
  const owner=new Map(seeds.map((id,i)=>[id,i])),queue=[...seeds];
  for(let i=0;i<queue.length;i++) for(const next of adjacent(queue[i],walls)) {
    if(!owner.has(next)) {owner.set(next,owner.get(queue[i]));queue.push(next);}
  }
  const pieces=seeds.map((seed,index)=>{
    const tiles=new Set([...walls].filter(id=>owner.get(id)===index));
    const points=contour(tiles),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
    const rectangle=tileRectangle(seed);
    const neighbors=new Set();
    for(const tile of tiles) for(const next of adjacent(tile,walls)) if(owner.get(next)!==index) neighbors.add(owner.get(next));
    return {id:`m${String(index+1).padStart(2,'0')}`,name:`心路 ${String(index+1).padStart(2,'0')}`,
      path:`M${points.map(p=>p.join(' ')).join(' L')} Z`,points,tiles:[...tiles],
      bounds:{x,y,width,height},center:{x:rectangle.x+rectangle.width/2,y:rectangle.y+rectangle.height/2},
      neighbors:[...neighbors].sort((a,b)=>a-b).map(i=>`m${String(i+1).padStart(2,'0')}`)};
  });
  const start=[...rooms].find(id=>parse(id)[0]===5)??[...rooms][0];
  const end=[...rooms].reduce((best,id)=>parse(id)[1]>parse(best)[1]?id:best,start);
  const parent=new Map([[start,null]]),routeQueue=[start];
  for(let i=0;i<routeQueue.length;i++) for(const next of passages.get(routeQueue[i])) {
    if(!parent.has(next)) {parent.set(next,routeQueue[i]);routeQueue.push(next);}
  }
  const solution=[];
  for(let id=end;id!==null;id=parent.get(id)) solution.push(id);
  solution.reverse();
  const roomCenter=id=>{const [x,y]=parse(id);return [c.x+(x+.5)*c.step,c.y+(y+.5)*c.step];};
  return {id:'heart-maze-v1',renderStyle:'maze',width:600,height:600,outline:HEART_OUTLINE,pieces,
    layouts:{
      desktop:{width:1400,height:760,looseArea:{x:690,y:80,width:690,height:650}},
      mobile:{width:700,height:1600,looseArea:{x:20,y:720,width:660,height:820}},
    },
    rooms:[...rooms],passages:Object.fromEntries(passages),walls:[...walls],start,end,solution,
    startPoint:roomCenter(start),endPoint:roomCenter(end),
    solutionPath:`M${solution.map(id=>roomCenter(id).join(' ')).join(' L')}`};
}
export const MAZE_DATA=createMazeGeometry();
