// Shared vector artwork for the live game and the exported, self-contained SVG.
export function mazeDefs(prefix='maze') {
  return `<defs>
    <linearGradient id="${prefix}-ceramic" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset=".58" stop-color="#f2f5f3"/><stop offset="1" stop-color="#dfe7e3"/></linearGradient>
    <linearGradient id="${prefix}-pink" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#edb0c3"/><stop offset=".5" stop-color="#dfa0b5"/><stop offset="1" stop-color="#d58aa5"/></linearGradient>
    <linearGradient id="${prefix}-side" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#bf7892"/><stop offset="1" stop-color="#a95f7c"/></linearGradient>
    <filter id="${prefix}-board-shadow" x="-20%" y="-20%" width="150%" height="155%"><feDropShadow dx="3" dy="12" stdDeviation="9" flood-color="#6b5d56" flood-opacity=".19"/><feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#757a70" flood-opacity=".15"/></filter>
    <filter id="${prefix}-piece-shadow" x="-25%" y="-25%" width="160%" height="165%"><feDropShadow dx="2" dy="4" stdDeviation="2" flood-color="#7d4c61" flood-opacity=".23"/></filter>
  </defs>`;
}

export function mazePiece(piece, prefix='maze', shadow=true) {
  return `<g ${shadow?`filter="url(#${prefix}-piece-shadow)"`:''} pointer-events="none">
    <path d="${piece.path}" transform="translate(0 4)" fill="url(#${prefix}-side)" stroke="#ad6783" stroke-width=".65" stroke-linejoin="round"/>
    <path d="${piece.path}" fill="url(#${prefix}-pink)" stroke="#f4c7d4" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="${piece.path}" class="piece-edge" fill="none" stroke="#bb7b94" stroke-width=".55" stroke-linejoin="round"/>
  </g><path class="maze-hit" d="${piece.path}" fill="transparent" stroke="transparent" stroke-width="7" stroke-linejoin="round" pointer-events="all"/>`;
}

export function mazeBoard(level, prefix='maze', guides=false) {
  return `<path d="${level.outline}" transform="translate(0 6)" fill="#d4dfda" stroke="#ccd6d0" stroke-width="9" stroke-linejoin="round" filter="url(#${prefix}-board-shadow)"/>
    <path d="${level.outline}" fill="url(#${prefix}-ceramic)" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/>
    <path d="${level.outline}" fill="none" stroke="#d8e1dc" stroke-width=".7"/>
    ${guides?`<g id="maze-guides" fill="#d8d7d3" fill-opacity=".38" stroke="#c5c8c2" stroke-opacity=".55" stroke-width=".6">${level.pieces.map(p=>`<path d="${p.path}"/>`).join('')}</g>`:''}`;
}

export function mazeMarkers(level) {
  return [[level.startPoint,'#7b998d','起点'],[level.endPoint,'#be728f','终点']].map(([p,color,label])=>
    `<g><title>迷宫${label}</title><circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}"/><circle cx="${p[0]}" cy="${p[1]}" r="6" fill="none" stroke="${color}" stroke-width=".7" opacity=".7"/></g>`).join('');
}

export function mazeSolution(level) {
  return `<path d="${level.solutionPath}" fill="none" stroke="#517f70" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
}

export function mazePreview(level, {solution=false,prefix='preview-maze'}={}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="preview-art maze-preview" viewBox="0 0 600 600" role="img" aria-label="心形迷宫，24 块粉色墙体组成的完整拼图${solution?'，显示起点到终点的通路':''}">
    ${mazeDefs(prefix)}${mazeBoard(level,prefix)}
    ${level.pieces.map(piece=>mazePiece(piece,prefix)).join('')}
    ${solution?mazeSolution(level):''}${mazeMarkers(level)}
  </svg>`;
}
