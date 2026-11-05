import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSessions,
  currentSession,
  expandSessions,
  listSessions,
  nextBatch,
  nextSessionDate,
  removeSessions,
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

const keys = (list) =>
  list.map((s) => `${s.date} ${typeof s.slot === 'string' ? s.slot : s.slot.id}`);

test('expandSessions uses the schedule, or the given slots on every date', () => {
  assert.deepEqual(keys(expandSessions(SCHEDULE, '2026-11-02', '2026-11-08')), [
    '2026-11-06 eve',
    '2026-11-07 am',
    '2026-11-07 pm',
  ]);
  assert.deepEqual(keys(expandSessions(SCHEDULE, '2026-10-05', '2026-10-06', ['am'])), [
    '2026-10-05 am',
    '2026-10-06 am',
  ]);
});

test('nextBatch is this week until its last session has ended', () => {
  const batch = (date, time) => keys(nextBatch(SCHEDULE, SLOTS, date, time));
  const thisWeek = ['2026-11-06 eve', '2026-11-07 am', '2026-11-07 pm'];
  assert.deepEqual(batch('2026-11-02', '09:00'), thisWeek);
  assert.deepEqual(batch('2026-11-07', '16:45'), thisWeek);
  assert.deepEqual(batch('2026-11-07', '17:00'), [
    '2026-11-13 eve',
    '2026-11-14 am',
    '2026-11-14 pm',
  ]);
  assert.deepEqual(batch('2026-11-08', '09:00'), [
    '2026-11-13 eve',
    '2026-11-14 am',
    '2026-11-14 pm',
  ]);
  assert.deepEqual(nextBatch([], SLOTS, '2026-11-02', '09:00'), []);
});

test('addSessions sorts, skips listed sessions; removeSessions reports what it dropped', () => {
  const { sessions, added, skipped } = addSessions(
    [{ date: '2026-11-07', slot: 'pm' }],
    [
      { date: '2026-11-07', slot: 'pm' },
      { date: '2026-11-07', slot: 'am' },
      { date: '2026-11-06', slot: 'eve' },
    ],
    SLOTS,
  );
  assert.deepEqual(keys(sessions), ['2026-11-06 eve', '2026-11-07 am', '2026-11-07 pm']);
  assert.equal(added.length, 2);
  assert.equal(skipped, 1);
  const removed = removeSessions(sessions, [
    { date: '2026-11-07', slot: 'am' },
    { date: '2026-11-08', slot: 'am' },
  ]);
  assert.deepEqual(keys(removed.sessions), ['2026-11-06 eve', '2026-11-07 pm']);
  assert.deepEqual(keys(removed.removed), ['2026-11-07 am']);
  assert.equal(removed.skipped, 1);
});

test('listSessions resolves slots, filters by date and drops unknown slots', () => {
  const data = {
    slots: SLOTS,
    sessions: [
      { date: '2026-11-07', slot: 'pm' },
      { date: '2026-11-06', slot: 'eve' },
      { date: '2026-11-07', slot: 'gone' },
      { date: '2026-11-14', slot: 'am' },
    ],
  };
  assert.deepEqual(keys(listSessions(data)), ['2026-11-06 eve', '2026-11-07 pm', '2026-11-14 am']);
  assert.deepEqual(keys(listSessions(data, '2026-11-07', '2026-11-08')), ['2026-11-07 pm']);
  assert.equal(listSessions(data)[0].slot.start, '18:30');
  assert.deepEqual(listSessions({ slots: SLOTS }), []);
});

test('currentSession prefers today, then the next session, then the last one', () => {
  const list = listSessions({
    slots: SLOTS,
    sessions: [
      { date: '2026-11-06', slot: 'eve' },
      { date: '2026-11-07', slot: 'am' },
      { date: '2026-11-07', slot: 'pm' },
    ],
  });
  const at = (date, time) => {
    const s = currentSession(list, date, time);
    return s && `${s.date} ${s.slot.id}`;
  };
  assert.equal(at('2026-11-06', '18:05'), '2026-11-06 eve', 'early arrival');
  assert.equal(at('2026-11-06', '22:30'), '2026-11-06 eve', 'just after the end');
  assert.equal(at('2026-11-07', '12:30'), '2026-11-07 am');
  assert.equal(at('2026-11-07', '13:45'), '2026-11-07 pm');
  assert.equal(at('2026-11-05', '20:00'), '2026-11-06 eve', 'no session today');
  assert.equal(at('2026-11-09', '09:00'), '2026-11-07 pm', 'after the last one');
  assert.equal(currentSession([], '2026-11-06', '19:00'), null);
});

test('nextSessionDate finds the first session that has not ended', () => {
  const list = listSessions({
    slots: SLOTS,
    sessions: [
      { date: '2026-11-07', slot: 'pm' },
      { date: '2026-11-14', slot: 'am' },
    ],
  });
  assert.equal(nextSessionDate(list, '2026-11-03', '09:00'), '2026-11-07');
  assert.equal(nextSessionDate(list, '2026-11-07', '16:00'), '2026-11-07');
  assert.equal(nextSessionDate(list, '2026-11-07', '17:00'), '2026-11-14');
  assert.equal(nextSessionDate(list, '2026-11-20', '09:00'), '2026-11-20');
});
