// Local-time date helpers. Dates are 'YYYY-MM-DD' strings, times 'HH:mm', and timestamps
// 'YYYY-MM-DDTHH:mm' (all in the device's local time zone, which is the school's).

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses 'YYYY-MM-DD' as local midnight. */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, days) {
  const d = parseDate(str);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(str) {
  return parseDate(str).getDay();
}

/** Minutes since midnight for 'HH:mm'. */
export function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function isDateStr(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

export function isTimestamp(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str);
}

/** The whole month containing `date`, moved by `offset` months: { from, to }. */
export function monthRange(date, offset = 0) {
  const d = parseDate(date);
  const y = d.getFullYear();
  const m = d.getMonth() + offset;
  return { from: toDateStr(new Date(y, m, 1)), to: toDateStr(new Date(y, m + 1, 0)) };
}

/** The Monday-to-Sunday week containing `date`, moved by `offset` weeks: { from, to }. */
export function weekRange(date, offset = 0) {
  const from = addDays(date, 7 * offset - ((weekdayOf(date) + 6) % 7));
  return { from, to: addDays(from, 6) };
}
