import { MOSAIC_DATA } from './mosaic-data.js';
import { CONTOUR_DATA } from './contour-data.js';
import { PARTY_DATA } from './party-data.js';
import { MAZE_DATA } from './maze-geometry.js';

export const LEVELS = [
  {
    ...MOSAIC_DATA,
    number: '01',
    title: '汪汪，集合！',
    subtitle: '14 只小狗，一个大大的拥抱。慢慢拼，快乐会自己找到位置。',
    difficulty: '轻松入门',
    saveKey: 'pawzzle-puppy-gathering-v2',
  },
  {
    ...CONTOUR_DATA,
    number: '02',
    title: '汪汪表情集',
    subtitle: '9 只小狗，拼出一个大大的拥抱。',
    difficulty: '轻松入门',
    saveKey: `pawzzle-${CONTOUR_DATA.id}-v1`,
  },
  {
    ...PARTY_DATA,
    number: '03',
    title: '汪汪游乐园',
    subtitle: '30 只小狗，30 种模样。毛茸茸的鼻尖、小爪和笑脸，拼成一个大拥抱。',
    difficulty: '趣味进阶',
    saveKey: `pawzzle-${PARTY_DATA.id}-v1`,
  },
  {
    ...MAZE_DATA,
    number: '04',
    title: '心有千千结',
    subtitle: '把弯弯绕绕的心事，拼成一颗完整的心。',
    difficulty: '耐心挑战',
    image: '/assets/heart-maze-v1/preview.svg',
    saveKey: `pawzzle-${MAZE_DATA.id}-v1`,
    snapThreshold: 12,
  },
];

// A stable URL lets every level retain its own progress and be shared directly.
const requestedLevel = new URLSearchParams(globalThis.location?.search ?? '').get('level');
export const LEVEL = LEVELS.find(level => level.number === requestedLevel) ?? LEVELS.at(-1);
export default LEVEL;
