import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { interpolate, setMessages, t } from '../js/i18n.js';

const root = new URL('../', import.meta.url);
const locale = JSON.parse(readFileSync(new URL('locales/zh-CN.json', root), 'utf8'));

function sourceFiles() {
  return [
    'index.html',
    ...readdirSync(new URL('js/', root), { recursive: true })
      .filter((f) => f.endsWith('.js'))
      .map((f) => `js/${f}`),
  ];
}

test('interpolate replaces known placeholders only', () => {
  assert.equal(interpolate('{a} / {b} / {c}', { a: 1, b: 'x' }), '1 / x / {c}');
});

test('t falls back to the key for missing messages', () => {
  setMessages({ hello: '你好 {name}' }, 'zh-CN');
  assert.equal(t('hello', { name: '甲' }), '你好 甲');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(t('nope'), 'nope');
  } finally {
    console.warn = warn;
  }
});

test('every literal i18n key used in the source exists in zh-CN', () => {
  // Matches t('key'), raw('key'), data-i18n*="key" and quoted keys inside t(...) expressions
  // such as t(cond ? 'a.b' : 'c.d') or keys listed in arrays passed through t().
  const pattern =
    /\b(?:t|raw)\('([\w.]+)'|data-i18n(?:-[\w-]+)?="([\w.]+)"|'((?:[a-z]+\.)+[a-zA-Z]+)'/g;
  const prefixes = new Set(Object.keys(locale).map((k) => k.split('.')[0]));
  const missing = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(file, root), 'utf8');
    for (const m of text.matchAll(pattern)) {
      const key = m[1] ?? m[2] ?? m[3];
      // Bare quoted strings only count when they look like a key of a known group.
      if (m[3] && (!prefixes.has(key.split('.')[0]) || /\.(js|json|html|png|svg)$/.test(key)))
        continue;
      if (!Object.hasOwn(locale, key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('dynamic i18n key families are complete', () => {
  const expected = [
    ...['leave', 'absent', 'came'].map((s) => `status.${s}`),
    ...['network', 'wrongPassword', 'corrupt', 'insecure'].map((c) => `login.error.${c}`),
    ...['notChangeset', 'invalidRecord', 'otherClass'].map((c) => `import.error.${c}`),
    ...['students', 'seatCharts', 'leaves', 'attendance'].map((c) => `collection.${c}`),
    'view.podium',
    'view.seat',
  ];
  for (const key of expected) assert.ok(Object.hasOwn(locale, key), key);
});

test('podium-row seats are named relative to the podium', async () => {
  const { createChart, frontKey, mainKey } = await import('../js/chart.js');
  const { seatLabel } = await import('../js/render/seatgrid.js');
  setMessages(locale, 'zh-CN');
  const odd = createChart({ id: 'o', effectiveFrom: '', rows: 1, cols: 7 }); // podium = col 3
  assert.equal(seatLabel(frontKey(2), odd), '讲台左1');
  assert.equal(seatLabel(frontKey(0), odd), '讲台左3');
  assert.equal(seatLabel(frontKey(4), odd), '讲台右1');
  const even = createChart({ id: 'e', effectiveFrom: '', rows: 1, cols: 8 }); // podium = col 3
  assert.equal(seatLabel(frontKey(2), even), '讲台左1');
  assert.equal(seatLabel(frontKey(6), even), '讲台右3');
  assert.equal(seatLabel(mainKey(0, 4), even), '1行5列');
  assert.equal(seatLabel(null, even), '未排座');
});
