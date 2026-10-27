import {mkdir,writeFile} from 'node:fs/promises';
import {MAZE_DATA,MAZE_CONFIG} from '../src/maze-geometry.js';
import {mazePreview,mazeDefs,mazePiece} from '../src/maze-art.js';

await mkdir('public/assets/heart-maze-v1',{recursive:true});
await mkdir('docs/levels/04-heart-maze',{recursive:true});
await writeFile('public/assets/heart-maze-v1/preview.svg',mazePreview(MAZE_DATA));
await writeFile('public/assets/heart-maze-v1/solution.svg',mazePreview(MAZE_DATA,{solution:true}));
const colors=['#d889a6','#719d90','#b3a0c5','#c4a075','#93a0bb','#c28f8f'];
const blueprint=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><path d="${MAZE_DATA.outline}" fill="#f1f3ef" stroke="#d1d9d0"/>${MAZE_DATA.pieces.map((p,i)=>`<path d="${p.path}" fill="${colors[i%colors.length]}" stroke="white" stroke-width=".8"/><text x="${p.center.x}" y="${p.center.y+3}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#3c3a39">${i+1}</text>`).join('')}</svg>`;
await writeFile('public/assets/heart-maze-v1/blueprint.svg',blueprint);
const contact=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1050"><rect width="1000" height="1050" fill="#f5f2ed"/>${mazeDefs('contact')}${MAZE_DATA.pieces.map((p,i)=>{
  const x=20+(i%5)*200,y=25+Math.floor(i/5)*210,scale=Math.min(160/p.bounds.width,165/p.bounds.height);
  return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="12" fill="#8d767b">${p.name}</text><g transform="translate(${x+8} ${y+15}) scale(${scale}) translate(${-p.bounds.x} ${-p.bounds.y})">${mazePiece(p,'contact')}</g>`;
}).join('')}</svg>`;
await writeFile('public/assets/heart-maze-v1/contact.svg',contact);
await writeFile('docs/levels/04-heart-maze/manifest.json',JSON.stringify({
  id:MAZE_DATA.id,config:MAZE_CONFIG,rooms:MAZE_DATA.rooms.length,wallTiles:MAZE_DATA.walls.length,
  pieces:MAZE_DATA.pieces.length,solutionRooms:MAZE_DATA.solution.length,
  start:MAZE_DATA.start,end:MAZE_DATA.end,assets:['preview.svg','solution.svg','blueprint.svg','contact.svg'],
  source:'Original deterministic SVG geometry; no raster or external assets.',
},null,2)+'\n');
console.log(`Generated SVG previews for ${MAZE_DATA.pieces.length} connected pieces, ${MAZE_DATA.rooms.length} rooms, ${MAZE_DATA.solution.length}-room solution.`);
