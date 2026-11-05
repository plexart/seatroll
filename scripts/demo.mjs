// Regenerates the demo class (data/demo.enc.json, password "demo") from made-up names.
// The repository must never contain real student names; real classes are created with
// `npm run new-class` and filled from the app.
import { assign, createChart, frontKey, mainKey, shiftRows } from '../js/chart.js';
import { emptyData } from '../js/data.js';
import { readClasses, writeClasses, writeClassData } from './lib/classes.mjs';

const CLASS = { id: 'demo', name: '示例班级', file: 'data/demo.enc.json' };
const PASSWORD = 'demo';
const STAMP = '2026-11-01T00:00:00.000Z';

// Deterministic pseudo-random generator (mulberry32) so reruns produce the same data.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = random(20261105);
const pick = (list) => list[Math.floor(rand() * list.length)];
const SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹苏潘葛范彭鲁马方任袁柳鲍史唐';
const GIVEN =
  '安然子涵若溪一航思远可馨嘉禾梓萱明轩雨桐景行书瑶浩宇诗琪俊熙晨曦沐阳星辰知予清越云舒北辰南乔亦凡时雨言蹊';

const names = new Set();
while (names.size < 50) {
  const given = rand() < 0.3 ? pick(GIVEN) : pick(GIVEN) + pick(GIVEN);
  if (given.length === 2 && given[0] === given[1]) continue;
  names.add(pick(SURNAMES) + given);
}

const data = emptyData();
data.students = [...names].map((name, i) => ({
  id: `s${String(i + 1).padStart(2, '0')}`,
  name,
  updatedAt: STAMP,
}));

let chart = createChart({
  id: 'chart-demo-1',
  effectiveFrom: '2026-09-01T00:00',
  rows: 6,
  cols: 8,
});
let i = 0;
for (const key of [frontKey(chart.podium - 1), frontKey(chart.podium + 1)]) {
  chart = assign(chart, key, data.students[i++].id).chart;
}
for (let r = 0; r < 6; r++) {
  for (let c = 0; c < 8; c++) chart = assign(chart, mainKey(r, c), data.students[i++].id).chart;
}
const second = {
  ...shiftRows(chart, 1),
  id: 'chart-demo-2',
  effectiveFrom: '2026-11-06T18:30',
};
data.seatCharts = [
  { ...chart, updatedAt: STAMP },
  { ...second, updatedAt: STAMP },
];

const leave = (date, slot, ids, note) => ({
  date,
  slot,
  students: ids.map((id) => (note ? { id, note } : { id })),
  updatedAt: STAMP,
});
data.leaves = [
  leave('2026-10-05', 'sat-am', ['s12']),
  leave('2026-10-30', 'fri-eve', ['s05', 's21'], '病假'),
  leave('2026-10-31', 'sat-am', ['s33']),
  leave('2026-10-31', 'sat-pm', ['s33']),
  leave('2026-11-06', 'fri-eve', ['s08', 's40'], '事假'),
  leave('2026-11-07', 'sat-am', ['s17']),
  leave('2026-11-07', 'sat-pm', ['s17', 's26']),
];

const record = (date, slot, marks) => ({ date, slot, marks, by: '示例家长', updatedAt: STAMP });
data.attendance = [
  record('2026-10-05', 'sat-am', {}),
  record('2026-10-30', 'fri-eve', { s14: 'absent', s21: 'presentOnLeave' }),
  record('2026-10-31', 'sat-am', {}),
  record('2026-10-31', 'sat-pm', { s44: 'absent' }),
];

await writeClassData(CLASS, data, PASSWORD);
writeClasses([CLASS, ...readClasses().filter((c) => c.id !== CLASS.id)]);
console.log(`Wrote ${CLASS.file} (${data.students.length} students, password "${PASSWORD}")`);
