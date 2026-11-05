import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLOTS,
  defaultLeaveWeek,
  resolveSlot,
  weekSessions,
  weekStartDate,
} from '../js/sessions.js';

const slot = (date, time) => resolveSlot(DEFAULT_SLOTS, date, time).id;

test('resolveSlot picks the regular slot of the day', () => {
  // 2026-11-06 is a Friday, 2026-11-07 a Saturday.
  assert.equal(slot('2026-11-06', '19:00'), 'fri-eve');
  assert.equal(slot('2026-11-06', '09:00'), 'fri-eve');
  assert.equal(slot('2026-11-07', '07:40'), 'sat-am');
  assert.equal(slot('2026-11-07', '12:30'), 'sat-am');
  assert.equal(slot('2026-11-07', '13:45'), 'sat-pm');
});

test('resolveSlot uses the time of day on holiday make-up dates', () => {
  // 2026-10-05 is a Monday.
  assert.equal(slot('2026-10-05', '09:00'), 'sat-am');
  assert.equal(slot('2026-10-05', '15:00'), 'sat-pm');
  assert.equal(slot('2026-10-05', '20:00'), 'fri-eve');
});

test('weekSessions lists Friday evening then Saturday sessions of the week', () => {
  const sessions = weekSessions(DEFAULT_SLOTS, '2026-11-04').map((s) => `${s.date} ${s.slot.id}`);
  assert.deepEqual(sessions, ['2026-11-06 fri-eve', '2026-11-07 sat-am', '2026-11-07 sat-pm']);
  assert.deepEqual(
    weekSessions(DEFAULT_SLOTS, '2026-11-08').map((s) => s.date),
    ['2026-11-06', '2026-11-07', '2026-11-07'],
  );
});

test('defaultLeaveWeek moves to next week after the last session', () => {
  assert.equal(defaultLeaveWeek(DEFAULT_SLOTS, '2026-11-07', '12:00'), '2026-11-07');
  assert.equal(defaultLeaveWeek(DEFAULT_SLOTS, '2026-11-07', '17:00'), '2026-11-14');
  assert.equal(defaultLeaveWeek(DEFAULT_SLOTS, '2026-11-08', '09:00'), '2026-11-15');
});

test('weekStartDate snaps any day of the week to its Friday', () => {
  for (const d of ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.equal(weekStartDate(DEFAULT_SLOTS, d), '2026-11-06');
  }
  assert.equal(weekStartDate([], '2026-11-05'), '2026-11-05');
});
