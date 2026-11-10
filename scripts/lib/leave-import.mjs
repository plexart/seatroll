// Pure helpers for `npm run import-leaves`: reading the leave sheet exported from the sign-up
// form, the contacts CSV, building the tidied output rows, the PNG table and the leave records.
import { findLeave } from '../../js/data.js';
import { sessionKey } from '../../js/sessions.js';

export const NAME = '学生姓名';
export const GENDER = '学生性别';
export const PHONE = '家长手机号';
export const REASON = '请假原因';
export const SESSIONS = '请假时间段';
export const OUTPUT_COLUMNS = [NAME, GENDER, PHONE, SESSIONS, REASON];
const REQUIRED = [NAME, SESSIONS];

const clean = (v) => String(v ?? '').trim();

/**
 * Turns the sheet's rows into records keyed by column header. The first two rows (title and
 * sign-up count) are dropped; the next row is the header. Columns are found by header, so their
 * order does not matter; columns without a header are ignored, as are rows without a name.
 */
export function tableFromRows(rows) {
  const [header = [], ...body] = rows.slice(2);
  const columns = header.map(clean).flatMap((name, i) => (name ? [{ name, i }] : []));
  const names = columns.map((c) => c.name);
  const missing = REQUIRED.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`缺少列：${missing.join('、')}（第 3 行应为列头）`);
  return body
    .map((row) => Object.fromEntries(columns.map(({ name, i }) => [name, clean(row[i])])))
    .filter((record) => record[NAME]);
}

/** The date in a title such as "11月14日留校自习…", in the year that puts it closest to today. */
export function titleDate(title, today) {
  const m = clean(title).match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const [month, day] = [Number(m[1]), Number(m[2])];
  const base = new Date(`${today}T00:00:00`);
  const pad = (n) => String(n).padStart(2, '0');
  let best = null;
  for (const year of [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1]) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) continue;
    const diff = Math.abs(d - base);
    if (!best || diff < best.diff) best = { diff, date: `${year}-${pad(month)}-${pad(day)}` };
  }
  return best?.date ?? null;
}

/** Decodes a CSV file: UTF-8 (with or without BOM), falling back to GBK as Excel saves it. */
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('gbk').decode(buffer);
  }
}

/** Parses CSV text (quoted fields, doubled quotes, CRLF) into rows of cells. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Student contacts from CSV text, keyed by name. Columns are found by header: one containing
 * "姓名", one containing "性别" and one containing "手机" or "电话".
 */
export function parseContacts(text) {
  const [header = [], ...body] = parseCsv(text);
  const find = (...words) => header.findIndex((h) => words.some((w) => h.includes(w)));
  const name = find('姓名');
  const gender = find('性别');
  const phone = find('手机', '电话');
  if (name < 0) throw new Error('学生信息 CSV 缺少“姓名”列');
  const contacts = new Map();
  for (const row of body) {
    const key = clean(row[name]);
    if (!key) continue;
    contacts.set(key, {
      gender: gender < 0 ? '' : clean(row[gender]),
      phone: phone < 0 ? '' : clean(row[phone]),
    });
  }
  return contacts;
}

/** Session words in a cell such as "周五晚上,周六上午" (same separators as the paste box). */
export function splitSessions(text) {
  return clean(text)
    .split(/[\s,，、;；/]+/)
    .filter(Boolean);
}

/**
 * Output rows (objects keyed by OUTPUT_COLUMNS), students with the most leave sessions first;
 * students with the same count keep the sheet's order.
 */
export function buildOutputRows(records, contacts) {
  return records
    .map((r) => {
      const contact = contacts.get(r[NAME]) ?? {};
      return {
        [NAME]: r[NAME],
        [GENDER]: contact.gender ?? '',
        [PHONE]: contact.phone ?? '',
        [SESSIONS]: r[SESSIONS] ?? '',
        [REASON]: r[REASON] ?? '',
      };
    })
    .map((row, i) => ({ row, i, n: splitSessions(row[SESSIONS]).length }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.row);
}

/** Display width in character cells: CJK and other wide characters count as two. */
export function textWidth(text) {
  let w = 0;
  for (const ch of String(text)) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 2 : 1;
  return w;
}

/** Excel column widths (in characters) wide enough for every header and value. */
export function columnWidths(table) {
  const widths = table[0].map((_, c) => Math.max(...table.map((row) => textWidth(row[c] ?? ''))));
  return widths.map((w) => Math.max(10, w + 4));
}

// Cell styles of the form's own export: 微软雅黑, thin black borders, centred and wrapped;
// bold headers on a grey fill.
const BORDER = { style: 'thin', color: { argb: 'FF000000' } };
const CELL_STYLE = {
  font: { name: '微软雅黑', size: 10 },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER },
};
const HEADER_STYLE = {
  ...CELL_STYLE,
  font: { ...CELL_STYLE.font, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } },
};
const ROW_HEIGHT = 31.3;

/** Fills an ExcelJS worksheet with the table (header row first), styled like the form's export. */
export function fillSheet(sheet, table) {
  columnWidths(table).forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  table.forEach((values, r) => {
    const row = sheet.addRow(values.map((v) => String(v ?? '')));
    row.height = ROW_HEIGHT;
    values.forEach((_, c) => {
      Object.assign(row.getCell(c + 1), r === 0 ? HEADER_STYLE : CELL_STYLE);
    });
  });
}

/**
 * Leave records for the shown sessions from the sheet. The sheet is authoritative for the
 * students it lists: each one is on leave in exactly the sessions given (with the reason as
 * note), so an empty sessions cell cancels their leave in these sessions. Students not in the
 * sheet keep their leave. Only records that actually change are returned.
 * `entries` are { studentId, note, sessionKeys }.
 */
export function importedLeaves(data, sessions, entries, updatedAt) {
  const byId = new Map(entries.map((e) => [e.studentId, e]));
  const changes = [];
  for (const session of sessions) {
    const key = sessionKey(session.date, session.slot.id);
    const record = (e) => (e.note ? { id: e.studentId, note: e.note } : { id: e.studentId });
    const existing = findLeave(data, session.date, session.slot.id)?.students ?? [];
    const students = existing.flatMap((s) => {
      const e = byId.get(s.id);
      if (!e) return [s];
      return e.sessionKeys.includes(key) ? [record(e)] : [];
    });
    const present = new Set(existing.map((s) => s.id));
    for (const e of entries) {
      if (!present.has(e.studentId) && e.sessionKeys.includes(key)) students.push(record(e));
    }
    if (JSON.stringify(students) === JSON.stringify(existing)) continue;
    changes.push({ date: session.date, slot: session.slot.id, students, updatedAt });
  }
  return changes;
}

/**
 * Entries whose leave doesn't run to the end of the week: on leave at a session but not at a
 * later one, which is usually a mistake in the sheet. `sessions` comes from listSessions (in
 * order). Returns [{ studentId, missing }], `missing` being the later sessions not on leave.
 */
export function leaveGaps(sessions, entries) {
  const gaps = [];
  for (const e of entries) {
    const onLeave = (s) => e.sessionKeys.includes(sessionKey(s.date, s.slot.id));
    const first = sessions.findIndex(onLeave);
    if (first < 0) continue;
    const missing = sessions.slice(first + 1).filter((s) => !onLeave(s));
    if (missing.length) gaps.push({ studentId: e.studentId, missing });
  }
  return gaps;
}

const FONT = 'Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif';
const escapeXml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/**
 * An SVG table of the rows with a leave, numbered, with column headers and a title above, for
 * rendering to PNG. Uses the same light palette as the app's images.
 */
export function leaveTableSvg(title, rows) {
  const size = 16;
  const pad = 20;
  const cellPad = 12;
  const rowH = 36;
  const titleH = 40;
  const columns = ['序号', ...OUTPUT_COLUMNS];
  const table = [
    columns,
    ...rows.map((r, i) => [String(i + 1), ...OUTPUT_COLUMNS.map((c) => r[c])]),
  ];
  const widths = columns.map(
    (_, c) => Math.max(...table.map((row) => textWidth(row[c]))) * size * 0.55 + cellPad * 2,
  );
  const tableW = widths.reduce((a, b) => a + b, 0);
  const width = Math.max(tableW, textWidth(title) * 20 * 0.55) + pad * 2;
  const height = pad * 2 + titleH + rowH * table.length;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="${FONT}" font-size="${size}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${width / 2}" y="${pad + titleH / 2}" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="bold" fill="#1f2937">${escapeXml(title)}</text>`,
  ];
  table.forEach((row, r) => {
    const y = pad + titleH + r * rowH;
    if (r === 0)
      parts.push(`<rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="#3d6fa8"/>`);
    else if (r % 2 === 0)
      parts.push(`<rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="#eef4fb"/>`);
    let x = pad;
    row.forEach((text, c) => {
      const center = c === 0;
      const tx = center ? x + widths[c] / 2 : x + cellPad;
      parts.push(
        `<text x="${tx}" y="${y + rowH / 2}" dominant-baseline="central"${center ? ' text-anchor="middle"' : ''}${r === 0 ? ' font-weight="bold" fill="#ffffff"' : ' fill="#1f2937"'}>${escapeXml(text)}</text>`,
      );
      x += widths[c];
    });
  });
  // Grid lines.
  const top = pad + titleH;
  const bottom = top + rowH * table.length;
  for (let r = 0; r <= table.length; r++) {
    const y = top + r * rowH;
    parts.push(`<line x1="${pad}" y1="${y}" x2="${pad + tableW}" y2="${y}" stroke="#9ca3af"/>`);
  }
  let x = pad;
  for (let c = 0; c <= widths.length; c++) {
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#9ca3af"/>`);
    x += widths[c] ?? 0;
  }
  parts.push('</svg>');
  return parts.join('\n');
}
