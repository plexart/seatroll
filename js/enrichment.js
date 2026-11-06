// In-school enrichment classes (校内培优): some students leave the room for part of a session
// to attend a class elsewhere. The weekly roster is imported by the maintainer from the lesson
// ledger app (npm run import-enrichment) into data.enrichment:
//   [{ subject, weekday, start: 'HH:mm', end: 'HH:mm', students: [studentId] }]
// It is deliberately low-key: only the check-in screen shows it, and only while a class is on.
// Counts and reports ignore it.

import { minutes, weekdayOf } from './dates.js';

const TIME_RANGE = /^\s*(\d{1,2}):(\d{2})\s*[-~～—–]\s*(\d{1,2}):(\d{2})\s*$/;

const hhmm = (h, m) => `${h.padStart(2, '0')}:${m}`;

/** Parses '8:00-9:30' into { start: '08:00', end: '09:30' }, or null when malformed. */
export function parseTimeRange(text) {
  const m = TIME_RANGE.exec(String(text ?? ''));
  if (!m) return null;
  const start = hhmm(m[1], m[2]);
  const end = hhmm(m[3], m[4]);
  return minutes(start) < minutes(end) ? { start, end } : null;
}

/**
 * Builds data.enrichment from a lesson-ledger export ({ students: [{ name, subjects }],
 * subjects: [{ name, weekday, time }] }), matching names exactly against the active students.
 * Subjects without any student of this class are dropped. Throws on a malformed ledger.
 * Returns { enrichment, unknownNames }.
 */
export function enrichmentFromLedger(ledger, students) {
  if (!Array.isArray(ledger?.students) || !Array.isArray(ledger?.subjects)) {
    throw new Error('Not a lesson ledger export (needs students and subjects)');
  }
  const idByName = new Map(students.filter((s) => !s.archived).map((s) => [s.name, s.id]));
  const enrichment = ledger.subjects.map((s) => {
    const range = parseTimeRange(s?.time);
    if (
      typeof s?.name !== 'string' ||
      !Number.isInteger(s.weekday) ||
      s.weekday < 0 ||
      s.weekday > 6 ||
      !range
    ) {
      throw new Error(`Invalid subject ${JSON.stringify(s)}`);
    }
    return { subject: s.name, weekday: s.weekday, ...range, students: [] };
  });
  const bySubject = new Map(enrichment.map((e) => [e.subject, e]));
  const unknownNames = [];
  for (const s of ledger.students) {
    const id = idByName.get(String(s?.name ?? '').trim());
    if (!id) {
      unknownNames.push(String(s?.name ?? ''));
      continue;
    }
    for (const name of s.subjects ?? []) {
      const entry = bySubject.get(name);
      if (!entry) throw new Error(`Unknown subject "${name}" for a student`);
      if (!entry.students.includes(id)) entry.students.push(id);
    }
  }
  return { enrichment: enrichment.filter((e) => e.students.length), unknownNames };
}

const todays = (data, date) => (data.enrichment ?? []).filter((e) => e.weekday === weekdayOf(date));

/**
 * Students away at an enrichment class at `time` on `date` (start inclusive, end exclusive):
 * Map<studentId, { subject, start, end }>.
 */
export function activeEnrichment(data, date, time) {
  const t = minutes(time);
  const away = new Map();
  for (const e of todays(data, date)) {
    if (t < minutes(e.start) || t >= minutes(e.end)) continue;
    for (const id of e.students) away.set(id, { subject: e.subject, start: e.start, end: e.end });
  }
  return away;
}

/** The first enrichment start or end time on `date` after `time`, or null. */
export function nextBoundary(data, date, time) {
  const t = minutes(time);
  const times = todays(data, date)
    .flatMap((e) => [e.start, e.end])
    .filter((x) => minutes(x) > t)
    .sort((a, b) => minutes(a) - minutes(b));
  return times[0] ?? null;
}
