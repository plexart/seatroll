// Class data model, changeset merging and report aggregation. Pure functions shared by the
// app and the npm scripts.
//
// data = { version: 1, slots, students, seatCharts, leaves, attendance }
//   students:   [{ id, name, archived?, updatedAt }]
//   seatCharts: [chart (see chart.js)]
//   leaves:     [{ date, slot, students: [{ id, note? }], updatedAt }]
//   attendance: [{ date, slot, marks: { studentId: 'absent' | 'presentOnLeave' }, by?, updatedAt }]
//
// A changeset has the same collections (any subset) plus { type, classId }. Every record has
// an `updatedAt` ISO timestamp; merging keeps the newer record for each key.

import { seatKeys, getSeat } from './chart.js';
import { isDateStr, isTimestamp } from './dates.js';
import { DEFAULT_SLOTS, sessionKey, sessionStart, sortSlots } from './sessions.js';

export const CHANGESET_TYPE = 'seatroll-changeset';
export const COLLECTIONS = ['students', 'seatCharts', 'leaves', 'attendance'];

export function emptyData() {
  return {
    version: 1,
    slots: DEFAULT_SLOTS,
    students: [],
    seatCharts: [],
    leaves: [],
    attendance: [],
  };
}

export function emptyChangeset(classId) {
  return { type: CHANGESET_TYPE, classId };
}

/** Identity of a record within its collection. */
export function recordKey(collection, record) {
  return collection === 'leaves' || collection === 'attendance'
    ? sessionKey(record.date, record.slot)
    : record.id;
}

/**
 * Merges the collections of `source` into `target` (data or changeset), keeping the newer
 * record per key (ties go to the source). Returns { result, counts } where counts holds the
 * number of records added or replaced per collection.
 */
export function mergeInto(target, source) {
  const result = { ...target };
  const counts = {};
  for (const name of COLLECTIONS) {
    if (!source[name]?.length) continue;
    const byKey = new Map((target[name] ?? []).map((r) => [recordKey(name, r), r]));
    let n = 0;
    for (const record of source[name]) {
      const key = recordKey(name, record);
      const existing = byKey.get(key);
      if (existing && (existing.updatedAt ?? '') > (record.updatedAt ?? '')) continue;
      if (existing && JSON.stringify(existing) === JSON.stringify(record)) continue;
      byKey.set(key, record);
      n++;
    }
    result[name] = [...byKey.values()];
    if (n) counts[name] = n;
  }
  return { result, counts };
}

/** Drops overlay records that `base` already has at the same or a newer version. */
export function pruneOverlay(base, overlay) {
  const result = { ...overlay };
  for (const name of COLLECTIONS) {
    if (!overlay[name]) continue;
    const baseByKey = new Map((base[name] ?? []).map((r) => [recordKey(name, r), r]));
    result[name] = overlay[name].filter((r) => {
      const b = baseByKey.get(recordKey(name, r));
      return !b || (b.updatedAt ?? '') < (r.updatedAt ?? '');
    });
    if (!result[name].length) delete result[name];
  }
  return result;
}

export function countRecords(changeset) {
  return COLLECTIONS.reduce((n, name) => n + (changeset[name]?.length ?? 0), 0);
}

/** Keeps only the given collections of a changeset. */
export function pickCollections(changeset, names) {
  const result = { type: CHANGESET_TYPE, classId: changeset.classId };
  for (const name of names) if (changeset[name]?.length) result[name] = changeset[name];
  return result;
}

/**
 * Validates a changeset. Returns null when valid, otherwise an error code
 * ('notChangeset' | 'invalidRecord') used as an i18n key suffix.
 */
export function validateChangeset(obj) {
  if (!obj || obj.type !== CHANGESET_TYPE || typeof obj.classId !== 'string') return 'notChangeset';
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const checks = {
    students: (r) => isStr(r.id) && typeof r.name === 'string',
    seatCharts: (r) =>
      isStr(r.id) &&
      (r.deleted || (isTimestamp(r.effectiveFrom) && Array.isArray(r.seats) && r.front)),
    leaves: (r) => isDateStr(r.date) && isStr(r.slot) && Array.isArray(r.students),
    attendance: (r) => isDateStr(r.date) && isStr(r.slot) && r.marks && typeof r.marks === 'object',
  };
  for (const name of COLLECTIONS) {
    if (obj[name] === undefined) continue;
    if (!Array.isArray(obj[name]) || !obj[name].every((r) => r && checks[name](r))) {
      return 'invalidRecord';
    }
  }
  return null;
}

export function now() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------- queries

export function liveCharts(data) {
  return data.seatCharts
    .filter((c) => !c.deleted)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
}

/** The seat chart in effect at timestamp `at` ('YYYY-MM-DDTHH:mm'), or null. */
export function activeChart(data, at) {
  let found = null;
  for (const chart of liveCharts(data)) if (chart.effectiveFrom <= at) found = chart;
  return found;
}

export function studentMap(data) {
  return new Map(data.students.map((s) => [s.id, s]));
}

export function activeStudents(data) {
  return data.students
    .filter((s) => !s.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

/**
 * Parses leave rows copied from a spreadsheet: name, reason, sessions (e.g. "周五晚上,周六上午"),
 * tab-separated as Excel copies them (whitespace-separated also works). A header row (first cell
 * containing "姓名") and blank lines are skipped. `slotAliases` maps session words to slot ids;
 * an empty sessions cell means every shown session (slotIds: null).
 */
export function parseLeavePaste(text, students, slotAliases) {
  const byName = new Map(students.map((s) => [s.name, s.id]));
  const entries = [];
  const unknownNames = [];
  const unknownSlots = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.trim().split(/\s+/)).map((c) =>
      c
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .trim(),
    );
    const [name, note = '', ...rest] = cells;
    if (!name || name.includes('姓名')) continue;
    const id = byName.get(name);
    if (!id) {
      unknownNames.push(name);
      continue;
    }
    const words = rest
      .join(' ')
      .split(/[\s,，、;；/]+/)
      .filter(Boolean);
    let slotIds = null;
    if (words.length) {
      slotIds = [];
      for (const w of words) {
        const slot = slotAliases.get(w);
        if (slot) {
          if (!slotIds.includes(slot)) slotIds.push(slot);
        } else unknownSlots.push(w);
      }
      if (!slotIds.length) continue;
    }
    entries.push({ studentId: id, note, slotIds });
  }
  return {
    entries,
    unknownNames: [...new Set(unknownNames)],
    unknownSlots: [...new Set(unknownSlots)],
  };
}

/**
 * Leave records that add the parsed entries to the given sessions ({ date, slot }), keeping
 * everyone already on leave; a non-empty reason replaces the student's note.
 */
export function pastedLeaves(data, sessions, entries, updatedAt) {
  const changed = new Map();
  for (const session of sessions) {
    const adding = entries.filter((e) => !e.slotIds || e.slotIds.includes(session.slot.id));
    if (!adding.length) continue;
    const existing = findLeave(data, session.date, session.slot.id)?.students ?? [];
    const students = new Map(existing.map((s) => [s.id, s]));
    for (const { studentId, note } of adding) {
      const keep = students.get(studentId)?.note;
      const n = note || keep;
      students.set(studentId, n ? { id: studentId, note: n } : { id: studentId });
    }
    changed.set(`${session.date}|${session.slot.id}`, {
      date: session.date,
      slot: session.slot.id,
      students: [...students.values()],
      updatedAt,
    });
  }
  return [...changed.values()];
}

export function findSlot(data, slotId) {
  return data.slots.find((s) => s.id === slotId);
}

export function findLeave(data, date, slotId) {
  return data.leaves.find((l) => l.date === date && l.slot === slotId);
}

export function findAttendance(data, date, slotId) {
  return data.attendance.find((a) => a.date === date && a.slot === slotId);
}

/**
 * Everything about one session: the chart in effect, who is expected, on leave, absent, or
 * came despite leave. Student lists are arrays of { id, name, seat } (seat = key or null).
 */
export function sessionSummary(data, date, slotId) {
  const slot = findSlot(data, slotId);
  const chart = slot ? activeChart(data, sessionStart(date, slot)) : null;
  const students = studentMap(data);
  const seated = [];
  if (chart) {
    for (const key of seatKeys(chart)) {
      const id = getSeat(chart, key);
      if (id && students.has(id) && !students.get(id).archived) seated.push({ id, seat: key });
    }
  }
  const seatOf = new Map(seated.map((s) => [s.id, s.seat]));
  const entry = (id) => ({ id, name: students.get(id)?.name ?? '?', seat: seatOf.get(id) ?? null });
  const leave = findLeave(data, date, slotId);
  const leaveIds = new Set(leave?.students.map((s) => s.id) ?? []);
  const record = findAttendance(data, date, slotId);
  const marks = record?.marks ?? {};
  const expected = seated.filter((s) => !leaveIds.has(s.id)).map((s) => entry(s.id));
  const absent = expected.filter((s) => marks[s.id] === 'absent');
  const onLeave = [...leaveIds].map((id) => ({
    ...entry(id),
    note: leave.students.find((s) => s.id === id).note ?? '',
  }));
  const presentOnLeave = onLeave.filter((s) => marks[s.id] === 'presentOnLeave');
  return {
    date,
    slot,
    chart,
    record: record ?? null,
    expected,
    absent,
    onLeave,
    presentOnLeave,
    actualCount: expected.length - absent.length + presentOnLeave.length,
  };
}

/** Sessions (date + slot id) that have a check-in record or leaves within [from, to]. */
export function sessionsInRange(data, from, to) {
  const keys = new Map();
  for (const r of [...data.attendance, ...data.leaves]) {
    if (r.date >= from && r.date <= to && findSlot(data, r.slot)) {
      keys.set(sessionKey(r.date, r.slot), { date: r.date, slot: r.slot });
    }
  }
  const order = new Map(sortSlots(data.slots).map((s, i) => [s.id, i]));
  return [...keys.values()].sort((a, b) =>
    a.date === b.date ? order.get(a.slot) - order.get(b.slot) : a.date < b.date ? -1 : 1,
  );
}

/**
 * Per-student statistics over [from, to]. Presence and absence only count for sessions that
 * were checked in; leave counts for every session.
 */
export function rangeReport(data, from, to) {
  const sessions = sessionsInRange(data, from, to).map((s) => sessionSummary(data, s.date, s.slot));
  const stats = new Map(
    data.students.map((s) => [
      s.id,
      { id: s.id, name: s.name, present: 0, absent: 0, leave: 0, presentOnLeave: 0 },
    ]),
  );
  for (const s of sessions) {
    for (const st of s.onLeave) if (stats.has(st.id)) stats.get(st.id).leave++;
    if (!s.record) continue;
    const absent = new Set(s.absent.map((x) => x.id));
    for (const st of s.expected) {
      if (stats.has(st.id)) stats.get(st.id)[absent.has(st.id) ? 'absent' : 'present']++;
    }
    for (const st of s.presentOnLeave) if (stats.has(st.id)) stats.get(st.id).presentOnLeave++;
  }
  const students = [...stats.values()]
    .filter((s) => s.present + s.absent + s.leave > 0 || !studentMap(data).get(s.id).archived)
    .sort(
      (a, b) => b.absent - a.absent || b.leave - a.leave || a.name.localeCompare(b.name, 'zh-CN'),
    );
  return { sessions, students };
}

/** Leave records within [from, to] in session order, with student names. */
export function leaveOverview(data, from, to) {
  const students = studentMap(data);
  const sessions = sessionsInRange({ ...data, attendance: [] }, from, to);
  return sessions.flatMap(({ date, slot }) => {
    const leave = findLeave(data, date, slot);
    if (!leave.students.length) return [];
    return {
      date,
      slot: findSlot(data, slot),
      students: leave.students.map((s) => ({
        id: s.id,
        name: students.get(s.id)?.name ?? '?',
        note: s.note ?? '',
      })),
    };
  });
}
