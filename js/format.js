// Locale-aware formatting of dates, slots and sessions.

import { parseDate } from './dates.js';
import { raw, t } from './i18n.js';

/** e.g. "11月6日 周五". */
export function formatDate(date) {
  const d = parseDate(date);
  return t('date.label', {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: raw('weekdays')[d.getDay()],
  });
}

/** e.g. "11月6日". */
export function formatShortDate(date) {
  const d = parseDate(date);
  return t('date.short', { month: d.getMonth() + 1, day: d.getDate() });
}

/** 'YYYY-MM-DDTHH:mm' -> "11月6日 周五 18:30". */
export function formatTimestamp(ts) {
  return `${formatDate(ts.slice(0, 10))} ${ts.slice(11, 16)}`;
}

/** Slot name from the locale (e.g. "周五晚上"), falling back to its time range. */
export function slotName(slot) {
  return raw('slotNames')?.[slot.id] ?? `${slot.start}-${slot.end}`;
}

/** Short slot name for holiday days, without the weekday (e.g. "晚上"). */
export function slotPart(slot) {
  return raw('slotParts')?.[slot.id] ?? `${slot.start}-${slot.end}`;
}

export function slotLabel(slot) {
  return `${slotName(slot)} ${slot.start}–${slot.end}`;
}

/** e.g. "11月6日 周五 晚上 18:30–22:00". */
export function sessionLabel(date, slot) {
  return `${formatDate(date)} ${slotPart(slot)} ${slot.start}–${slot.end}`;
}
