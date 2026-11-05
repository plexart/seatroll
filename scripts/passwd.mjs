// Re-encrypts a class data file with a new password and updates .env.
// Usage: npm run passwd -- <classId>
import { ask, getPassword, passwordKey, setEnvValue } from './lib/env.mjs';
import { findClass, readClassData, writeClassData } from './lib/classes.mjs';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run passwd -- <classId>');
  process.exit(1);
}
const cls = findClass(id);
const data = await readClassData(cls, await getPassword(id));
const password = await ask('New password: ');
if (!password) {
  console.error('Password must not be empty');
  process.exit(1);
}
await writeClassData(cls, data, password);
setEnvValue(passwordKey(id), password);
console.log(`Re-encrypted ${cls.file}; updated ${passwordKey(id)} in .env`);
console.log('Tell the volunteers the new password; saved passwords in browsers stop working.');
