import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);

function precacheList() {
  const source = readFileSync(new URL('sw.js', root), 'utf8');
  const block = /const ASSETS = \[([\s\S]*?)\];/.exec(source)[1];
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function appFiles() {
  const files = ['index.html'];
  for (const dir of ['css', 'js', 'locales', 'icons']) {
    for (const f of readdirSync(new URL(`${dir}/`, root), { recursive: true })) {
      if (/\.\w+$/.test(f)) files.push(`${dir}/${f}`);
    }
  }
  return files.sort();
}

test('service worker precaches exactly the app files', () => {
  const listed = precacheList().filter((f) => f !== './');
  for (const f of listed) assert.ok(existsSync(new URL(f, root)), `listed but missing: ${f}`);
  assert.deepEqual([...listed].sort(), appFiles());
});
