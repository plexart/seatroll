// Draws seat charts and simple tables onto a canvas and returns PNG blobs, for sharing to
// group chats or printing. Always uses a light palette, independent of the page theme.

import { layout } from '../chart.js';
import { labelText } from './seatgrid.js';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const SCALE = 2;
const COLORS = {
  background: '#ffffff',
  text: '#1f2937',
  muted: '#6b7280',
  line: '#1f2937',
  header: '#3d6fa8',
  headerText: '#ffffff',
  podium: '#e9a14a',
  seat: '#eef4fb',
};

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function setup(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  return { canvas, ctx };
}

function fitText(ctx, text, maxWidth, size, weight = '') {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 1;
  } while (ctx.measureText(text).width > maxWidth && s > 9);
}

/**
 * Renders a seat chart image. `seat(cell)` returns { text, sub, fill, color } for seat cells.
 * `title` and `subtitle` are drawn above the grid, `legend` ([{ fill, text }]) below it.
 */
export function chartImage(chart, view, { title, subtitle, seat, legend = [] }) {
  const rows = layout(chart, view);
  const labelW = 48;
  const cellW = 104;
  const cellH = 60;
  const pad = 20;
  const top = pad + (title ? 34 : 0) + (subtitle ? 26 : 0) + (title || subtitle ? 10 : 0);
  const gridW = labelW * 2 + cellW * chart.cols; // row labels on both sides
  const gridH = cellH * rows.length;
  const legendH = legend.length ? 40 : 0;
  const width = gridW + pad * 2;
  const height = top + gridH + legendH + pad;
  const { canvas, ctx } = setup(width, height);

  let y = pad;
  if (title) {
    fitText(ctx, title, gridW, 24, 'bold');
    ctx.fillStyle = COLORS.text;
    ctx.fillText(title, width / 2, y + 14);
    y += 34;
  }
  if (subtitle) {
    fitText(ctx, subtitle, gridW, 16);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtitle, width / 2, y + 10);
  }

  rows.forEach((row, ri) => {
    let x = pad;
    const isFront = row.some((c) => c.kind === 'podium');
    for (const cell of row) {
      let w = cell.kind === 'rowLabel' || cell.kind === 'corner' ? labelW : cellW;
      if (cell.span) {
        x = pad + labelW + (cell.span[0] * cellW) / 2;
        w = ((cell.span[1] - cell.span[0]) * cellW) / 2;
      }
      const cy = top + ri * cellH;
      let fill = COLORS.seat;
      let color = COLORS.text;
      let text = labelText(cell);
      let sub = '';
      let weight = '';
      if (cell.kind === 'colLabel' || cell.kind === 'corner' || cell.kind === 'rowLabel') {
        fill = COLORS.header;
        color = COLORS.headerText;
        weight = 'bold';
        if (cell.kind === 'rowLabel' && isFront) {
          x += w; // the podium row has no row number, so its label cells stay blank
          continue;
        }
      } else if (cell.kind === 'podium') {
        fill = COLORS.podium;
        color = COLORS.headerText;
        weight = 'bold';
      } else if (cell.kind === 'gap') {
        x += w; // the half-column ends of the podium row stay blank
        continue;
      } else if (cell.kind === 'void' || cell.kind === 'disabled') {
        x += w; // cells without a seat stay blank, so they are not mistaken for a status
        continue;
      } else {
        const info = seat(cell) ?? {};
        fill = info.fill ?? COLORS.seat;
        color = info.color ?? COLORS.text;
        text = info.text ?? '';
        sub = info.sub ?? '';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, cy, w, cellH);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, cy + 0.5, w, cellH);
      ctx.fillStyle = color;
      if (text) {
        fitText(ctx, text, w - 10, 20, weight);
        ctx.fillText(text, x + w / 2, cy + (sub ? cellH / 2 - 8 : cellH / 2));
      }
      if (sub) {
        fitText(ctx, sub, w - 10, 13);
        ctx.fillText(sub, x + w / 2, cy + cellH / 2 + 14);
      }
      x += w;
    }
  });

  if (legend.length) {
    let x = pad;
    const ly = top + gridH + 22;
    ctx.textAlign = 'left';
    ctx.font = `14px ${FONT}`;
    for (const item of legend) {
      ctx.fillStyle = item.fill;
      ctx.fillRect(x, ly - 8, 16, 16);
      ctx.strokeStyle = COLORS.line;
      ctx.strokeRect(x + 0.5, ly - 7.5, 16, 16);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(item.text, x + 22, ly);
      x += 22 + ctx.measureText(item.text).width + 20;
    }
  }
  return toBlob(canvas);
}

/** Renders a titled table (header row + rows of strings) as an image. */
export function tableImage({ title, subtitle, header, rows }) {
  const pad = 20;
  const rowH = 36;
  const { ctx: measure } = setup(1, 1);
  measure.font = `15px ${FONT}`;
  const widths = header.map((hd, i) =>
    Math.max(
      ...[hd, ...rows.map((r) => r[i])].map((s) => measure.measureText(String(s)).width + 24),
      56,
    ),
  );
  const tableW = widths.reduce((a, b) => a + b, 0);
  const top = pad + 34 + (subtitle ? 26 : 0) + 6;
  const width = Math.max(tableW, 360) + pad * 2;
  const height = top + rowH * (rows.length + 1) + pad;
  const { canvas, ctx } = setup(width, height);
  fitText(ctx, title, width - pad * 2, 22, 'bold');
  ctx.fillStyle = COLORS.text;
  ctx.fillText(title, width / 2, pad + 14);
  if (subtitle) {
    fitText(ctx, subtitle, width - pad * 2, 15);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtitle, width / 2, pad + 44);
  }
  [header, ...rows].forEach((row, ri) => {
    let x = pad;
    const y = top + ri * rowH;
    row.forEach((value, ci) => {
      ctx.fillStyle = ri === 0 ? COLORS.header : ri % 2 ? COLORS.background : COLORS.seat;
      ctx.fillRect(x, y, widths[ci], rowH);
      ctx.strokeStyle = COLORS.line;
      ctx.strokeRect(x + 0.5, y + 0.5, widths[ci], rowH);
      ctx.fillStyle = ri === 0 ? COLORS.headerText : COLORS.text;
      ctx.font = `${ri === 0 ? 'bold ' : ''}15px ${FONT}`;
      ctx.fillText(String(value), x + widths[ci] / 2, y + rowH / 2);
      x += widths[ci];
    });
  });
  return toBlob(canvas);
}
