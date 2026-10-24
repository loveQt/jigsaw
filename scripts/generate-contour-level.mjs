import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONTOUR_GEOMETRY as geometry } from '../src/contour-geometry.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = join(root,'work/contour-v2');
await mkdir(work,{recursive:true});
const subjects = [
  ['元气柴柴','#dca35d','A natural Shiba Inu head facing almost straight forward, with both eyes and the whole nose and muzzle well inside the central half of the head, one prominent pointed ear in the high upper-left projection, rounded cheek and short muzzle.'],
  ['微笑金毛','#e7c58b','A natural golden retriever HEAD facing forward, broad rounded forehead, relaxed soft floppy ears on the two sides, smiling eyes and a short rounded chin.'],
  ['温柔边牧','#606f70','A natural black-and-cream border collie head facing almost straight forward, with both eyes and the whole nose and muzzle well inside the central half of the head, one prominent pointed ear in the high upper-right projection, a white facial blaze.'],
  ['微笑哈士奇','#8d9d9b','A natural husky HEAD facing forward with broad cheeks, two upright triangular ears at the upper corners, slate gray fur and a cream central muzzle, gentle dark eyes.'],
  ['奶油西高地','#ebdfc9','A natural cream West Highland white terrier HEAD facing forward, broad fluffy round cheeks, two soft triangular ears at the upper corners and a tiny dark nose. Short softly textured coat.'],
  ['开心小柯基','#d69a63','A natural corgi HEAD facing forward, short orange fur and cream cheeks, broad forehead, two large upright ears at both upper corners, friendly eyes, smiling little mouth.'],
  ['柯基歪头','#cb8b56','A natural corgi HEAD in a slight three-quarter pose tilted clockwise, two simplified ears at the top, warm orange cheeks and cream muzzle. Put all facial features safely inside the broad central area.'],
  ['困困小法斗','#baa081','A natural French bulldog HEAD facing forward, short fawn fur, two wide upright ears at the upper sides, a dark rounded muzzle mask, relaxed sleepy eyes, naturally broad cheeks and short chin.'],
  ['歪头小雪','#82918b','A natural salt-and-pepper schnauzer HEAD in a slight three-quarter pose tilted counterclockwise, softly folded ears, short beard and broad cream muzzle. Put all facial features safely inside the broad central area.'],
];
const pieces = geometry.pieces.map((piece,index)=>({...piece,name:subjects[index][0],fill:subjects[index][1],subject:subjects[index][2]}));
await writeFile(join(work,'geometry.json'),JSON.stringify({...geometry,pieces},null,2));
const blueprint = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><title>九块自然犬形，共享边界分区</title><path d="${geometry.outline}" fill="#f5eedf" stroke="#7e6d53" stroke-width="3"/>${pieces.map(piece=>`<path d="${piece.path}" fill="none" stroke="#a9916b" stroke-width="1.4"/><text x="${piece.center.x}" y="${piece.center.y}" text-anchor="middle" fill="#887454" font-family="monospace" font-size="14">${piece.id}</text>`).join('')}</svg>`;
await writeFile(join(root,'public/assets/contour-blueprint.svg'),blueprint);
const prepare = process.argv.includes('--prepare');
const python = process.env.PAWZZLE_PYTHON || 'python3';
const result = spawnSync(python,[join(root,'scripts/prepare-contour-art.py'),prepare?'prepare':'assemble'],{stdio:'inherit',cwd:root});
if(result.error) throw result.error;
if(result.status !== 0) process.exit(result.status ?? 1);
if(!prepare) {
  const metadata = Object.fromEntries(pieces.map(({id,name,fill})=>[id,{name,fill}]));
  await writeFile(join(root,'src/contour-data.js'),`// Generated after contour-guided site-imagegen artwork and exact contour clipping.\nimport { CONTOUR_GEOMETRY } from './contour-geometry.js';\nconst artwork = ${JSON.stringify(metadata,null,2)};\nexport const CONTOUR_DATA = {\n  id: 'dog-expressions-painted-v2',\n  name: '汪汪表情集', width: 600, height: 600, pixelScale: 3,\n  outline: CONTOUR_GEOMETRY.outline,\n  image: '/assets/contour-dogs-v2.png',\n  blueprint: '/assets/contour-blueprint.svg',\n  pipeline: 'outline → nine natural contours → site-imagegen → exact contour clipping',\n  pieces: CONTOUR_GEOMETRY.pieces.map(({points,edges,...piece}) => ({\n    ...piece, ...artwork[piece.id], image: '/assets/contour-dogs-v2/' + piece.id + '.png',\n  })),\n};\nexport default CONTOUR_DATA;\n`);
}
