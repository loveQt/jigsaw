const paths = {
  paw: '<ellipse cx="5.5" cy="8" rx="2.5" ry="3.5" transform="rotate(-24 5.5 8)"/><ellipse cx="12" cy="5" rx="2.3" ry="3.3"/><ellipse cx="18.5" cy="8" rx="2.5" ry="3.5" transform="rotate(24 18.5 8)"/><path d="M5 18c0-4 4-8 7-8s7 4 7 8c0 4-5 3-7 2-2 1-7 2-7-2Z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  puzzle: '<path d="M9 3H4v6c5-2 5 5 0 3v8h6c-2-5 5-5 3 0h7v-7c-5 2-5-5 0-3V4h-7c2-5-5-5-3 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
  leaf: '<path d="M19 4C8 3 2 9 6 16s15 1 13-12ZM5 20l10-11"/>',
  'sound-off': '<path d="M11 5 6 9H3v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 4 1 9 8 14 7-5 12-10 8-14Z"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v5c0 4-2 6-6 6-3 0-5-2-7-4l-4-5a2 2 0 0 1 3-2l2 1Z"/>',
  magnet: '<path d="M4 4v9a8 8 0 0 0 16 0V4h-5v9a3 3 0 0 1-6 0V4ZM4 8h5m6 0h5"/>',
  shuffle: '<path d="M3 6h3c5 0 6 12 11 12h4m-4-3 4 3-4 3M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-3 4 3-4 3"/>',
  bulb: '<path d="M9 18h6m-6 3h6M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2ZM12 2V0M3 4 1 2m20 2 2-2"/>',
  restart: '<path d="M3 10a9 9 0 1 1 1 7M3 3v7h7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
export function icon(name, className='') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="${name==='paw'?'currentColor':'none'}" stroke="${name==='paw'?'none':'currentColor'}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.paw}</svg>`;
}
export function hydrateIcons(root=document) {root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));}
