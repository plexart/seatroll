// Renders a seat chart as a CSS grid of cells, in the orientation of the chosen view.

import { layout, parseKey } from '../chart.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';

/** Human-readable seat position, e.g. "3行5列" or "讲台旁3列". */
export function seatLabel(key) {
  if (!key) return t('seat.none');
  const k = parseKey(key);
  return k.area === 'front'
    ? t('seat.front', { col: k.col + 1 })
    : t('seat.main', { row: k.row + 1, col: k.col + 1 });
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
    style: `--cols: ${chart.cols}`,
  });
  for (const row of rows) {
    for (const cell of row) {
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
              dataset: { key: cell.key },
              title: cell.kind === 'seat' ? seatLabel(cell.key) : null,
            },
            info.text ? h('span', { class: 'cell-name' }, info.text) : null,
            info.sub ? h('span', { class: 'cell-sub' }, info.sub) : null,
          ),
        );
      } else {
        grid.append(h('div', { class: `cell cell-${cell.kind}` }, labelText(cell)));
      }
    }
  }
  return grid;
}
