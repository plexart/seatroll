// Minimal .env reader/writer for class passwords (PASSWORD_<classId>=<password>).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

export const ENV_FILE = new URL('../../.env', import.meta.url);

export function parseEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export function loadEnv() {
  return existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
}

/** Sets one key, keeping the rest of the file (including comments) untouched. */
export function setEnvValue(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n') : [];
  const index = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else {
    if (lines.length && lines.at(-1) === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  writeFileSync(ENV_FILE, lines.join('\n'));
}

export const passwordKey = (classId) => `PASSWORD_${classId}`;

export async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Reads the class password from .env, asking once (and saving it) when it is missing. */
export async function getPassword(classId) {
  const key = passwordKey(classId);
  const saved = loadEnv()[key];
  if (saved) return saved;
  const password = await ask(`Password for class "${classId}": `);
  if (!password) throw new Error('Password must not be empty');
  setEnvValue(key, password);
  console.log(`Saved ${key} to .env`);
  return password;
}
