// Lesson time slots and how a moment in time maps to a session (date + slot).
// A slot is a time of day (morning, afternoon, evening). The regular weekly pattern is the
// schedule: which slots are held on which weekday. Holiday make-up lessons reuse the same
// slots on other dates.

import { addDays, minutes, weekdayOf } from './dates.js';

export const DEFAULT_SLOTS = [
  { id: 'am', start: '08:00', end: '12:00' },
  { id: 'pm', start: '14:00', end: '16:45' },
  { id: 'eve', start: '18:30', end: '22:00' },
];

/** Regular weekly sessions: Friday evening, Saturday morning and afternoon. */
export const DEFAULT_SCHEDULE = [
  { weekday: 5, slot: 'eve' },
  { weekday: 6, slot: 'am' },
  { weekday: 6, slot: 'pm' },
];

/** A session counts as current from this many minutes before it starts. */
const EARLY_MINUTES = 30;

export function sortSlots(slots) {
  return [...slots].sort((a, b) => minutes(a.start) - minutes(b.start));
}

export function sessionKey(date, slotId) {
  return `${date}|${slotId}`;
}

export function sessionStart(date, slot) {
  return `${date}T${slot.start}`;
}

// ---------------------------------------------------------------- the session list
// data.sessions lists every real session as { date, slot }. Only listed sessions can be
// checked in or have leave; the maintainer adds them with `npm run add-sessions`.

function bySessionOrder(slots) {
  const order = new Map(sortSlots(slots).map((s, i) => [s.id, i]));
  return (a, b) =>
    a.date === b.date
      ? (order.get(a.slot) ?? 99) - (order.get(b.slot) ?? 99)
      : a.date < b.date
        ? -1
        : 1;
}

/** Listed sessions within [from, to] (default all) in order, as { date, slot: slotObject }. */
export function listSessions(data, from = '0000-01-01', to = '9999-12-31') {
  const byId = new Map(data.slots.map((s) => [s.id, s]));
  return (data.sessions ?? [])
    .filter((s) => s.date >= from && s.date <= to && byId.has(s.slot))
    .sort(bySessionOrder(data.slots))
    .map((s) => ({ date: s.date, slot: byId.get(s.slot) }));
}

/**
 * The session to check in at a date and time: today's session whose window contains the
 * time, otherwise today's nearest, otherwise the next upcoming one, otherwise the last one.
 * `list` comes from listSessions. Returns null for an empty list.
 */
export function currentSession(list, date, time) {
  const t = minutes(time);
  let best = null;
  let bestDistance = Infinity;
  for (const s of list) {
    if (s.date !== date) continue;
    const start = minutes(s.slot.start) - EARLY_MINUTES;
    const end = minutes(s.slot.end);
    const distance = t < start ? start - t : t > end ? t - end : 0;
    if (distance < bestDistance) {
      best = s;
      bestDistance = distance;
    }
  }
  return best ?? list.find((s) => s.date > date) ?? list.at(-1) ?? null;
}

/** Date of the first listed session that has not ended yet, or `date` when there is none. */
export function nextSessionDate(list, date, time) {
  const next = list.find(
    (s) => s.date > date || (s.date === date && minutes(s.slot.end) >= minutes(time)),
  );
  return next?.date ?? date;
}

/**
 * Sessions on every date in [from, to]: the given slot ids, or the regular schedule of each
 * date's weekday when `slotIds` is empty. Returns [{ date, slot }].
 */
export function expandSessions(schedule, from, to, slotIds = []) {
  const result = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    const ids = slotIds.length
      ? slotIds
      : schedule.filter((e) => e.weekday === weekday).map((e) => e.slot);
    for (const slot of ids) result.push({ date, slot });
  }
  return result;
}

/**
 * The next week of regular sessions: those of the Monday-based week containing `date`, or of
 * the following week once its last regular session has ended. Returns [{ date, slot }].
 */
export function nextBatch(schedule, slots, date, time) {
  const byId = new Map(slots.map((s) => [s.id, s]));
  const week = (d) => {
    const monday = addDays(d, -((weekdayOf(d) + 6) % 7));
    return expandSessions(schedule, monday, addDays(monday, 6))
      .filter((s) => byId.has(s.slot))
      .sort(bySessionOrder(slots));
  };
  const sessions = week(date);
  const last = sessions.at(-1);
  if (!last) return [];
  const ended =
    date > last.date || (date === last.date && minutes(time) > minutes(byId.get(last.slot).end));
  return ended ? week(addDays(date, 7)) : sessions;
}

/** Adds sessions to a list. Returns { sessions (sorted), added, skipped }. */
export function addSessions(list, items, slots) {
  const keys = new Set(list.map((s) => sessionKey(s.date, s.slot)));
  const added = [];
  let skipped = 0;
  for (const { date, slot } of items) {
    const key = sessionKey(date, slot);
    if (keys.has(key)) {
      skipped++;
      continue;
    }
    keys.add(key);
    added.push({ date, slot });
  }
  return { sessions: [...list, ...added].sort(bySessionOrder(slots)), added, skipped };
}

/** Removes sessions from a list. Returns { sessions, removed, skipped }. */
export function removeSessions(list, items) {
  const drop = new Set(items.map((s) => sessionKey(s.date, s.slot)));
  const sessions = list.filter((s) => !drop.has(sessionKey(s.date, s.slot)));
  const removed = list.filter((s) => drop.has(sessionKey(s.date, s.slot)));
  return { sessions, removed, skipped: drop.size - removed.length };
}
