import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assign,
  centerPodium,
  createChart,
  frontKey,
  getSeat,
  layout,
  mainKey,
  resize,
  screenToColDelta,
  shiftCols,
  shiftRows,
  swap,
  toggleDisabled,
  toggleFrontSeat,
  unseat,
} from '../js/chart.js';

/** 3 rows x 3 cols, podium at col 1, front seats at cols 0 and 2; cell ids like 'r0c1'. */
function sample() {
  let chart = createChart({
    id: 'c',
    effectiveFrom: '2026-01-01T00:00',
    rows: 3,
    cols: 3,
  });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) chart = assign(chart, mainKey(r, c), `r${r}c${c}`).chart;
  chart = assign(chart, frontKey(0), 'F0').chart;
  chart = assign(chart, frontKey(2), 'F2').chart;
  return chart;
}

const grid = (chart) => chart.seats.map((row) => row.join(' '));

test('createChart puts seats on both sides of the podium', () => {
  const chart = createChart({ id: 'c', effectiveFrom: '2026-01-01T00:00', rows: 6, cols: 8 });
  assert.equal(chart.podium, 3);
  assert.deepEqual(Object.keys(chart.front).sort(), ['2', '4']);
});

test('shiftRows forward moves everyone one row towards the podium and wraps the front row', () => {
  const chart = shiftRows(sample(), -1);
  assert.deepEqual(grid(chart), ['r1c0 r1c1 r1c2', 'r2c0 r2c1 r2c2', 'r0c0 r0c1 r0c2']);
  assert.equal(getSeat(chart, frontKey(0)), 'F0');
  assert.equal(getSeat(chart, frontKey(2)), 'F2');
});

test('shiftRows backward is the inverse of forward', () => {
  assert.deepEqual(grid(shiftRows(shiftRows(sample(), -1), 1)), grid(sample()));
  assert.deepEqual(grid(shiftRows(sample(), 1)), [
    'r2c0 r2c1 r2c2',
    'r0c0 r0c1 r0c2',
    'r1c0 r1c1 r1c2',
  ]);
});

test('shiftCols wraps around and leaves the podium row alone', () => {
  const left = shiftCols(sample(), -1);
  assert.deepEqual(grid(left)[0], 'r0c1 r0c2 r0c0');
  assert.equal(getSeat(left, frontKey(0)), 'F0');
  assert.deepEqual(grid(shiftCols(sample(), 1))[0], 'r0c2 r0c0 r0c1');
});

test('shifts skip cells without a desk', () => {
  const chart = shiftRows(toggleDisabled(sample(), 1, 0), -1);
  // Column 0 now has seats only in rows 0 and 2.
  assert.equal(chart.seats[0][0], 'r2c0');
  assert.equal(chart.seats[1][0], null);
  assert.equal(chart.seats[2][0], 'r0c0');
});

test('on-screen left maps to opposite column directions in the two views', () => {
  assert.equal(screenToColDelta('seat', -1), -1);
  assert.equal(screenToColDelta('podium', -1), 1);
});

test('assign displaces the occupant and vacates the old seat', () => {
  const { chart, displaced } = assign(sample(), mainKey(0, 0), 'r2c2');
  assert.equal(displaced, 'r0c0');
  assert.equal(getSeat(chart, mainKey(0, 0)), 'r2c2');
  assert.equal(getSeat(chart, mainKey(2, 2)), null);
});

test('swap and unseat', () => {
  const swapped = swap(sample(), mainKey(0, 0), frontKey(2));
  assert.equal(getSeat(swapped, mainKey(0, 0)), 'F2');
  assert.equal(getSeat(swapped, frontKey(2)), 'r0c0');
  assert.equal(getSeat(unseat(sample(), mainKey(1, 1)), mainKey(1, 1)), null);
});

test('resize keeps overlapping students', () => {
  const chart = resize(sample(), 2, 4);
  assert.deepEqual(grid(chart), ['r0c0 r0c1 r0c2 ', 'r1c0 r1c1 r1c2 ']);
});

test('layout: seat view has the podium on top and columns 1..n; podium view is rotated', () => {
  const chart = sample();
  const describe = (rows) => rows.map((row) => row.map((c) => c.key ?? c.text ?? c.kind).join(','));
  assert.deepEqual(describe(layout(chart, 'seat')), [
    'corner,1,2,3',
    ',f:0,podium,f:2',
    '1,m:0:0,m:0:1,m:0:2',
    '2,m:1:0,m:1:1,m:1:2',
    '3,m:2:0,m:2:1,m:2:2',
  ]);
  assert.deepEqual(describe(layout(chart, 'podium')), [
    '3,m:2:2,m:2:1,m:2:0',
    '2,m:1:2,m:1:1,m:1:0',
    '1,m:0:2,m:0:1,m:0:0',
    ',f:2,podium,f:0',
    'corner,3,2,1',
  ]);
});

const frontSpans = (chart, view) =>
  layout(chart, view)
    .find((row) => row.some((c) => c.kind === 'podium'))
    .slice(1)
    .map((c) => `${c.key ?? c.kind}@${c.span}`);

test('layout: odd column count puts the podium in the middle column', () => {
  assert.deepEqual(frontSpans(sample(), 'seat'), ['f:0@0,2', 'podium@2,4', 'f:2@4,6']);
});

test('layout: even column count puts the podium between the middle columns', () => {
  const even = createChart({ id: 'e', effectiveFrom: '', rows: 2, cols: 4 });
  assert.deepEqual(frontSpans(even, 'seat'), [
    'gap@0,1',
    'f:0@1,3',
    'podium@3,5',
    'f:2@5,7',
    'gap@7,8',
  ]);
  assert.deepEqual(frontSpans(even, 'podium'), [
    'gap@0,1',
    'f:2@1,3',
    'podium@3,5',
    'f:0@5,7',
    'gap@7,8',
  ]);
  // The last column has no podium-row slot, and the podium itself is not a seat.
  assert.equal(toggleFrontSeat(even, 3), even);
  assert.equal(toggleFrontSeat(even, 1), even);
});

test('resize keeps the podium centred and moves its row along', () => {
  const chart = resize(sample(), 3, 6); // podium 1 -> 2
  assert.equal(chart.podium, 2);
  assert.deepEqual(chart.front, { 1: 'F0', 3: 'F2' });
  const narrow = resize(chart, 3, 2); // 2 columns: the podium takes the only slot
  assert.equal(narrow.podium, 0);
  assert.deepEqual(narrow.front, {});
});

test('centerPodium fixes charts saved with an off-centre podium', () => {
  const old = { ...createChart({ id: 'o', effectiveFrom: '', rows: 1, cols: 5 }) };
  old.podium = 0;
  old.front = { 1: 'A', 2: 'B', 4: 'C' };
  const fixed = centerPodium(old);
  assert.equal(fixed.podium, 2);
  assert.deepEqual(fixed.front, { 3: 'A', 4: 'B' });
  const ok = createChart({ id: 'k', effectiveFrom: '', rows: 1, cols: 5 });
  assert.equal(centerPodium(ok), ok);
});
