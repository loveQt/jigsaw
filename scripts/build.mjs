import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', {recursive:true, force:true});
await mkdir('dist');
for (const entry of ['index.html', 'src']) await cp(entry, `dist/${entry}`, {recursive:true});
await cp('public/assets', 'dist/assets', {recursive:true});
console.log('Built static site → dist/');
