// Reading and writing data/classes.json and the encrypted per-class data files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { decryptJson, encryptJson } from '../../js/crypto.js';

export const ROOT = new URL('../../', import.meta.url);
const CLASSES_FILE = new URL('data/classes.json', ROOT);

export function readClasses() {
  return existsSync(CLASSES_FILE) ? JSON.parse(readFileSync(CLASSES_FILE, 'utf8')) : [];
}

/** Writes the class list; the demo class always goes last so real classes come first. */
export function writeClasses(classes) {
  classes = [...classes.filter((c) => c.id !== 'demo'), ...classes.filter((c) => c.id === 'demo')];
  writeFileSync(CLASSES_FILE, JSON.stringify(classes, null, 2) + '\n');
}

export function findClass(classId) {
  const cls = readClasses().find((c) => c.id === classId);
  if (!cls) throw new Error(`Unknown class "${classId}" (see data/classes.json)`);
  return cls;
}

export async function readClassData(cls, password) {
  const envelope = JSON.parse(readFileSync(new URL(cls.file, ROOT), 'utf8'));
  try {
    return await decryptJson(envelope, password);
  } catch (err) {
    if (err.code === 'wrongPassword') {
      throw new Error(`Wrong password for class "${cls.id}" (check PASSWORD_${cls.id} in .env)`);
    }
    throw err;
  }
}

export async function writeClassData(cls, data, password) {
  const envelope = await encryptJson(data, password);
  writeFileSync(new URL(cls.file, ROOT), JSON.stringify(envelope) + '\n');
}
