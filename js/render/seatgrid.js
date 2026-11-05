// Renders a seat chart as a CSS grid of cells, in the orientation of the chosen view.

import { layout, parseKey, podiumCol } from '../chart.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';

/**
 * Human-readable seat position in `chart`, e.g. "3行5列", or "讲台左1" / "讲台右1" for the
 * podium row (counted from the podium; left and right as the students see it, like columns).
 */
export function seatLabel(key, chart) {
  if (!key) return t('seat.none');
  const k = parseKey(key);
  if (k.area === 'main') return t('seat.main', { row: k.row + 1, col: k.col + 1 });
  const d = k.col - podiumCol(chart.cols);
  return t(d < 0 ? 'seat.frontLeft' : 'seat.frontRight', { n: Math.abs(d) });
}

/** Text for a non-seat cell of the layout matrix. */
export function labelText(cell) {
  switch (cell.kind) {
    case 'corner':
      return '';
    case 'colLabel':
      return t('grid.col', { n: cell.text });
    case 'rowLabel':
      return cell.text ? t('grid.row', { n: cell.text }) : '';
    case 'podium':
      return t('grid.podium');
    default:
      return '';
  }
}

/**
 * Builds the grid element. `seat(cell)` is called for 'seat', 'void' and 'disabled' cells and
 * returns { text, sub, className, onClick } (all optional) to customize them.
 */
export function renderSeatGrid(chart, view, seat) {
  const rows = layout(chart, view);
  const grid = h('div', {
    class: `seatgrid view-${view}`,
    style: `--half-cols: ${chart.cols * 2}`,
  });
  for (const row of rows) {
    for (const cell of row) {
      // Grid lines: 1-2 is the row-label column, then two half-columns per seat column.
      const style = cell.span ? `grid-column: ${cell.span[0] + 2} / ${cell.span[1] + 2}` : null;
      if (['seat', 'void', 'disabled'].includes(cell.kind)) {
        const info = seat(cell) ?? {};
        const interactive = typeof info.onClick === 'function';
        grid.append(
          h(
            interactive ? 'button' : 'div',
            {
              type: interactive ? 'button' : null,
              class: `cell cell-${cell.kind} ${info.className ?? ''}`,
              onClick: info.onClick,
              style,
              dataset: { key: cell.key },
              title: cell.kind === 'seat' ? seatLabel(cell.key, chart) : null,
            },
            info.text ? h('span', { class: 'cell-name' }, info.text) : null,
            info.sub ? h('span', { class: 'cell-sub' }, info.sub) : null,
          ),
        );
      } else {
        grid.append(h('div', { class: `cell cell-${cell.kind}`, style }, labelText(cell)));
      }
    }
  }
  return grid;
}
