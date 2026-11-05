import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assign, createChart, mainKey } from '../js/chart.js';
import {
  activeChart,
  checkedSessions,
  emptyData,
  leaveOverview,
  mergeInto,
  parseLeavePaste,
  pastedLeaves,
  pruneOverlay,
  rangeReport,
  sessionSummary,
  upgradeChangeset,
  upgradeData,
  validateChangeset,
} from '../js/data.js';
import { DEFAULT_SCHEDULE, DEFAULT_SLOTS } from '../js/sessions.js';

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
  data.sessions = [
    { date: '2026-11-06', slot: 'eve' },
    { date: '2026-11-07', slot: 'am' },
    { date: '2026-11-07', slot: 'pm' },
  ];
  data.leaves = [
    { date: '2026-11-06', slot: 'eve', students: [{ id: 's1', note: '病假' }], updatedAt: T1 },
  ];
  data.attendance = [
    {
      date: '2026-11-06',
      slot: 'eve',
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
  const s = sessionSummary(sampleData(), '2026-11-06', 'eve');
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
    attendance: [{ date: '2026-11-06', slot: 'eve', marks: {}, updatedAt: T2 }],
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

test('checkedSessions lists checked-in listed sessions newest first', () => {
  const data = sampleData();
  data.attendance.push(
    { date: '2026-11-07', slot: 'pm', marks: {}, updatedAt: T1 },
    { date: '2026-11-07', slot: 'gone', marks: {}, updatedAt: T1 },
    { date: '2026-11-07', slot: 'am', marks: {}, updatedAt: T1 },
    { date: '2026-11-08', slot: 'am', marks: {}, updatedAt: T1 }, // not listed
  );
  data.leaves.push({ date: '2026-11-09', slot: 'eve', students: [], updatedAt: T1 });
  assert.deepEqual(checkedSessions(data), [
    { date: '2026-11-07', slot: 'pm' },
    { date: '2026-11-07', slot: 'am' },
    { date: '2026-11-06', slot: 'eve' },
  ]);
});

test('rangeReport counts presence only for checked sessions', () => {
  const data = sampleData();
  data.leaves.push({ date: '2026-11-07', slot: 'am', students: [{ id: 's0' }], updatedAt: T1 });
  // Records for sessions that are not listed are left out.
  data.leaves.push({ date: '2026-11-14', slot: 'am', students: [{ id: 's3' }], updatedAt: T1 });
  data.attendance.push({ date: '2026-11-14', slot: 'am', marks: {}, updatedAt: T1 });
  const report = rangeReport(data, '2026-11-01', '2026-11-30');
  assert.equal(report.sessions.length, 2);
  const by = Object.fromEntries(report.students.map((s) => [s.id, s]));
  assert.deepEqual([by.s0.present, by.s0.leave], [1, 1]);
  assert.deepEqual([by.s2.absent, by.s2.present], [1, 0]);
  assert.deepEqual([by.s1.leave, by.s1.presentOnLeave], [1, 1]);
  assert.deepEqual([by.s3.leave, by.s3.present], [0, 1]);
});

test('leaveOverview lists non-empty leave records in range', () => {
  const data = sampleData();
  data.leaves.push({ date: '2026-11-07', slot: 'am', students: [], updatedAt: T1 });
  const overview = leaveOverview(data, '2026-11-01', '2026-11-30');
  assert.equal(overview.length, 1);
  assert.deepEqual(overview[0].students, [{ id: 's1', name: '乙', note: '病假' }]);
});

test('parseLeavePaste reads rows copied from a spreadsheet', () => {
  const students = [
    { id: 'a', name: '褚沐' },
    { id: 'b', name: '方可瑶' },
  ];
  const aliases = new Map([
    ['周五晚上', '2026-11-06|eve'],
    ['周六上午', '2026-11-07|am'],
    ['周六下午', '2026-11-07|pm'],
  ]);
  const text = [
    '学生姓名\t请假原因\t请假时间段',
    '褚沐\t上辅导班\t周五晚上,周六上午,周六下午',
    '方可瑶\t理疗\t周五晚上，周六下午',
    '',
    '王五\t病假\t周五晚上',
    '褚沐\t\t',
    '方可瑶\t\t周日上午、周六上午',
  ].join('\r\n');
  assert.deepEqual(parseLeavePaste(text, students, aliases), {
    entries: [
      {
        studentId: 'a',
        note: '上辅导班',
        sessionKeys: ['2026-11-06|eve', '2026-11-07|am', '2026-11-07|pm'],
      },
      { studentId: 'b', note: '理疗', sessionKeys: ['2026-11-06|eve', '2026-11-07|pm'] },
      { studentId: 'a', note: '', sessionKeys: null },
      { studentId: 'b', note: '', sessionKeys: ['2026-11-07|am'] },
    ],
    unknownNames: ['王五'],
    unknownSlots: ['周日上午'],
  });
  // Without tabs, cells split on whitespace.
  assert.deepEqual(parseLeavePaste('褚沐    理疗    周五晚上', students, aliases).entries, [
    { studentId: 'a', note: '理疗', sessionKeys: ['2026-11-06|eve'] },
  ]);
});

test('pastedLeaves adds to existing leaves and keeps notes unless replaced', () => {
  const data = sampleData();
  const sessions = [
    { date: '2026-11-06', slot: { id: 'eve' } },
    { date: '2026-11-07', slot: { id: 'am' } },
  ];
  const entries = [
    { studentId: 's1', note: '', sessionKeys: ['2026-11-06|eve'] },
    { studentId: 's2', note: '理疗', sessionKeys: null },
  ];
  assert.deepEqual(pastedLeaves(data, sessions, entries, T2), [
    {
      date: '2026-11-06',
      slot: 'eve',
      students: [
        { id: 's1', note: '病假' },
        { id: 's2', note: '理疗' },
      ],
      updatedAt: T2,
    },
    { date: '2026-11-07', slot: 'am', students: [{ id: 's2', note: '理疗' }], updatedAt: T2 },
  ]);
});

test('upgradeData renames version 1 slots and adds the schedule', () => {
  const v1 = {
    version: 1,
    slots: [{ id: 'fri-eve', weekday: 5, start: '18:30', end: '22:00' }],
    students: [],
    seatCharts: [],
    leaves: [{ date: '2026-11-07', slot: 'sat-pm', students: [], updatedAt: T1 }],
    attendance: [{ date: '2026-11-06', slot: 'fri-eve', marks: {}, updatedAt: T1 }],
  };
  const v2 = upgradeData(v1);
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.slots, DEFAULT_SLOTS);
  assert.deepEqual(v2.schedule, DEFAULT_SCHEDULE);
  assert.equal(v2.leaves[0].slot, 'pm');
  assert.equal(v2.attendance[0].slot, 'eve');
  assert.equal(upgradeData(v2), v2);
  assert.equal(v1.leaves[0].slot, 'sat-pm', 'input is not mutated');
});

test('upgradeChangeset renames version 1 slot ids and keeps the rest', () => {
  const cs = {
    type: 'seatroll-changeset',
    classId: 'x',
    leaves: [{ date: '2026-11-07', slot: 'sat-am', students: [], updatedAt: T1 }],
    attendance: [{ date: '2026-11-07', slot: 'pm', marks: {}, updatedAt: T1 }],
  };
  const up = upgradeChangeset(cs);
  assert.deepEqual([up.leaves[0].slot, up.attendance[0].slot], ['am', 'pm']);
  assert.deepEqual(upgradeChangeset(up), up);
  assert.equal(upgradeChangeset({ type: 'seatroll-changeset', classId: 'x' }).leaves, undefined);
});
