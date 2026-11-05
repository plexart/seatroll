import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assign, createChart, mainKey } from '../js/chart.js';
import {
  activeChart,
  emptyData,
  leaveOverview,
  mergeInto,
  pruneOverlay,
  rangeReport,
  sessionSummary,
  validateChangeset,
} from '../js/data.js';

const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';

function sampleData() {
  const data = emptyData();
  data.students = ['甲', '乙', '丙', '丁'].map((name, i) => ({ id: `s${i}`, name, updatedAt: T1 }));
  let chart = createChart({ id: 'c1', effectiveFrom: '2026-09-01T00:00', rows: 1, cols: 4 });
  data.students.forEach((s, i) => {
    chart = assign(chart, mainKey(0, i), s.id).chart;
  });
  data.seatCharts = [{ ...chart, updatedAt: T1 }];
  data.leaves = [
    { date: '2026-11-06', slot: 'fri-eve', students: [{ id: 's1', note: '病假' }], updatedAt: T1 },
  ];
  data.attendance = [
    {
      date: '2026-11-06',
      slot: 'fri-eve',
      marks: { s2: 'absent', s1: 'presentOnLeave' },
      updatedAt: T1,
    },
  ];
  return data;
}

test('activeChart picks the latest chart in effect and ignores deleted ones', () => {
  const data = sampleData();
  data.seatCharts.push({ ...data.seatCharts[0], id: 'c2', effectiveFrom: '2026-11-06T18:30' });
  assert.equal(activeChart(data, '2026-11-06T18:00').id, 'c1');
  assert.equal(activeChart(data, '2026-11-06T18:30').id, 'c2');
  assert.equal(activeChart(data, '2026-08-01T00:00'), null);
  data.seatCharts[1] = { id: 'c2', deleted: true, updatedAt: T2 };
  assert.equal(activeChart(data, '2026-12-01T00:00').id, 'c1');
});

test('sessionSummary combines chart, leave and check-in marks', () => {
  const s = sessionSummary(sampleData(), '2026-11-06', 'fri-eve');
  assert.deepEqual(
    s.expected.map((x) => x.id),
    ['s0', 's2', 's3'],
  );
  assert.deepEqual(
    s.absent.map((x) => x.id),
    ['s2'],
  );
  assert.deepEqual(
    s.onLeave.map((x) => [x.id, x.note]),
    [['s1', '病假']],
  );
  assert.deepEqual(
    s.presentOnLeave.map((x) => x.id),
    ['s1'],
  );
  assert.equal(s.actualCount, 3);
});

test('mergeInto keeps the newer record per key and counts changes', () => {
  const data = sampleData();
  const { result, counts } = mergeInto(data, {
    type: 'seatroll-changeset',
    classId: 'x',
    students: [
      { id: 's0', name: '甲改', updatedAt: T2 },
      { id: 's1', name: '旧', updatedAt: '2026-10-01T00:00:00.000Z' },
      { id: 's9', name: '新', updatedAt: T2 },
    ],
    attendance: [{ date: '2026-11-06', slot: 'fri-eve', marks: {}, updatedAt: T2 }],
  });
  assert.deepEqual(counts, { students: 2, attendance: 1 });
  assert.equal(result.students.find((s) => s.id === 's0').name, '甲改');
  assert.equal(result.students.find((s) => s.id === 's1').name, '乙');
  assert.deepEqual(result.attendance[0].marks, {});
  assert.equal(data.students[0].name, '甲', 'input is not mutated');
});

test('pruneOverlay drops records the data file already has', () => {
  const data = sampleData();
  const overlay = {
    type: 'seatroll-changeset',
    classId: 'x',
    students: [{ ...data.students[0] }, { id: 's1', name: '乙改', updatedAt: T2 }],
  };
  assert.deepEqual(
    pruneOverlay(data, overlay).students.map((s) => s.id),
    ['s1'],
  );
  assert.equal(
    pruneOverlay(data, { ...overlay, students: [data.students[0]] }).students,
    undefined,
  );
});

test('validateChangeset', () => {
  assert.equal(validateChangeset({}), 'notChangeset');
  assert.equal(validateChangeset({ type: 'seatroll-changeset', classId: 'x' }), null);
  assert.equal(
    validateChangeset({
      type: 'seatroll-changeset',
      classId: 'x',
      leaves: [{ date: 'bad', slot: 'a', students: [] }],
    }),
    'invalidRecord',
  );
});

test('rangeReport counts presence only for checked sessions', () => {
  const data = sampleData();
  data.leaves.push({ date: '2026-11-07', slot: 'sat-am', students: [{ id: 's0' }], updatedAt: T1 });
  const report = rangeReport(data, '2026-11-01', '2026-11-30');
  assert.equal(report.sessions.length, 2);
  const by = Object.fromEntries(report.students.map((s) => [s.id, s]));
  assert.deepEqual([by.s0.present, by.s0.leave], [1, 1]);
  assert.deepEqual([by.s2.absent, by.s2.present], [1, 0]);
  assert.deepEqual([by.s1.leave, by.s1.presentOnLeave], [1, 1]);
});

test('leaveOverview lists non-empty leave records in range', () => {
  const data = sampleData();
  data.leaves.push({ date: '2026-11-07', slot: 'sat-am', students: [], updatedAt: T1 });
  const overview = leaveOverview(data, '2026-11-01', '2026-11-30');
  assert.equal(overview.length, 1);
  assert.deepEqual(overview[0].students, [{ id: 's1', name: '乙', note: '病假' }]);
});
