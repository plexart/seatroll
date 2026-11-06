// Imports the weekly in-school enrichment (校内培优) roster from a lesson-ledger JSON export
// into the encrypted class data, replacing the previous roster. Students are matched by name;
// ledger students not in the class are listed and skipped.
// Usage: npm run import-enrichment -- <classId> <ledger.json> [--dry-run]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { enrichmentFromLedger } from '../js/enrichment.js';
import { getPassword } from './lib/env.mjs';
import { findClass, readClassData, writeClassData } from './lib/classes.mjs';

const USAGE = 'Usage: npm run import-enrichment -- <classId> <ledger.json> [--dry-run]';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { 'dry-run': { type: 'boolean' } } });
} catch (err) {
  fail(`${err.message}\n${USAGE}`);
}
const [classId, file] = args.positionals;
if (!classId || !file) fail(USAGE);

let cls, ledger;
try {
  cls = findClass(classId);
  ledger = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  fail(err.message);
}

const password = await getPassword(classId);
const data = await readClassData(cls, password);
const names = new Map(data.students.map((s) => [s.id, s.name]));

let result;
try {
  result = enrichmentFromLedger(ledger, data.students);
} catch (err) {
  fail(`${file}: ${err.message}`);
}
const { enrichment, unknownNames } = result;

for (const e of enrichment) {
  const list = e.students.map((id) => names.get(id)).join('、');
  console.log(
    `${e.subject}  ${WEEKDAYS[e.weekday]} ${e.start}-${e.end}  ${e.students.length}人：${list}`,
  );
}
if (unknownNames.length) {
  console.log(`Not in class ${classId} (skipped): ${unknownNames.join('、')}`);
}

if (args.values['dry-run']) {
  console.log('Dry run: nothing written.');
} else {
  data.enrichment = enrichment;
  await writeClassData(cls, data, password);
  console.log(`Wrote ${enrichment.length} enrichment classes to ${cls.file}`);
}
