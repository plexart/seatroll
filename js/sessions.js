// Lesson time slots and how a moment in time maps to a session (date + slot).
// Regular lessons happen on the slot's weekday; holiday make-up lessons reuse the same
// slots on arbitrary dates, so every function also works for dates without a regular slot.

import { addDays, minutes, weekdayOf } from './dates.js';

export const DEFAULT_SLOTS = [
  { id: 'fri-eve', weekday: 5, start: '18:30', end: '22:00' },
  { id: 'sat-am', weekday: 6, start: '08:00', end: '12:00' },
  { id: 'sat-pm', weekday: 6, start: '14:00', end: '16:45' },
];

/** A session counts as current from this many minutes before it starts. */
const EARLY_MINUTES = 30;

export function sortSlots(slots) {
  return [...slots].sort((a, b) => minutes(a.start) - minutes(b.start));
}

/**
 * Picks the slot for a date and time: slots on that weekday are preferred (all slots on other
 * days, e.g. holiday make-up lessons); the slot whose window contains the time wins, otherwise
 * the nearest one.
 */
export function resolveSlot(slots, date, time) {
  const weekday = weekdayOf(date);
  const sameDay = slots.filter((s) => s.weekday === weekday);
  const candidates = sameDay.length ? sameDay : slots;
  const t = minutes(time);
  let best = null;
  let bestDistance = Infinity;
  for (const slot of candidates) {
    const start = minutes(slot.start) - EARLY_MINUTES;
    const end = minutes(slot.end);
    const distance = t < start ? start - t : t > end ? t - end : 0;
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

/** Sessions of the Monday-based week containing `date`, one per regular slot, in time order. */
export function weekSessions(slots, date) {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return slots
    .map((slot) => ({ date: addDays(monday, (slot.weekday + 6) % 7), slot }))
    .sort((a, b) =>
      a.date === b.date ? minutes(a.slot.start) - minutes(b.slot.start) : a.date < b.date ? -1 : 1,
    );
}

/** Date of the first regular session in the week containing `date` (Friday by default). */
export function weekStartDate(slots, date) {
  return weekSessions(slots, date)[0]?.date ?? date;
}

/** All slots held on one date (used for holiday make-up days). */
export function daySessions(slots, date) {
  return sortSlots(slots).map((slot) => ({ date, slot }));
}

/**
 * The date whose week to show by default in the leave editor: this week until its last
 * session has ended, then next week.
 */
export function defaultLeaveWeek(slots, date, time) {
  const sessions = weekSessions(slots, date);
  const last = sessions.at(-1);
  if (!last) return date;
  const ended = date > last.date || (date === last.date && minutes(time) > minutes(last.slot.end));
  return ended ? addDays(date, 7) : date;
}

export function sessionKey(date, slotId) {
  return `${date}|${slotId}`;
}

export function sessionStart(date, slot) {
  return `${date}T${slot.start}`;
}
