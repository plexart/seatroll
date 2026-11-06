import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson } from '../js/crypto.js';
import { emptyData } from '../js/data.js';
import { commit, onChange, openClass, refreshClass, state } from '../js/store.js';

const cls = { id: 'c1', name: 'Class', file: 'data/c1.json' };
const student = (id, updatedAt) => ({ id, name: id, updatedAt });

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
let file;
globalThis.fetch = async () => ({ ok: true, json: async () => file });
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

async function publish(students) {
  file = await encryptJson({ ...emptyData(), students }, 'pw', { iterations: 1000 });
}

test('refreshClass picks up a new data file and keeps unmerged edits', async (t) => {
  t.after(() => (Date.now = realNow));
  await publish([student('a', '2026-01-01T00:00:00Z')]);
  await openClass(cls, 'pw');
  commit({ students: [student('local', '2026-02-01T00:00:00Z')] });

  // Within the throttle interval nothing is fetched.
  await publish([student('a', '2026-01-01T00:00:00Z'), student('b', '2026-03-01T00:00:00Z')]);
  assert.equal(await refreshClass(), false);

  let redraws = 0;
  const off = onChange(() => redraws++);
  clock += 60_000;
  assert.equal(await refreshClass(), true);
  off();
  assert.equal(redraws, 1);
  assert.deepEqual(state.data.students.map((s) => s.id).sort(), ['a', 'b', 'local']);
  assert.deepEqual(
    state.overlay.students.map((s) => s.id),
    ['local'],
  );

  // An unchanged file does not redraw; a failed fetch leaves the data alone.
  clock += 60_000;
  assert.equal(await refreshClass(), false);
  clock += 60_000;
  file = { broken: true };
  assert.equal(await refreshClass(), false);
  assert.equal(state.data.students.length, 3);
});
