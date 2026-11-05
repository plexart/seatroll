// Seat chart model. All functions are pure: they return a new chart and never mutate input.
//
// Coordinates follow the students' perspective: row 0 is the front row (next to the podium),
// column 0 is the students' leftmost column ("column 1" in the UI). Seats are addressed by
// string keys: 'm:<row>:<col>' for the main grid and 'f:<col>' for seats in the podium row.
//
// The podium is always centred. With an odd number of columns it sits in the middle column;
// with an even number it sits between the two middle columns, so the podium row is drawn half
// a column over. Its slots are then numbered like the main column to their left, i.e. the
// podium is column cols/2 - 1 and the last column has no podium-row slot.
//
// chart = {
//   id, effectiveFrom: 'YYYY-MM-DDTHH:mm', rows, cols,
//   podium: <col>,                      // always podiumCol(cols); kept for older app versions
//   front: { '<col>': studentId|null }, // seats beside the podium (keys = seat exists)
//   seats: [[studentId|null]],          // rows x cols
//   disabled: ['<row>:<col>'],          // main-grid cells without a desk
//   colsFrom?: 'left' | 'right',        // which side (students' view) column 1 is on; default left
//   updatedAt, deleted?
// }

/** Layout size limits (the locale's `numerals` must cover MAX_COLS). */
export const MAX_ROWS = 15;
export const MAX_COLS = 15;

/** The podium's column: the middle one, or the left of the two middle ones. */
export function podiumCol(cols) {
  return Math.floor((cols - 1) / 2);
}

/** Whether column `c` has a podium-row slot (podium excluded). */
export function isFrontSlot(cols, c) {
  const p = podiumCol(cols);
  return c >= 0 && c <= 2 * p && c !== p;
}

export function createChart({ id, effectiveFrom, rows = 6, cols = 8 }) {
  const p = podiumCol(cols);
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

/**
 * The column number shown for column `c`: columns are counted from the students' left by
 * default, or from their right when the class numbers them that way.
 */
export function colNumber(chart, c) {
  return chart.colsFrom === 'right' ? chart.cols - c : c + 1;
}

/** Sets which side column 1 is on ('left' or 'right', from the students' view). */
export function setColsFrom(chart, side) {
  const next = cloneChart(chart);
  if (side === 'right') next.colsFrom = 'right';
  else delete next.colsFrom;
  return next;
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
 * Whether the chart fits the cross rotation: a full 6 x 8 grid (every cell has a desk).
 */
export function canCrossRotate(chart) {
  return chart.rows === 6 && chart.cols === 8 && chart.disabled.length === 0;
}

/**
 * Cross rotation for a 6 x 8 grid. The columns form pairs (1-2, 3-4, 5-6, 7-8) and the rows a
 * front half (rows 1-3) and a back half (rows 4-6). Every 3 x 2 block moves to the other half
 * and to the next column pair by column number (7-8 wraps to 1-2), keeping each student's
 * place within the block. Four rotations bring everyone back. Podium row untouched; charts
 * that do not fit are returned as is.
 */
export function crossRotate(chart) {
  if (!canCrossRotate(chart)) return chart;
  const { rows, cols } = chart;
  const dc = chart.colsFrom === 'right' ? -2 : 2; // towards higher column numbers
  const next = cloneChart(chart);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      next.seats[(r + rows / 2) % rows][(((c + dc) % cols) + cols) % cols] = chart.seats[r][c];
    }
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

/**
 * Converts a side ('left' | 'right') between the screen and the students' perspective. In the
 * podium view the two are opposite; the conversion is its own inverse.
 */
export function screenSide(view, side) {
  if (view !== 'podium') return side;
  return side === 'left' ? 'right' : 'left';
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
  // Podium-row seats keep their place relative to the podium, which stays centred.
  next.podium = podiumCol(cols);
  const delta = next.podium - chart.podium;
  next.front = {};
  for (const [c, id] of Object.entries(chart.front)) {
    const nc = Number(c) + delta;
    if (isFrontSlot(cols, nc)) next.front[nc] = id;
  }
  return next;
}

/**
 * Charts saved while the podium column was still a setting may have it off centre, or a seat
 * in the last column of an even-width podium row. This moves the podium to the centre and its
 * row's seats along with it; seats that no longer fit are dropped and their students become
 * unseated. Charts that already fit are returned as is.
 */
export function centerPodium(chart) {
  if (chart.deleted) return chart;
  const fits = Object.keys(chart.front).every((c) => isFrontSlot(chart.cols, Number(c)));
  if (chart.podium === podiumCol(chart.cols) && fits) return chart;
  return resize(chart, chart.rows, chart.cols);
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
  if (!isFrontSlot(chart.cols, c)) return chart;
  const next = cloneChart(chart);
  if (c in next.front) delete next.front[c];
  else next.front[c] = null;
  return next;
}

/**
 * Lays the chart out for display as a matrix of cells, in screen order (top-left first).
 * Cell kinds: 'corner', 'colLabel' (text = column number), 'rowLabel' (text = row number,
 * '' for the podium row), 'seat' (key), 'podium', 'void' (empty podium-row cell, key),
 * 'disabled' (main cell without a desk, key), 'gap' (half-column filler at both ends of the
 * podium row when the column count is even). Podium-row cells carry `span: [start, end]`, their
 * horizontal extent in half-column units (screen column i covers [2i, 2i + 2]).
 * Every row starts and ends with a 'rowLabel' (or 'corner'), so the chart is symmetric.
 * Seat view: podium on top, the students' left on the left, column labels at the bottom (with
 * an even column count the podium row is half a column over, so labels above it would not line
 * up). Podium view: rotated 180 degrees, column labels on top. Column numbers follow `colNumber`.
 */
export function layout(chart, view) {
  const colOrder = [...Array(chart.cols).keys()];
  const frontRow = [{ kind: 'rowLabel', text: '' }];
  const mainRows = [];
  if (view === 'podium') colOrder.reverse();
  const p = podiumCol(chart.cols);
  const slots = colOrder.filter((c) => c <= 2 * p);
  const offset = chart.cols - 1 - 2 * p; // 1 when even: half a column of gap on each side
  if (offset) frontRow.push({ kind: 'gap', span: [0, 1] });
  slots.forEach((c, i) => {
    const span = [i * 2 + offset, i * 2 + offset + 2];
    if (c === p) frontRow.push({ kind: 'podium', span });
    else if (c in chart.front) frontRow.push({ kind: 'seat', key: frontKey(c), span });
    else frontRow.push({ kind: 'void', key: frontKey(c), span });
  });
  if (offset) frontRow.push({ kind: 'gap', span: [chart.cols * 2 - 1, chart.cols * 2] });
  frontRow.push({ kind: 'rowLabel', text: '' });
  for (let r = 0; r < chart.rows; r++) {
    mainRows.push([
      { kind: 'rowLabel', text: String(r + 1) },
      ...colOrder.map((c) =>
        isDisabled(chart, r, c)
          ? { kind: 'disabled', key: mainKey(r, c) }
          : { kind: 'seat', key: mainKey(r, c) },
      ),
      { kind: 'rowLabel', text: String(r + 1) },
    ]);
  }
  const labels = [
    { kind: 'corner' },
    ...colOrder.map((c) => ({ kind: 'colLabel', text: String(colNumber(chart, c)) })),
    { kind: 'corner' },
  ];
  if (view === 'podium') return [labels, ...mainRows.reverse(), frontRow];
  return [frontRow, ...mainRows, labels];
}
