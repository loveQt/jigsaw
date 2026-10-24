// Generated after contour-guided site-imagegen artwork and exact contour clipping.
import { CONTOUR_GEOMETRY } from './contour-geometry.js';
const artwork = {
  "s01": {
    "name": "元气柴柴",
    "fill": "#dca35d"
  },
  "s02": {
    "name": "微笑金毛",
    "fill": "#e7c58b"
  },
  "s03": {
    "name": "温柔边牧",
    "fill": "#606f70"
  },
  "s04": {
    "name": "微笑哈士奇",
    "fill": "#8d9d9b"
  },
  "s05": {
    "name": "奶油西高地",
    "fill": "#ebdfc9"
  },
  "s06": {
    "name": "开心小柯基",
    "fill": "#d69a63"
  },
  "s07": {
    "name": "柯基歪头",
    "fill": "#cb8b56"
  },
  "s08": {
    "name": "困困小法斗",
    "fill": "#baa081"
  },
  "s09": {
    "name": "歪头小雪",
    "fill": "#82918b"
  }
};
export const CONTOUR_DATA = {
  id: 'dog-expressions-painted-v2',
  name: '汪汪表情集', width: 600, height: 600, pixelScale: 3,
  outline: CONTOUR_GEOMETRY.outline,
  image: '/assets/contour-dogs-v2.png',
  blueprint: '/assets/contour-blueprint.svg',
  pipeline: 'outline → nine natural contours → site-imagegen → exact contour clipping',
  pieces: CONTOUR_GEOMETRY.pieces.map(({points,edges,...piece}) => ({
    ...piece, ...artwork[piece.id], image: '/assets/contour-dogs-v2/' + piece.id + '.png',
  })),
};
export default CONTOUR_DATA;
