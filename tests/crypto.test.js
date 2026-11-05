import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptJson, encryptJson } from '../js/crypto.js';

test('encrypt/decrypt round-trips with a fresh salt and IV each time', async () => {
  const value = { students: [{ id: 's1', name: '测试' }] };
  const a = await encryptJson(value, 'pw', { iterations: 1000 });
  const b = await encryptJson(value, 'pw', { iterations: 1000 });
  assert.notEqual(a.ct, b.ct);
  assert.deepEqual(await decryptJson(a, 'pw'), value);
});

test('wrong password and tampering are reported as wrongPassword', async () => {
  const env = await encryptJson({ x: 1 }, 'right', { iterations: 1000 });
  await assert.rejects(decryptJson(env, 'wrong'), { code: 'wrongPassword' });
  const tampered = { ...env, ct: env.ct.slice(0, -4) + 'AAA=' };
  await assert.rejects(decryptJson(tampered, 'right'), { code: 'wrongPassword' });
});
