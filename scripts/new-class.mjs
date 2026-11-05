// Creates an empty class: an encrypted data file and an entry in data/classes.json.
// Usage: npm run new-class -- <classId> <display name>
import { existsSync } from 'node:fs';
import { emptyData } from '../js/data.js';
import { getPassword } from './lib/env.mjs';
import { ROOT, readClasses, writeClasses, writeClassData } from './lib/classes.mjs';

const [id, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ');
if (!id || !name || !/^[\w-]+$/.test(id)) {
  console.error('Usage: npm run new-class -- <classId: letters, digits, - or _> <display name>');
  process.exit(1);
}
const classes = readClasses();
const file = `data/${id}.enc.json`;
if (classes.some((c) => c.id === id) || existsSync(new URL(file, ROOT))) {
  console.error(`Class "${id}" already exists`);
  process.exit(1);
}
const password = await getPassword(id);
const cls = { id, name, file };
await writeClassData(cls, emptyData(), password);
writeClasses([...classes, cls]);
console.log(`Created ${file} and added "${name}" to data/classes.json`);
