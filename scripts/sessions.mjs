// Adds or removes sessions in the session list of one class or all classes. Only listed
// sessions can be checked in or have leave in the app.
// Usage:
//   npm run add-sessions -- [classId] [<date>[..<date>]] [slotId ...]
//   npm run remove-sessions -- [classId] <date>[..<date>] [slotId ...]
// Without a class, every class in data/classes.json. Without a date, the next week of regular
// sessions (this week until its last session has ended). To add, a date or range without slot
// ids means the regular schedule of each date's weekday; with slot ids, those slots on every
// date (e.g. holiday make-up lessons). To remove, a date or range without slot ids removes
// every listed session on those dates.
import { readFileSync } from 'node:fs';
import { findLeave, findAttendance } from '../js/data.js';
import { isDateStr, parseDate, toDateStr, toTimeStr, weekdayOf } from '../js/dates.js';
import { addSessions, expandSessions, nextBatch, removeSessions } from '../js/sessions.js';
import { getPassword } from './lib/env.mjs';
import { ROOT, findClass, readClassData, readClasses, writeClassData } from './lib/classes.mjs';

const USAGE = [
  'Usage:',
  '  npm run add-sessions -- [classId] [<date>[..<date>]] [slotId ...]',
  '  npm run remove-sessions -- [classId] <date>[..<date>] [slotId ...]',
  'Examples:',
  '  npm run add-sessions                                # next week, all classes',
  '  npm run add-sessions -- g3-23 2026-11-06..2027-01-23  # regular sessions in a range',
  '  npm run add-sessions -- 2026-12-31 am pm            # make-up day, all classes',
].join('\n');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const locale = JSON.parse(readFileSync(new URL('locales/zh-CN.json', ROOT), 'utf8'));
const validDate = (d) => isDateStr(d) && toDateStr(parseDate(d)) === d;
const RANGE = /^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/;

const [command, ...args] = process.argv.slice(2);
if (command !== 'add' && command !== 'remove') fail(USAGE);

let classIds = readClasses().map((c) => c.id);
if (args.length && !RANGE.test(args[0])) {
  const id = args.shift();
  if (!classIds.includes(id)) fail(`Unknown class "${id}" (see data/classes.json)`);
  classIds = [id];
}
let range = null;
if (args.length && RANGE.test(args[0])) {
  const [, from, to = from] = args.shift().match(RANGE);
  if (!validDate(from) || !validDate(to) || from > to) fail(`Invalid date range ${from}..${to}`);
  range = { from, to };
}
const slotIds = args;
if (slotIds.length && !range) fail(`Slot ids need a date.\n${USAGE}`);
if (!range && command === 'remove') fail(`remove-sessions needs a date.\n${USAGE}`);

const describe = (data, s) => {
  const slot = data.slots.find((x) => x.id === s.slot);
  const part = locale.slotParts[s.slot] ?? s.slot;
  return `${s.date} ${locale.weekdays[weekdayOf(s.date)]}${part} (${s.slot} ${slot.start}–${slot.end})`;
};

const now = new Date();
for (const classId of classIds) {
  const cls = findClass(classId);
  const password = await getPassword(classId);
  const data = await readClassData(cls, password);
  const unknown = slotIds.filter((id) => !data.slots.some((s) => s.id === id));
  if (unknown.length) {
    fail(
      `${classId}: unknown slot ${unknown.join(', ')} (slots: ${data.slots.map((s) => s.id).join(', ')})`,
    );
  }
  const list = data.sessions ?? [];
  const inRange = (s) => s.date >= range.from && s.date <= range.to;
  const items =
    command === 'remove' && !slotIds.length
      ? list.filter(inRange) // every listed session on those dates
      : range
        ? expandSessions(data.schedule, range.from, range.to, slotIds)
        : nextBatch(data.schedule, data.slots, toDateStr(now), toTimeStr(now));

  let sessions;
  if (command === 'add') {
    const result = addSessions(list, items, data.slots);
    sessions = result.sessions;
    console.log(`${classId}: added ${result.added.length}, already listed ${result.skipped}`);
    for (const s of result.added) console.log(`  + ${describe(data, s)}`);
    if (!result.added.length) continue;
  } else {
    const result = removeSessions(list, items);
    sessions = result.sessions;
    console.log(`${classId}: removed ${result.removed.length}, not listed ${result.skipped}`);
    for (const s of result.removed) {
      const records = [
        findLeave(data, s.date, s.slot) && 'leave',
        findAttendance(data, s.date, s.slot) && 'check-in',
      ].filter(Boolean);
      const note = records.length ? `  (has ${records.join(' and ')}; kept but hidden)` : '';
      console.log(`  - ${describe(data, s)}${note}`);
    }
    if (!result.removed.length) continue;
  }
  await writeClassData(cls, { ...data, sessions }, password);
  console.log(`  Wrote ${cls.file}; commit and push it to publish the sessions.`);
}
