import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCHEDULE as SCHEDULE,
  DEFAULT_SLOTS as SLOTS,
  defaultLeaveWeek,
  resolveSlot,
  weekSessions,
  weekStartDate,
} from '../js/sessions.js';

const slot = (date, time) => resolveSlot(SLOTS, SCHEDULE, date, time).id;

test('resolveSlot picks the regular slot of the day', () => {
  // 2026-11-06 is a Friday, 2026-11-07 a Saturday.
  assert.equal(slot('2026-11-06', '19:00'), 'eve');
  assert.equal(slot('2026-11-06', '09:00'), 'eve');
  assert.equal(slot('2026-11-07', '07:40'), 'am');
  assert.equal(slot('2026-11-07', '12:30'), 'am');
  assert.equal(slot('2026-11-07', '13:45'), 'pm');
});

test('resolveSlot uses the time of day on holiday make-up dates', () => {
  // 2026-10-05 is a Monday.
  assert.equal(slot('2026-10-05', '09:00'), 'am');
  assert.equal(slot('2026-10-05', '15:00'), 'pm');
  assert.equal(slot('2026-10-05', '20:00'), 'eve');
});

test('weekSessions lists Friday evening then Saturday sessions of the week', () => {
  const sessions = weekSessions(SLOTS, SCHEDULE, '2026-11-04').map((s) => `${s.date} ${s.slot.id}`);
  assert.deepEqual(sessions, ['2026-11-06 eve', '2026-11-07 am', '2026-11-07 pm']);
  assert.deepEqual(
    weekSessions(SLOTS, SCHEDULE, '2026-11-08').map((s) => s.date),
    ['2026-11-06', '2026-11-07', '2026-11-07'],
  );
});

test('defaultLeaveWeek moves to next week after the last session', () => {
  assert.equal(defaultLeaveWeek(SLOTS, SCHEDULE, '2026-11-07', '12:00'), '2026-11-07');
  assert.equal(defaultLeaveWeek(SLOTS, SCHEDULE, '2026-11-07', '17:00'), '2026-11-14');
  assert.equal(defaultLeaveWeek(SLOTS, SCHEDULE, '2026-11-08', '09:00'), '2026-11-15');
});

test('weekStartDate snaps any day of the week to its Friday', () => {
  for (const d of ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.equal(weekStartDate(SLOTS, SCHEDULE, d), '2026-11-06');
  }
  assert.equal(weekStartDate(SLOTS, [], '2026-11-05'), '2026-11-05');
});
