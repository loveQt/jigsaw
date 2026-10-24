import { MOSAIC_DATA } from './mosaic-data.js';
import { CONTOUR_DATA } from './contour-data.js';

export const LEVELS = [
  {
    ...MOSAIC_DATA,
    number: '01',
    title: '汪汪，集合！',
    subtitle: '14 只小狗，一个大大的拥抱。慢慢拼，快乐会自己找到位置。',
    saveKey: 'pawzzle-puppy-gathering-v2',
  },
  {
    ...CONTOUR_DATA,
    number: '02',
    title: '汪汪表情集',
    subtitle: '9 只小狗，拼出一个大大的拥抱。',
    saveKey: `pawzzle-${CONTOUR_DATA.id}-v1`,
  },
];

// A stable URL lets both levels retain their own progress and be shared directly.
const requestedLevel = new URLSearchParams(globalThis.location?.search ?? '').get('level');
export const LEVEL = LEVELS.find(level => level.number === requestedLevel) ?? LEVELS[1];
export default LEVEL;
