import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeEnrichment,
  enrichmentFromLedger,
  nextBoundary,
  parseTimeRange,
} from '../js/enrichment.js';

const students = [
  { id: 'a', name: '甲' },
  { id: 'b', name: '乙' },
  { id: 'c', name: '丙' },
  { id: 'd', name: '丁', archived: true },
];

const ledger = {
  students: [
    { name: '甲', subjects: ['物理A'] },
    { name: '乙', subjects: ['物理B', '语文'] },
    { name: '丙', subjects: ['物理A', '物理B'] },
    { name: '丁', subjects: ['物理A'] },
    { name: '外班', subjects: ['生物'] },
  ],
  subjects: [
    { name: '物理A', weekday: 5, time: '18:30-20:00' },
    { name: '物理B', weekday: 5, time: '20:30-22:00' },
    { name: '生物', weekday: 5, time: '18:30-20:00' },
    { name: '语文', weekday: 6, time: '8:00-9:30' },
  ],
};

const FRI = '2026-11-06';
const SAT = '2026-11-07';

test('parseTimeRange', () => {
  assert.deepEqual(parseTimeRange('8:00-9:30'), { start: '08:00', end: '09:30' });
  assert.deepEqual(parseTimeRange(' 20:30 ~ 22:00 '), { start: '20:30', end: '22:00' });
  assert.equal(parseTimeRange('22:00-20:00'), null);
  assert.equal(parseTimeRange('evening'), null);
});

test('enrichmentFromLedger maps names and drops empty subjects', () => {
  const { enrichment, unknownNames } = enrichmentFromLedger(ledger, students);
  assert.deepEqual(unknownNames, ['丁', '外班']);
  assert.deepEqual(enrichment, [
    { subject: '物理A', weekday: 5, start: '18:30', end: '20:00', students: ['a', 'c'] },
    { subject: '物理B', weekday: 5, start: '20:30', end: '22:00', students: ['b', 'c'] },
    { subject: '语文', weekday: 6, start: '08:00', end: '09:30', students: ['b'] },
  ]);
});

test('enrichmentFromLedger rejects malformed input', () => {
  assert.throws(() => enrichmentFromLedger({}, students));
  assert.throws(() =>
    enrichmentFromLedger(
      { students: [], subjects: [{ name: 'x', weekday: 9, time: '8:00-9:00' }] },
      students,
    ),
  );
  assert.throws(() =>
    enrichmentFromLedger({ students: [{ name: '甲', subjects: ['?'] }], subjects: [] }, students),
  );
});

test('activeEnrichment follows the clock within a session', () => {
  const data = { enrichment: enrichmentFromLedger(ledger, students).enrichment };
  const away = (date, time) => [...activeEnrichment(data, date, time).keys()].sort();
  assert.deepEqual(away(FRI, '18:20'), []);
  assert.deepEqual(away(FRI, '18:30'), ['a', 'c']);
  assert.deepEqual(away(FRI, '18:40'), ['a', 'c']);
  assert.deepEqual(away(FRI, '20:00'), []);
  assert.deepEqual(away(FRI, '20:10'), []);
  assert.deepEqual(away(FRI, '20:40'), ['b', 'c']);
  assert.deepEqual(away(FRI, '22:00'), []);
  assert.deepEqual(away(SAT, '08:30'), ['b']);
  assert.deepEqual(away('2026-11-05', '18:40'), []);
  assert.deepEqual(activeEnrichment(data, FRI, '18:40').get('a'), {
    subject: '物理A',
    start: '18:30',
    end: '20:00',
  });
});

test('nextBoundary', () => {
  const data = { enrichment: enrichmentFromLedger(ledger, students).enrichment };
  assert.equal(nextBoundary(data, FRI, '12:00'), '18:30');
  assert.equal(nextBoundary(data, FRI, '18:30'), '20:00');
  assert.equal(nextBoundary(data, FRI, '20:10'), '20:30');
  assert.equal(nextBoundary(data, FRI, '22:00'), null);
});

test('missing data.enrichment', () => {
  assert.equal(activeEnrichment({}, FRI, '18:40').size, 0);
  assert.equal(nextBoundary({}, FRI, '18:40'), null);
});
