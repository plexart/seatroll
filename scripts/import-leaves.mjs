// Imports leave from the sheet exported by the sign-up form (.xls/.xlsx): writes a tidied
// spreadsheet and a PNG of the students on leave to exports/, and updates the leave records of
// that week's sessions in the encrypted class data.
// Usage: npm run import-leaves -- <classId> <file.xls> [--date YYYY-MM-DD] [--csv <path>]
//
// Gender and parent phone come from private/<classId>.students.csv (gitignored; columns found
// by headers containing 姓名, 性别 and 手机/电话), matched by student name. The week is the one
// of the date in the sheet's title ("11月14日…"), or of --date.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { Resvg } from '@resvg/resvg-js';
import * as XLSX from 'xlsx';
import { activeStudents, now, sessionAliases } from '../js/data.js';
import { isDateStr, toDateStr, weekRange } from '../js/dates.js';
import { sessionName } from '../js/format.js';
import { setMessages } from '../js/i18n.js';
import { listSessions, sessionKey } from '../js/sessions.js';
import { getPassword } from './lib/env.mjs';
import { ROOT, findClass, readClassData, writeClassData } from './lib/classes.mjs';
import {
  NAME,
  OUTPUT_COLUMNS,
  REASON,
  SESSIONS,
  buildOutputRows,
  columnWidths,
  decodeText,
  importedLeaves,
  leaveTableSvg,
  parseContacts,
  splitSessions,
  tableFromRows,
  titleDate,
} from './lib/leave-import.mjs';

const USAGE =
  'Usage: npm run import-leaves -- <classId> <file.xls> [--date YYYY-MM-DD] [--csv <path>]';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: { date: { type: 'string' }, csv: { type: 'string' } },
  });
} catch (err) {
  fail(`${err.message}\n${USAGE}`);
}
const [classId, file] = args.positionals;
if (!classId || !file) fail(USAGE);
if (args.values.date && !isDateStr(args.values.date)) fail(`Invalid date ${args.values.date}`);

setMessages(JSON.parse(readFileSync(new URL('locales/zh-CN.json', ROOT), 'utf8')), 'zh-CN');
const cls = findClass(classId);

// Sheet -> records keyed by header.
const workbook = XLSX.read(readFileSync(file));
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  raw: false,
  defval: '',
});
let records;
try {
  records = tableFromRows(rows);
} catch (err) {
  fail(`${file}: ${err.message}`);
}
const title = String(rows[0]?.find((c) => String(c).trim()) ?? '').trim();
const date = args.values.date ?? titleDate(title, toDateStr(new Date()));
if (!date) fail(`Cannot find a date in the title "${title}"; pass --date YYYY-MM-DD`);

// Contacts.
const csvPath = args.values.csv ?? new URL(`private/${classId}.students.csv`, ROOT);
let contacts = new Map();
if (existsSync(csvPath)) contacts = parseContacts(decodeText(readFileSync(csvPath)));
else console.warn(`Warning: ${csvPath} not found; gender and phone left blank`);
const noContact = records.map((r) => r[NAME]).filter((n) => !contacts.has(n));
if (contacts.size && noContact.length) {
  console.warn(`Warning: not in the students CSV: ${noContact.join('、')}`);
}

// Tidied spreadsheet and image.
const outputRows = buildOutputRows(records, contacts);
const table = [OUTPUT_COLUMNS, ...outputRows.map((r) => OUTPUT_COLUMNS.map((c) => r[c]))];
const sheet = XLSX.utils.aoa_to_sheet(table);
sheet['!cols'] = columnWidths(table);
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, sheet, '请假');

let stem = basename(file, extname(file));
if (stem.lastIndexOf('-') > 0) stem = stem.slice(0, stem.lastIndexOf('-'));
const outName = `${cls.name}${stem}`;
const exportsDir = new URL('exports/', ROOT);
mkdirSync(exportsDir, { recursive: true });
writeFileSync(
  new URL(`${outName}.xlsx`, exportsDir),
  XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }),
);
console.log(`Wrote exports/${outName}.xlsx (${outputRows.length} students)`);

const onLeave = outputRows.filter((r) => r[SESSIONS]);
const imageTitle = `${cls.name} ${title.replace(/-[^-]*$/, '')} 请假 ${onLeave.length} 人`;
const png = new Resvg(leaveTableSvg(imageTitle, onLeave), {
  font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK SC' },
  fitTo: { mode: 'zoom', value: 2 },
})
  .render()
  .asPng();
writeFileSync(new URL(`${outName}.png`, exportsDir), png);
console.log(`Wrote exports/${outName}.png (${onLeave.length} on leave)`);

// Leave records.
const password = await getPassword(classId);
const data = await readClassData(cls, password);
const week = weekRange(date);
const sessions = listSessions(data, week.from, week.to);
if (!sessions.length) {
  fail(`No sessions listed for ${week.from}..${week.to}; add them with npm run add-sessions`);
}
const aliases = sessionAliases(sessions);
const byName = new Map(activeStudents(data).map((s) => [s.name, s.id]));
const unknownNames = [];
const unknownWords = new Set();
const entries = new Map();
for (const r of records) {
  const id = byName.get(r[NAME]);
  if (!id) {
    unknownNames.push(r[NAME]);
    continue;
  }
  const words = splitSessions(r[SESSIONS]);
  const keys = words.map((w) => aliases.get(w));
  words.forEach((w, i) => keys[i] || unknownWords.add(w));
  const sessionKeys = [...new Set(keys.filter(Boolean))];
  // Sessions given but none recognised: likely a typo, so leave this student's leave alone.
  if (words.length && !sessionKeys.length) continue;
  const previous = entries.get(id);
  entries.set(id, {
    studentId: id,
    note: r[REASON] || previous?.note || '',
    sessionKeys: [...new Set([...(previous?.sessionKeys ?? []), ...sessionKeys])],
  });
}
if (unknownNames.length)
  console.warn(`Warning: not in class ${classId}: ${unknownNames.join('、')}`);
if (unknownWords.size) {
  console.warn(
    `Warning: no such session in ${week.from}..${week.to}: ${[...unknownWords].join('、')}`,
  );
}

const changes = importedLeaves(data, sessions, [...entries.values()], now());
if (!changes.length) {
  console.log(`${cls.file} is already up to date.`);
  process.exit(0);
}
for (const change of changes) {
  const existing = data.leaves.findIndex(
    (l) => sessionKey(l.date, l.slot) === sessionKey(change.date, change.slot),
  );
  if (existing >= 0) data.leaves[existing] = change;
  else data.leaves.push(change);
}
await writeClassData(cls, data, password);
for (const s of sessions) {
  const leave = data.leaves.find((l) => l.date === s.date && l.slot === s.slot.id);
  console.log(
    `  ${s.date} ${sessionName(s.date, s.slot)}: ${leave?.students.length ?? 0} on leave`,
  );
}
console.log(`Wrote ${cls.file}; commit and push it to publish the changes.`);
