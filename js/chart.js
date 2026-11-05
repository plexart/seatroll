// Seat chart model. All functions are pure: they return a new chart and never mutate input.
//
// Coordinates follow the students' perspective: row 0 is the front row (next to the podium),
// column 0 is the students' leftmost column ("column 1" in the UI). Seats are addressed by
// string keys: 'm:<row>:<col>' for the main grid and 'f:<col>' for seats in the podium row.
//
// chart = {
//   id, effectiveFrom: 'YYYY-MM-DDTHH:mm', rows, cols,
//   podium: <col>,                      // podium position in the front row
//   front: { '<col>': studentId|null }, // seats beside the podium (keys = seat exists)
//   seats: [[studentId|null]],          // rows x cols
//   disabled: ['<row>:<col>'],          // main-grid cells without a desk
//   updatedAt, deleted?
// }

export function createChart({ id, effectiveFrom, rows = 6, cols = 8, podium }) {
  const p = podium ?? Math.floor((cols - 1) / 2);
  const front = {};
  for (const c of [p - 1, p + 1]) if (c >= 0 && c < cols) front[c] = null;
  return {
    id,
    effectiveFrom,
    rows,
    cols,
    podium: p,
    front,
    seats: Array.from({ length: rows }, () => Array(cols).fill(null)),
    disabled: [],
  };
}

export function cloneChart(chart) {
  return {
    ...chart,
    front: { ...chart.front },
    seats: chart.seats.map((row) => [...row]),
    disabled: [...chart.disabled],
  };
}

export const mainKey = (r, c) => `m:${r}:${c}`;
export const frontKey = (c) => `f:${c}`;

/** Parses a seat key into { area: 'main', row, col } or { area: 'front', col }. */
export function parseKey(key) {
  const parts = key.split(':');
  if (parts[0] === 'm') return { area: 'main', row: Number(parts[1]), col: Number(parts[2]) };
  return { area: 'front', col: Number(parts[1]) };
}

export function isDisabled(chart, r, c) {
  return chart.disabled.includes(`${r}:${c}`);
}

/** Every key that is a usable seat, front seats first. */
export function seatKeys(chart) {
  const keys = Object.keys(chart.front)
    .map(Number)
    .sort((a, b) => a - b)
    .map(frontKey);
  for (let r = 0; r < chart.rows; r++) {
    for (let c = 0; c < chart.cols; c++) if (!isDisabled(chart, r, c)) keys.push(mainKey(r, c));
  }
  return keys;
}

export function getSeat(chart, key) {
  const k = parseKey(key);
  if (k.area === 'front') return chart.front[k.col] ?? null;
  return chart.seats[k.row]?.[k.col] ?? null;
}

/** Sets a seat in place on an already-cloned chart. */
function put(chart, key, id) {
  const k = parseKey(key);
  if (k.area === 'front') chart.front[k.col] = id;
  else chart.seats[k.row][k.col] = id;
}

/** Map of studentId -> seat key. */
export function seatMap(chart) {
  const map = new Map();
  for (const key of seatKeys(chart)) {
    const id = getSeat(chart, key);
    if (id) map.set(id, key);
  }
  return map;
}

/**
 * Seats a student. If the student already sits elsewhere that seat is vacated; whoever sat in
 * the target seat becomes unseated and is returned as `displaced`.
 */
export function assign(chart, key, studentId) {
  const next = cloneChart(chart);
  const displaced = getSeat(chart, key);
  const from = seatMap(chart).get(studentId);
  if (from) put(next, from, null);
  put(next, key, studentId);
  return { chart: next, displaced: displaced === studentId ? null : displaced };
}

export function swap(chart, keyA, keyB) {
  const next = cloneChart(chart);
  const a = getSeat(chart, keyA);
  put(next, keyA, getSeat(chart, keyB));
  put(next, keyB, a);
  return next;
}

export function unseat(chart, key) {
  const next = cloneChart(chart);
  put(next, key, null);
  return next;
}

function rotate(values, delta) {
  // Content moves by `delta` positions: new[i] = old[i - delta], wrapping around.
  const n = values.length;
  return values.map((_, i) => values[(((i - delta) % n) + n) % n]);
}

/**
 * Moves every main-grid student by one row: delta -1 = forward (towards the podium, the
 * front row wraps to the back), +1 = backward. Podium-row seats are not touched and cells
 * without a desk are skipped.
 */
export function shiftRows(chart, delta) {
  const next = cloneChart(chart);
  for (let c = 0; c < chart.cols; c++) {
    const rows = [];
    for (let r = 0; r < chart.rows; r++) if (!isDisabled(chart, r, c)) rows.push(r);
    const moved = rotate(
      rows.map((r) => chart.seats[r][c]),
      delta,
    );
    rows.forEach((r, i) => {
      next.seats[r][c] = moved[i];
    });
  }
  return next;
}

/**
 * Moves every main-grid student by one column: delta -1 = towards column 1 (the students'
 * left), +1 = towards the last column. Wraps around; podium row untouched.
 */
export function shiftCols(chart, delta) {
  const next = cloneChart(chart);
  for (let r = 0; r < chart.rows; r++) {
    const cols = [];
    for (let c = 0; c < chart.cols; c++) if (!isDisabled(chart, r, c)) cols.push(c);
    const moved = rotate(
      cols.map((c) => chart.seats[r][c]),
      delta,
    );
    cols.forEach((c, i) => {
      next.seats[r][c] = moved[i];
    });
  }
  return next;
}

/**
 * Converts an on-screen horizontal direction (-1 = left, +1 = right) into a column delta.
 * In the podium view the columns are mirrored.
 */
export function screenToColDelta(view, direction) {
  return view === 'podium' ? -direction : direction;
}

/** Resizes the main grid, keeping students in overlapping cells; others become unseated. */
export function resize(chart, rows, cols) {
  const next = cloneChart(chart);
  next.rows = rows;
  next.cols = cols;
  next.seats = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => chart.seats[r]?.[c] ?? null),
  );
  next.disabled = chart.disabled.filter((k) => {
    const [r, c] = k.split(':').map(Number);
    return r < rows && c < cols;
  });
  next.podium = Math.min(chart.podium, cols - 1);
  next.front = {};
  for (const [c, id] of Object.entries(chart.front)) {
    if (Number(c) < cols && Number(c) !== next.podium) next.front[c] = id;
  }
  return next;
}

/** Toggles whether a main-grid cell has a desk; a student there becomes unseated. */
export function toggleDisabled(chart, r, c) {
  const next = cloneChart(chart);
  const k = `${r}:${c}`;
  if (next.disabled.includes(k)) next.disabled = next.disabled.filter((x) => x !== k);
  else {
    next.disabled.push(k);
    next.seats[r][c] = null;
  }
  return next;
}

/** Toggles a seat in the podium row (not on the podium itself). */
export function toggleFrontSeat(chart, c) {
  if (c === chart.podium) return chart;
  const next = cloneChart(chart);
  if (c in next.front) delete next.front[c];
  else next.front[c] = null;
  return next;
}

export function setPodium(chart, c) {
  const next = cloneChart(chart);
  next.podium = c;
  delete next.front[c];
  return next;
}

/**
 * Lays the chart out for display as a matrix of cells, in screen order (top-left first).
 * Cell kinds: 'corner', 'colLabel' (text = column number), 'rowLabel' (text = row number,
 * '' for the podium row), 'seat' (key), 'podium', 'void' (empty podium-row cell, key),
 * 'disabled' (main cell without a desk, key).
 * Seat view: podium on top, columns 1..n left to right. Podium view: rotated 180 degrees.
 */
export function layout(chart, view) {
  const colOrder = [...Array(chart.cols).keys()];
  const frontRow = [{ kind: 'rowLabel', text: '' }];
  const mainRows = [];
  if (view === 'podium') colOrder.reverse();
  for (const c of colOrder) {
    if (c === chart.podium) frontRow.push({ kind: 'podium' });
    else if (c in chart.front) frontRow.push({ kind: 'seat', key: frontKey(c) });
    else frontRow.push({ kind: 'void', key: frontKey(c) });
  }
  for (let r = 0; r < chart.rows; r++) {
    mainRows.push([
      { kind: 'rowLabel', text: String(r + 1) },
      ...colOrder.map((c) =>
        isDisabled(chart, r, c)
          ? { kind: 'disabled', key: mainKey(r, c) }
          : { kind: 'seat', key: mainKey(r, c) },
      ),
    ]);
  }
  const labels = [
    { kind: 'corner' },
    ...colOrder.map((c) => ({ kind: 'colLabel', text: String(c + 1) })),
  ];
  if (view === 'podium') return [...mainRows.reverse(), frontRow, labels];
  return [labels, frontRow, ...mainRows];
}
