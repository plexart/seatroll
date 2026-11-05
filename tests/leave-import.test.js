import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/data.js';
import { DEFAULT_SLOTS } from '../js/sessions.js';
import {
  buildOutputRows,
  columnWidths,
  decodeText,
  importedLeaves,
  leaveTableSvg,
  parseContacts,
  tableFromRows,
  titleDate,
} from '../scripts/lib/leave-import.mjs';

const SHEET = [
  ['11月14日留校自习学生信息收集-登记名单', '', '', '', '', '', ''],
  ['已登记：3人；未登记：0人', '', '', '', '', '', ''],
  ['请假时间段', '学生姓名', '', '登记状态', '提交人', '请假原因', '登记时间'],
  ['周六上午', '甲', 'x', '已登记', '甲爸爸', '理疗', '2026-11-05 14:30:03'],
  ['', '乙', 'x', '已登记', '乙妈妈', '', '2026-11-05 14:30:04'],
  ['周五晚上,周六上午', ' 丙 ', 'x', '已登记', '丙爸爸', '上课', '2026-11-05 14:30:05'],
  ['周五晚上', '', 'x', '', '', '', ''],
];

test('tableFromRows drops the first two rows and finds columns by header', () => {
  assert.deepEqual(tableFromRows(SHEET)[0], {
    请假时间段: '周六上午',
    学生姓名: '甲',
    登记状态: '已登记',
    提交人: '甲爸爸',
    请假原因: '理疗',
    登记时间: '2026-11-05 14:30:03',
  });
  assert.deepEqual(
    tableFromRows(SHEET).map((r) => r.学生姓名),
    ['甲', '乙', '丙'],
  );
  assert.throws(() => tableFromRows([[], [], ['学生姓名', '请假原因']]), /请假时间段/);
});

test('titleDate picks the year closest to today', () => {
  assert.equal(titleDate('11月14日留校自习', '2026-11-06'), '2026-11-14');
  assert.equal(titleDate('1月2日留校自习', '2026-12-28'), '2027-01-02');
  assert.equal(titleDate('12月30日', '2027-01-03'), '2026-12-30');
  assert.equal(titleDate('留校自习', '2026-11-06'), null);
});

test('parseContacts finds columns by header and handles BOM and quotes', () => {
  const text = decodeText(
    new TextEncoder().encode('﻿学号,学生姓名,家长手机号,性别\n1,"甲",138,女\n2,乙,"1,39",男\n'),
  );
  const contacts = parseContacts(text);
  assert.deepEqual(contacts.get('甲'), { gender: '女', phone: '138' });
  assert.deepEqual(contacts.get('乙'), { gender: '男', phone: '1,39' });
});

test('decodeText falls back to GBK', () => {
  assert.equal(decodeText(Buffer.from([0xd0, 0xd5, 0xc3, 0xfb])), '姓名');
});

test('buildOutputRows sorts by number of sessions, keeping sheet order for ties', () => {
  const rows = buildOutputRows(
    tableFromRows(SHEET),
    new Map([['丙', { gender: '男', phone: '1' }]]),
  );
  assert.deepEqual(rows, [
    {
      学生姓名: '丙',
      学生性别: '男',
      家长手机号: '1',
      请假时间段: '周五晚上,周六上午',
      请假原因: '上课',
    },
    { 学生姓名: '甲', 学生性别: '', 家长手机号: '', 请假时间段: '周六上午', 请假原因: '理疗' },
    { 学生姓名: '乙', 学生性别: '', 家长手机号: '', 请假时间段: '', 请假原因: '' },
  ]);
});

test('columnWidths fits the widest text, CJK counting double', () => {
  assert.deepEqual(
    columnWidths([
      ['姓名', 'a'],
      ['周五晚上,周六上午', 'abcdefghij'],
    ]),
    [{ wch: 19 }, { wch: 12 }],
  );
});

test('leaveTableSvg numbers the rows and escapes text', () => {
  const svg = leaveTableSvg('标题 <1>', [{ 学生姓名: '甲&乙', 请假时间段: '周六上午' }]);
  assert.match(svg, /序号/);
  assert.match(svg, /&lt;1&gt;/);
  assert.match(svg, /甲&amp;乙/);
  assert.match(svg, />1<\/text>/);
});

test('importedLeaves makes the sheet authoritative for the students it lists', () => {
  const slot = (id) => DEFAULT_SLOTS.find((s) => s.id === id);
  const sessions = [
    { date: '2026-11-13', slot: slot('eve') },
    { date: '2026-11-14', slot: slot('am') },
  ];
  const data = emptyData();
  data.leaves = [
    {
      date: '2026-11-13',
      slot: 'eve',
      students: [{ id: 'a', note: '旧' }, { id: 'x' }],
      updatedAt: 'T0',
    },
    { date: '2026-11-14', slot: 'am', students: [{ id: 'b', note: '病假' }], updatedAt: 'T0' },
  ];
  const entries = [
    { studentId: 'a', note: '理疗', sessionKeys: ['2026-11-14|am'] },
    { studentId: 'b', note: '病假', sessionKeys: ['2026-11-14|am'] },
    { studentId: 'c', note: '', sessionKeys: [] },
  ];
  assert.deepEqual(importedLeaves(data, sessions, entries, 'T1'), [
    { date: '2026-11-13', slot: 'eve', students: [{ id: 'x' }], updatedAt: 'T1' },
    {
      date: '2026-11-14',
      slot: 'am',
      students: [
        { id: 'b', note: '病假' },
        { id: 'a', note: '理疗' },
      ],
      updatedAt: 'T1',
    },
  ]);
  // Unchanged records are not returned.
  data.leaves = importedLeaves(data, sessions, entries, 'T1');
  assert.deepEqual(importedLeaves(data, sessions, entries, 'T2'), []);
});
