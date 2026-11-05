// Merges changeset files exported from the app into the encrypted class data files.
// Usage: npm run merge -- <changeset.json> [more.json ...]
import { readFileSync } from 'node:fs';
import { mergeInto, validateChangeset } from '../js/data.js';
import { sessionKey } from '../js/sessions.js';
import { getPassword } from './lib/env.mjs';
import { findClass, readClassData, writeClassData } from './lib/classes.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run merge -- <changeset.json> [more.json ...]');
  process.exit(1);
}

// Group changesets by class so each data file is decrypted and written once.
const byClass = new Map();
for (const file of files) {
  let changeset;
  try {
    changeset = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`${file}: cannot read JSON (${err.message})`);
    process.exit(1);
  }
  const error = validateChangeset(changeset);
  if (error) {
    console.error(`${file}: not a valid changeset (${error})`);
    process.exit(1);
  }
  if (!byClass.has(changeset.classId)) byClass.set(changeset.classId, []);
  byClass.get(changeset.classId).push({ file, changeset });
}

for (const [classId, items] of byClass) {
  const cls = findClass(classId);
  const password = await getPassword(classId);
  let data = await readClassData(cls, password);
  let changed = false;
  const listed = new Set((data.sessions ?? []).map((s) => sessionKey(s.date, s.slot)));
  for (const { file, changeset } of items) {
    const { result, counts } = mergeInto(data, changeset);
    data = result;
    if (Object.keys(counts).length) changed = true;
    const summary =
      Object.entries(counts)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'no changes';
    console.log(`${file} -> ${classId}: ${summary}`);
    // The app only shows listed sessions; records for others are kept but hidden.
    const unlisted = new Set(
      [...(changeset.leaves ?? []), ...(changeset.attendance ?? [])]
        .map((r) => sessionKey(r.date, r.slot))
        .filter((key) => !listed.has(key)),
    );
    if (unlisted.size) {
      console.warn(`  Warning: records for unlisted sessions: ${[...unlisted].join(', ')}`);
    }
  }
  if (changed) {
    await writeClassData(cls, data, password);
    console.log(`Wrote ${cls.file}; commit and push it to publish the changes.`);
  } else {
    console.log(`${cls.file} is already up to date.`);
  }
}
