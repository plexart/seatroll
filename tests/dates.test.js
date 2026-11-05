import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, weekRange } from '../js/dates.js';

test('monthRange covers the whole month and steps across years', () => {
  assert.deepEqual(monthRange('2026-11-05'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(monthRange('2026-12-31', 1), { from: '2027-01-01', to: '2027-01-31' });
  assert.deepEqual(monthRange('2026-01-15', -1), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(monthRange('2028-03-31', -1), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthRange('2027-02-10'), { from: '2027-02-01', to: '2027-02-28' });
});

test('weekRange runs Monday to Sunday and steps across months', () => {
  assert.deepEqual(weekRange('2026-11-05'), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(weekRange('2026-11-08'), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(weekRange('2026-11-02', -1), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(weekRange('2026-12-30', 1), { from: '2027-01-04', to: '2027-01-10' });
});
