// Writes the decrypted data of a class to private/<classId>.json (gitignored) for inspection.
// Usage: npm run decrypt -- <classId>
import { mkdirSync, writeFileSync } from 'node:fs';
import { getPassword } from './lib/env.mjs';
import { ROOT, findClass, readClassData } from './lib/classes.mjs';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run decrypt -- <classId>');
  process.exit(1);
}
const cls = findClass(id);
const data = await readClassData(cls, await getPassword(id));
mkdirSync(new URL('private/', ROOT), { recursive: true });
writeFileSync(new URL(`private/${id}.json`, ROOT), JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote private/${id}.json`);
