import { LEVEL, LEVELS } from './level.js';
import { PuzzleEngine } from './puzzle-engine.js';
import { icon, hydrateIcons } from './icons.js';
import { packRectangles } from './packing.js';

hydrateIcons();
const $ = (id) => document.getElementById(id);
const svg = $('puzzle-canvas');
const dialog = $('game-dialog');
const BOARD = {x:45, y:60};
let mobile = window.matchMedia('(max-width: 720px)').matches;
let WIDTH = mobile ? 700 : 1600, HEIGHT = mobile ? 1850 : 900;
svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
$('tabletop').classList.toggle('mobile-table', mobile);
const SAVE_KEY = LEVEL.saveKey;
const TOTAL = LEVEL.pieces.length;
document.title = `拼汪 PAWZZLE · ${LEVEL.title}`;
$('level-title').textContent = LEVEL.title;
$('level-chip').textContent = `第 ${LEVEL.number} 关`;
$('level-description').textContent = LEVEL.subtitle;
$('level-difficulty').textContent = LEVEL.difficulty;
document.querySelector('.difficulty-dots').classList.toggle('advanced', TOTAL >= 30);
$('game-card').setAttribute('aria-label', `${LEVEL.title}拼图游戏`);
$('level-select').replaceChildren(...LEVELS.map(level => {
  const option = document.createElement('option');
  option.value = level.number;
  option.textContent = `${level.number} · ${level.title}`;
  return option;
}));
$('level-select').value = LEVEL.number;
document.querySelectorAll('[data-piece-count]').forEach(el=>el.textContent=TOTAL);
document.querySelector('.progress-track').setAttribute('aria-valuemax', TOTAL);
const meta = new Map(LEVEL.pieces.map(piece => [piece.id, piece]));
const nodes = new Map();
let selected = null, drag = null, started = false, elapsed = 0, timerEnabled = true;
let soundEnabled = false, modalType = null, lastTick = performance.now(), toastTimeout, restorePaused = false;
let hintCount = 0, storageAvailable = true, audioContext;

function shuffled(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function scatterPositions() {
  const positions = {};
  const pieces = shuffled(LEVEL.pieces);
  const packed=packRectangles(pieces.map(p=>({id:p.id,...p.bounds})),looseArea());
  pieces.forEach((piece, index) => {
    const spot=packed.get(piece.id) || {x:mobile?30:710,y:80+index*20};
    positions[piece.id] = {x:spot.x-piece.bounds.x,y:spot.y-piece.bounds.y};
  });
  return positions;
}

function looseArea() {return mobile?{x:20,y:720,width:660,height:1080}:{x:690,y:80,width:890,height:760};}

const engine = new PuzzleEngine(LEVEL.pieces, {
  puzzleId: LEVEL.id,
  boardOrigin: BOARD,
  threshold: 20,
  initialPositions: scatterPositions(),
});

function pieceArtwork(piece, withShadow = false) {
  const b=piece.bounds;
  return `<path d="${piece.path}" fill="${piece.fill ?? '#946942'}" ${withShadow?'filter="url(#piece-shadow)"':''}/><g clip-path="url(#clip-${piece.id})"><image href="${piece.image}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" pointer-events="none"/></g><path d="${piece.path}" class="piece-edge"/>`;
}

const defs = `<defs>
  <filter id="board-shadow" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#65553b" flood-opacity=".14"/></filter>
  <filter id="piece-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#5d4d31" flood-opacity=".24"/></filter>
  <pattern id="wood-grain" width="90" height="30" patternUnits="userSpaceOnUse"><path d="M0 9Q22 7 45 10T90 9M0 25Q25 20 49 24T90 25" fill="none" stroke="#a98e59" stroke-width=".7"/></pattern>
  <radialGradient id="board-fill"><stop offset="0" stop-color="#e9e2cd"/><stop offset="1" stop-color="#e3dbc3"/></radialGradient>
  ${LEVEL.pieces.map(piece => `<clipPath id="clip-${piece.id}"><path d="${piece.path}"/></clipPath>`).join('')}
</defs>`;

svg.innerHTML = `${defs}<g transform="translate(${BOARD.x} ${BOARD.y})" id="board-layer" pointer-events="none">
  <path d="${LEVEL.outline}" fill="#ded3b5" stroke="#d0c3a2" stroke-width="15" stroke-linejoin="round" filter="url(#board-shadow)"/>
  <path d="${LEVEL.outline}" fill="url(#board-fill)" stroke="#f7f2df" stroke-width="4"/>
  <path d="${LEVEL.outline}" fill="url(#wood-grain)" opacity=".12"/>
  <g opacity=".65">${LEVEL.pieces.map(piece=>`<path d="${piece.path}" fill="none" stroke="#c8c0a7" stroke-width="1.15" stroke-dasharray="3 5"/>`).join('')}</g>
  <g transform="translate(265 270) scale(2.8)" fill="#bdb99e" opacity=".15"><ellipse cx="5.5" cy="8" rx="2.5" ry="3.5"/><ellipse cx="12" cy="5" rx="2.3" ry="3.3"/><ellipse cx="18.5" cy="8" rx="2.5" ry="3.5"/><path d="M5 18c0-4 4-8 7-8s7 4 7 8c0 4-5 3-7 2-2 1-7 2-7-2Z"/></g>
</g><g id="placed-layer"></g><g id="loose-layer"></g>`;

for (const piece of LEVEL.pieces) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  node.id = `piece-${piece.id}`;
  node.dataset.piece = piece.id;
  node.setAttribute('class', 'piece');
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', `${piece.name}拼块，方向键移动，回车吸附`);
  node.innerHTML = `<title>${piece.name}</title>${pieceArtwork(piece,true)}`;
  $('loose-layer').append(node);
  nodes.set(piece.id, node);
}

function groupBounds(id) {
  const items = engine.getGroup(id);
  return items.reduce((box,item) => {
    const b = meta.get(item.id).bounds;
    return {left:Math.min(box.left,b.x+item.x),top:Math.min(box.top,b.y+item.y),right:Math.max(box.right,b.x+b.width+item.x),bottom:Math.max(box.bottom,b.y+b.height+item.y)};
  },{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
}

function moveWithinTable(id,dx,dy) {
  const box = groupBounds(id);
  const safeX = Math.max(10-box.left, Math.min(dx, WIDTH-10-box.right));
  const safeY = Math.max(55-box.top, Math.min(dy, HEIGHT-30-box.bottom));
  engine.moveGroup(id,safeX,safeY);
}

function render() {
  for (const item of engine.items.values()) {
    const node = nodes.get(item.id);
    node.setAttribute('transform', `translate(${item.x} ${item.y})`);
    node.classList.toggle('locked', item.locked);
    node.classList.toggle('selected', !item.locked && selected !== null && item.groupId === engine.items.get(selected)?.groupId);
    node.classList.toggle('dragging', Boolean(drag && item.groupId === engine.items.get(drag.id)?.groupId));
    node.dataset.group = item.groupId;
    node.dataset.locked = String(item.locked);
    node.setAttribute('aria-label', `${meta.get(item.id).name}拼块${item.locked?'，已归位':'，方向键移动，回车吸附'}`);
    node.setAttribute('tabindex', item.locked ? '-1' : '0');
    node.setAttribute('aria-disabled', String(item.locked));
    const parent = item.locked ? $('placed-layer') : $('loose-layer');
    if (node.parentNode !== parent) parent.append(node);
  }
  const p = engine.progress;
  $('placed-count').textContent = p.placed;
  $('progress-fill').style.width = `${p.percent}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow',p.placed);
  $('canvas-hint').style.opacity = started ? '0' : '1';
  $('hint-button').disabled = p.completed;
  $('shuffle-button').disabled = p.completed;
  $('pause-button').disabled = p.completed;
}

function formatTime(ms) {
  const seconds = Math.floor(ms/1000);
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function tick() {
  const now = performance.now();
  if (started && timerEnabled && !modalType && !document.hidden && !engine.completed) elapsed += now-lastTick;
  lastTick = now;
  $('timer').textContent = timerEnabled ? formatTime(elapsed) : '自由模式';
}
function begin() {tick(); started=true; $('canvas-hint').style.opacity='0';}
function save() {
  tick();
  try {
    localStorage.setItem(SAVE_KEY,JSON.stringify({level:LEVEL.id,engine:engine.serialize(),elapsed,started,timerEnabled,soundEnabled,hintCount,paused:modalType==='pause',mobile}));
  } catch {
    if (storageAvailable) $('save-status').textContent='此浏览器无法保存，当前进度保留到页面关闭';
    storageAvailable=false;
  }
}
function load() {
  try {
    const data=JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || data.level!==LEVEL.id || !Number.isFinite(data.elapsed) || data.elapsed<0 || data.elapsed>31536000000) return;
    if (!engine.restore(data.engine)) return;
    elapsed=data.elapsed; started=Boolean(data.started); timerEnabled=data.timerEnabled!==false;
    soundEnabled=Boolean(data.soundEnabled); restorePaused=Boolean(data.paused); hintCount=Number.isInteger(data.hintCount)&&data.hintCount>=0?data.hintCount:0;
    // Recover finite but out-of-table positions, e.g. a hand-edited save.
    for (const group of engine.groups.values()) {
      const id=group.values().next().value;
      if(!engine.items.get(id).locked) moveWithinTable(id,0,0);
    }
    if(Boolean(data.mobile)!==mobile) organize();
  } catch { /* A missing or incompatible local save starts a fresh level. */ }
}

function toast(text) {
  clearTimeout(toastTimeout); $('toast').textContent=text; $('toast').classList.add('visible');
  toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2700);
}

function playSnap(completed=false) {
  if (!soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    [0, ...(completed?[.13,.26]:[])].forEach((delay,index)=>{
      const osc=audioContext.createOscillator(), gain=audioContext.createGain();
      const at=audioContext.currentTime+delay;
      osc.type='sine'; osc.frequency.setValueAtTime([660,830,990][index],at);
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);
      osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.23);
    });
  } catch { /* Sound is an enhancement; gameplay does not require it. */ }
}

function afterDrop(result,id) {
  if (!engine.items.get(id).locked) moveWithinTable(id,0,0);
  if (result.placed || result.joined) {
    playSnap(result.completed);
    for (const item of engine.getGroup(id)) {
      const node=nodes.get(item.id);node.classList.add('flash');setTimeout(()=>node.classList.remove('flash'),450);
    }
    if (!result.completed) toast(result.placed ? `好耶，${result.placed>1?`${result.placed} 片小快乐一起`:'这片小快乐'}找到家了` : `拼在一起啦！现在可以拖动这 ${engine.getGroup(id).length} 块`);
  }
  render(); save();
  if(result.completed) { celebrate(); openModal('complete'); }
}

function tablePoint(event) {
  const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function cancelDrag() {
  if (!drag) return;
  const active=drag;drag=null;
  cancelAnimationFrame(active.frame);
  const item=engine.items.get(active.id);
  engine.moveGroup(active.id,active.start.x-item.x,active.start.y-item.y);
  if (svg.hasPointerCapture(active.pointer)) svg.releasePointerCapture(active.pointer);
  render();
}

function dragAutoScroll() {
  if (!drag) return;
  if (mobile) {
    const edge=82, y=drag.client.y;
    const speed=y<edge?-Math.min(12,(edge-y)/5):y>window.innerHeight-edge?Math.min(12,(y-window.innerHeight+edge)/5):0;
    if(speed) {
      window.scrollBy(0,speed);
      const point=tablePoint({clientX:drag.client.x,clientY:drag.client.y});
      moveWithinTable(drag.id,point.x-drag.last.x,point.y-drag.last.y);
      drag.last=point;render();
    }
  }
  drag.frame=requestAnimationFrame(dragAutoScroll);
}

// SVG graphics do not consistently honor touch-action on descendant groups.
// Cancel native panning only when a loose piece is grabbed; blank table space
// still uses the browser's normal scrolling gesture.
svg.addEventListener('touchstart',event=>{
  const node=event.target.closest('[data-piece]');
  if(!modalType && node && !engine.items.get(node.dataset.piece).locked) event.preventDefault();
},{passive:false});

svg.addEventListener('pointerdown',event=>{
  if (modalType || (event.pointerType==='mouse' && event.button!==0) || drag) return;
  const node=event.target.closest('[data-piece]');
  if (!node) {selected=null;render();return;}
  const id=node.dataset.piece, item=engine.items.get(id);
  if(item.locked) return;
  event.preventDefault();begin();selected=id;
  const point=tablePoint(event);
  drag={id,pointer:event.pointerId,last:point,start:{x:item.x,y:item.y},client:{x:event.clientX,y:event.clientY},frame:0};
  for(const member of engine.getGroup(id)) $('loose-layer').append(nodes.get(member.id));
  svg.setPointerCapture(event.pointerId);node.focus({preventScroll:true});render();
  drag.frame=requestAnimationFrame(dragAutoScroll);
});
svg.addEventListener('pointermove',event=>{
  if (!drag || event.pointerId!==drag.pointer) return;
  const p=tablePoint(event);
  drag.client={x:event.clientX,y:event.clientY};
  moveWithinTable(drag.id,p.x-drag.last.x,p.y-drag.last.y);
  drag.last=p;render();
});
svg.addEventListener('pointerup',event=>{
  if (!drag || event.pointerId!==drag.pointer) return;
  const id=drag.id;cancelAnimationFrame(drag.frame);drag=null;
  if(svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  tick();afterDrop(engine.drop(id),id);
});
svg.addEventListener('pointercancel',event=>{if(drag && event.pointerId===drag.pointer){cancelDrag();save();}});
svg.addEventListener('lostpointercapture',()=>{if(drag) cancelDrag();});

svg.addEventListener('keydown',event=>{
  const node=event.target.closest('[data-piece]');
  if(!node || modalType || drag) return;
  const id=node.dataset.piece;
  if(engine.items.get(id).locked) return;
  const amount=event.shiftKey?20:5;
  const delta={ArrowLeft:[-amount,0],ArrowRight:[amount,0],ArrowUp:[0,-amount],ArrowDown:[0,amount]}[event.key];
  if(delta) {event.preventDefault();begin();selected=id;moveWithinTable(id,...delta);render();save();}
  else if(event.key==='Enter') {event.preventDefault();begin();selected=id;tick();afterDrop(engine.drop(id),id);}
});

function previewSVG() {
  return `<svg class="preview-art" viewBox="0 0 ${LEVEL.width} ${LEVEL.height}" role="img" aria-label="${LEVEL.title}，${TOTAL} 块拼片组成的完整狗头"><defs><clipPath id="preview-outline"><path d="${LEVEL.outline}"/></clipPath></defs><path d="${LEVEL.outline}" fill="#d5bd8f" stroke="#9f8155" stroke-width="4" stroke-linejoin="round"/><image href="${LEVEL.image}" width="${LEVEL.width}" height="${LEVEL.height}" clip-path="url(#preview-outline)"/></svg>`;
}
function closeModal() {if(dialog.open) dialog.close();}
function openModal(type) {
  tick();cancelDrag();modalType=type;
  dialog.classList.toggle('preview-dialog',type==='preview');
  $('dialog-close').hidden=type==='pause';
  const content=$('dialog-content');
  if(type==='pause') content.innerHTML=`<div class="modal-emblem">${icon('pause')}</div><div class="eyebrow">A LITTLE PAUSE</div><h2 id="dialog-title">休息一下，也很好。</h2><p>小狗们会在这里等你。<br/>计时已暂停，快乐不用赶进度。</p><button class="primary-button" data-action="close">${icon('play')}继续拼图</button>`;
  if(type==='preview') content.innerHTML=`<div class="eyebrow">THE BIG PICTURE</div><h2 id="dialog-title">原来，快乐长这样。</h2><p>记住你喜欢的小狗，再回去找找它。查看期间暂停计时。</p>${previewSVG()}<button class="primary-button" data-action="close">回到拼图${icon('arrow')}</button>`;
  if(type==='help') content.innerHTML=`<div class="modal-emblem">${icon('paw')}</div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="dialog-title">一片一片，慢慢来。</h2><div class="help-steps"><div class="help-step"><span>01</span><div><strong>找到小狗的位置</strong><p>把碎片拖到底板，对准轮廓，松手后就会吸附。所有碎片方向都已摆正，无需旋转。</p></div></div><div class="help-step"><span>02</span><div><strong>整个桌面都是你的拼图区</strong><p>碎片可以留在任意空位。相邻碎片在桌面上对齐，也会拼成一组，整组一起拖动。</p></div></div><div class="help-step"><span>03</span><div><strong>按自己的节奏玩</strong><p>点击时钟切换自由模式。随时暂停、查看原图，或用「帮我一块」放好选中的拼块组。进度自动保存。</p></div></div></div><p>小屏幕上下滚动桌面；拖到屏幕上下边缘会自动滚动。<br/>键盘：Tab 选块 · 方向键移动 · Shift 加速 · 回车吸附</p><button class="primary-button" data-action="close">我知道啦${icon('heart')}</button>`;
  if(type==='restart') content.innerHTML=`<div class="modal-emblem">${icon('restart')}</div><h2 id="dialog-title">再拼一次小快乐？</h2><p>这一关的拼块会重新打散，计时和进度也会归零。</p><div class="dialog-actions"><button class="secondary-button" data-action="close">接着拼</button><button class="primary-button" data-action="restart">重新开始</button></div>`;
  if(type==='complete') content.innerHTML=`<div class="modal-emblem">${icon('paw')}</div><div class="eyebrow">ALL TOGETHER, AT LAST</div><h2 id="dialog-title">快乐，完整了！</h2><p>${TOTAL} 片小快乐都找到家了。<br/>谢谢你，为今天拼出了一点小美好。</p><div class="success-stats"><div><strong>${timerEnabled?formatTime(elapsed):'自由'}</strong><span>${timerEnabled?'计时用时':'慢慢享受'}</span></div><div><strong>${TOTAL} / ${TOTAL}</strong><span>拼片已集合</span></div><div><strong>${hintCount}</strong><span>使用帮助</span></div></div><div class="dialog-actions"><button class="secondary-button" data-action="close">欣赏作品</button><button class="primary-button" data-action="restart">再拼一次${icon('restart')}</button></div>`;
  if(!dialog.open) dialog.showModal();
  lastTick=performance.now();
  save();
}
dialog.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='close') closeModal();
  if(action==='restart') restart();
  if(event.target===dialog) {
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeModal();
  }
});
dialog.addEventListener('close',()=>{modalType=null;lastTick=performance.now();save();});
$('dialog-close').addEventListener('click',closeModal);

function restart() {
  cancelDrag();engine.reset(scatterPositions());selected=null;elapsed=0;started=false;hintCount=0;
  closeModal();lastTick=performance.now();render();save();toast('小狗们准备好啦，再拼一次吧');
}
function celebrate() {
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('confetti').innerHTML=Array.from({length:55},(_,i)=>`<i style="left:${Math.random()*100}%;background:${['#bd6b46','#a2ad80','#e0bd69','#d2c2a3'][i%4]};animation-delay:${Math.random()*.65}s;--drift:${Math.random()*160-80}px"></i>`).join('');
  setTimeout(()=>$('confetti').replaceChildren(),4000);
}

$('level-select').addEventListener('change', event => {
  cancelDrag();save();
  const url = new URL(window.location.href);
  url.searchParams.set('level', event.target.value);
  window.location.assign(url);
});

$('pause-button').addEventListener('click',()=>openModal('pause'));
$('preview-button').addEventListener('click',()=>openModal('preview'));
$('help-button').addEventListener('click',()=>openModal('help'));
$('restart-button').addEventListener('click',()=>openModal('restart'));
$('timer-button').addEventListener('click',()=>{
  tick();timerEnabled=!timerEnabled;lastTick=performance.now();
  $('timer-button').setAttribute('aria-pressed',String(timerEnabled));tick();save();
  toast(timerEnabled?'计时模式已开启，从拿起碎片开始':'已切换自由模式，慢慢享受拼图');
});
function updateSoundButton() {
  $('sound-button').innerHTML=icon(soundEnabled?'sound':'sound-off');
  $('sound-button').setAttribute('aria-label',soundEnabled?'关闭拼接音效':'开启拼接音效');
  $('sound-button').setAttribute('title',soundEnabled?'关闭拼接音效':'开启拼接音效');
  $('sound-button').setAttribute('aria-pressed',String(soundEnabled));
}
$('sound-button').addEventListener('click',()=>{soundEnabled=!soundEnabled;updateSoundButton();playSnap();save();toast(soundEnabled?'拼接音效已开启':'拼接音效已关闭');});
$('fullscreen-button').addEventListener('click',async()=>{
  try {if(document.fullscreenElement) await document.exitFullscreen();else await $('game-card').requestFullscreen();}
  catch {toast('当前浏览器暂不支持全屏，可以放大窗口玩');}
});
document.addEventListener('fullscreenchange',()=>{
  // Modal dialogs remain in the fullscreen subtree, so all controls still work.
  (document.fullscreenElement || document.body).append(dialog);
  $('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏游戏');
});
$('hint-button').addEventListener('click',()=>{
  if(engine.completed) return;begin();hintCount++;
  const id=selected && !engine.items.get(selected).locked ? selected : [...engine.items.values()].find(item=>!item.locked).id;
  tick();afterDrop(engine.hint(id),id);
});
function organize() {
  cancelDrag();
  const groups=shuffled([...engine.groups.values()].map(group=>[...group]).filter(group=>!engine.items.get(group[0]).locked));
  const boxes=groups.map(group=>{const b=groupBounds(group[0]);return {id:group[0],width:b.right-b.left,height:b.bottom-b.top};});
  const packed=packRectangles(boxes,looseArea());
  for(const group of groups) {
    const id=group[0],b=groupBounds(id),position=packed.get(id);
    if(position) moveWithinTable(id,position.x-b.left,position.y-b.top);
    else moveWithinTable(id,0,0);
  }
}
$('shuffle-button').addEventListener('click',()=>{
  organize();
  render();save();toast('碎片整理好了，已经拼好的组合会保留');
});
window.matchMedia('(max-width: 720px)').addEventListener('change',event=>{
  cancelDrag();mobile=event.matches;WIDTH=mobile?700:1600;HEIGHT=mobile?1850:900;
  svg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);$('tabletop').classList.toggle('mobile-table',mobile);
  organize();render();save();
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if(event.code==='Space' && !['BUTTON','A'].includes(event.target.tagName)) {
    event.preventDefault();if(modalType==='pause') closeModal();else if(!modalType&&!engine.completed) openModal('pause');
  }
  if(event.key.toLowerCase()==='p') {event.preventDefault();if(modalType==='preview')closeModal();else if(!modalType)openModal('preview');}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {tick();cancelDrag();if(started&&!engine.completed&&!modalType) openModal('pause');save();}
  lastTick=performance.now();
});
window.addEventListener('blur',()=>{if(drag){cancelDrag();save();}});
window.addEventListener('pagehide',save);
load();render();updateSoundButton();$('timer-button').setAttribute('aria-pressed',String(timerEnabled));tick();
if(restorePaused && !engine.completed) openModal('pause');
setInterval(tick,200);setInterval(save,5000);
