// Seat charts: list of charts with their effective time, and the chart editor.
//
// Editing is tap-to-select then tap-to-place: tap a student (in a seat or in the unseated
// tray) to select it, then tap a seat to put the student there. Seat to seat swaps; tray to
// an occupied seat sends the occupant back to the tray.

import {
  assign,
  cloneChart,
  createChart,
  getSeat,
  parseKey,
  resize,
  screenToColDelta,
  seatMap,
  setPodium,
  shiftCols,
  shiftRows,
  swap,
  toggleDisabled,
  toggleFrontSeat,
  unseat,
} from '../chart.js';
import { activeChart, activeStudents, liveCharts, newId, now, studentMap } from '../data.js';
import { toDateStr, toTimeStr } from '../dates.js';
import { h, saveFile, setChildren, toast } from '../dom.js';
import { t } from '../i18n.js';
import { chartImage } from '../render/image.js';
import { renderSeatGrid, seatLabel } from '../render/seatgrid.js';
import { commit, isUnmerged, prefs, state } from '../store.js';
import {
  badge,
  chartTitle,
  exportCollections,
  exportName,
  segmented,
  viewToggle,
} from './common.js';

const nowStamp = () => {
  const d = new Date();
  return `${toDateStr(d)}T${toTimeStr(d)}`;
};

// ------------------------------------------------------------------ draft persistence

// The chart being edited survives reloads and page switches until saved or discarded.
const draftKey = () => `seatroll:draft:${state.cls.id}`;

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) ?? 'null');
  } catch {
    return null;
  }
}

function storeDraft(chart) {
  try {
    if (chart) localStorage.setItem(draftKey(), JSON.stringify(chart));
    else localStorage.removeItem(draftKey());
  } catch {
    // Without storage the draft just lives in memory.
  }
}

// ------------------------------------------------------------------ list

export function renderSeatList(container, ctx) {
  const at = nowStamp();
  const current = activeChart(state.data, at);
  const charts = liveCharts(state.data).reverse();
  const draft = loadDraft();

  const startNew = (base) => {
    const chart = base
      ? { ...cloneChart(base), id: newId('chart-'), effectiveFrom: at }
      : createChart({ id: newId('chart-'), effectiveFrom: at });
    delete chart.updatedAt;
    storeDraft(chart);
    ctx.navigate(`/seats/${chart.id}`);
  };

  const items = charts.map((chart) => {
    const count = seatMap(chart).size;
    return h(
      'a',
      { class: 'list-item', href: `#/seats/${encodeURIComponent(chart.id)}` },
      h(
        'div',
        {},
        h('div', { class: 'list-title' }, chartTitle(chart)),
        h(
          'div',
          { class: 'muted small' },
          t('seats.summary', { rows: chart.rows, cols: chart.cols, count }),
        ),
      ),
      h(
        'div',
        { class: 'badges' },
        chart === current ? badge(t('seats.current'), 'ok') : null,
        chart.effectiveFrom > at ? badge(t('seats.upcoming')) : null,
        isUnmerged('seatCharts', chart) ? badge(t('common.unmerged'), 'warn') : null,
        draft?.id === chart.id ? badge(t('seats.hasDraft'), 'warn') : null,
      ),
    );
  });

  setChildren(
    container,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary',
          onClick: () => startNew(current ?? charts[0]),
          disabled: !charts.length,
        },
        t('seats.newFromCurrent'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn', onClick: () => startNew(null) },
        t('seats.newBlank'),
      ),
    ),
    draft && !charts.some((c) => c.id === draft.id)
      ? h(
          'a',
          { class: 'list-item draft', href: `#/seats/${encodeURIComponent(draft.id)}` },
          h('div', { class: 'list-title' }, chartTitle(draft)),
          badge(t('seats.hasDraft'), 'warn'),
        )
      : null,
    items.length ? h('div', { class: 'list' }, items) : h('p', { class: 'empty' }, t('seats.none')),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: () => exportCollections(['seatCharts', 'students'], 'seats'),
        },
        t('seats.export'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ editor

export function renderSeatEditor(container, ctx) {
  const [id] = ctx.params;
  const saved = state.data.seatCharts.find((c) => c.id === id && !c.deleted);
  const stored = loadDraft();
  let chart = stored?.id === id ? stored : saved ? cloneChart(saved) : null;
  if (!chart) {
    setChildren(container, h('p', { class: 'empty' }, t('seats.notFound')));
    return;
  }
  const isDraft = () => JSON.stringify(chart) !== JSON.stringify(saved ?? null);
  const history = [];
  let selection = null; // { type: 'tray', id } | { type: 'seat', key }
  let mode = 'arrange'; // 'arrange' | 'layout'

  const update = (next) => {
    history.push(chart);
    if (history.length > 50) history.shift();
    chart = next;
    selection = null;
    storeDraft(chart);
    draw();
  };

  const undo = () => {
    if (!history.length) return;
    chart = history.pop();
    selection = null;
    storeDraft(chart);
    draw();
  };

  // --- arrange mode taps
  const tapSeat = (key) => {
    const occupant = getSeat(chart, key);
    if (!selection) {
      if (occupant) selection = { type: 'seat', key };
    } else if (selection.type === 'seat') {
      if (selection.key === key) selection = null;
      else return update(swap(chart, selection.key, key));
    } else {
      const { chart: next, displaced } = assign(chart, key, selection.id);
      if (displaced) toast(t('seats.displaced', { name: names.get(displaced)?.name ?? '' }));
      return update(next);
    }
    draw();
  };

  const tapTray = (studentId) => {
    if (selection?.type === 'seat') {
      const { chart: next } = assign(chart, selection.key, studentId);
      return update(next);
    }
    selection =
      selection?.type === 'tray' && selection.id === studentId
        ? null
        : { type: 'tray', id: studentId };
    draw();
  };

  // --- layout mode taps
  const tapLayout = (cell) => {
    const k = parseKey(cell.key);
    if (k.area === 'front') update(toggleFrontSeat(chart, k.col));
    else update(toggleDisabled(chart, k.row, k.col));
  };

  let names = studentMap(state.data);

  const draw = () => {
    names = studentMap(state.data);
    const seated = seatMap(chart);
    const tray = activeStudents(state.data).filter((s) => !seated.has(s.id));
    const view = prefs.view;

    const effective = h('input', {
      type: 'datetime-local',
      value: chart.effectiveFrom,
      onChange: (e) =>
        e.target.value &&
        update({ ...cloneChart(chart), effectiveFrom: e.target.value.slice(0, 16) }),
    });

    const grid = renderSeatGrid(chart, view, (cell) => {
      if (mode === 'layout') {
        const info = { onClick: () => tapLayout(cell) };
        if (cell.kind === 'seat') {
          const sid = getSeat(chart, cell.key);
          return { ...info, text: sid ? names.get(sid)?.name : '', className: 'layout-seat' };
        }
        return { ...info, text: '+', className: 'layout-add' };
      }
      if (cell.kind !== 'seat') return {};
      const sid = getSeat(chart, cell.key);
      const selected = selection?.type === 'seat' && selection.key === cell.key;
      const target = selection && !selected;
      return {
        text: sid ? (names.get(sid)?.name ?? '?') : '',
        className: [sid ? 'st-expected' : 'st-empty', selected && 'selected', target && 'target']
          .filter(Boolean)
          .join(' '),
        onClick: () => tapSeat(cell.key),
      };
    });

    const shiftBar = h(
      'div',
      { class: 'shift-bar' },
      h(
        'button',
        { type: 'button', class: 'btn small', onClick: () => update(shiftRows(chart, -1)) },
        t('seats.shiftForward'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn small', onClick: () => update(shiftRows(chart, 1)) },
        t('seats.shiftBackward'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small',
          onClick: () => update(shiftCols(chart, screenToColDelta(view, -1))),
        },
        t('seats.shiftLeft'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small',
          onClick: () => update(shiftCols(chart, screenToColDelta(view, 1))),
        },
        t('seats.shiftRight'),
      ),
    );

    const hint = (() => {
      if (mode === 'layout') return t('seats.hintLayout');
      if (!selection) return t('seats.hintIdle');
      if (selection.type === 'tray')
        return t('seats.hintTray', { name: names.get(selection.id)?.name ?? '' });
      const sid = getSeat(chart, selection.key);
      return t('seats.hintSeat', {
        name: names.get(sid)?.name ?? '',
        seat: seatLabel(selection.key),
      });
    })();

    const trayEl = h(
      'section',
      { class: `tray ${selection?.type === 'seat' ? 'target' : ''}` },
      h(
        'div',
        { class: 'row space' },
        h('h2', {}, t('seats.tray', { n: tray.length })),
        selection?.type === 'seat'
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn small',
                onClick: () => update(unseat(chart, selection.key)),
              },
              t('seats.unseat'),
            )
          : null,
      ),
      tray.length
        ? h(
            'div',
            { class: 'chips' },
            tray.map((s) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `chip ${selection?.type === 'tray' && selection.id === s.id ? 'selected' : ''}`,
                  onClick: () => tapTray(s.id),
                },
                s.name,
              ),
            ),
          )
        : h('p', { class: 'muted small' }, t('seats.trayEmpty')),
      h('a', { class: 'small', href: '#/students' }, t('seats.manageStudents')),
    );

    const layoutForm = h(
      'div',
      { class: 'layout-form' },
      numberField(t('seats.rows'), chart.rows, 1, 15, (n) => update(resize(chart, n, chart.cols))),
      numberField(t('seats.cols'), chart.cols, 1, 15, (n) => update(resize(chart, chart.rows, n))),
      numberField(t('seats.podium'), chart.podium + 1, 1, chart.cols, (n) =>
        update(setPodium(chart, n - 1)),
      ),
    );

    const save = () => {
      const record = { ...cloneChart(chart), updatedAt: now() };
      const clash = liveCharts(state.data).find(
        (c) => c.id !== chart.id && c.effectiveFrom === chart.effectiveFrom,
      );
      if (clash) {
        toast(t('seats.sameTime'));
        return;
      }
      commit({ seatCharts: [record] });
      storeDraft(null);
      toast(t('common.saved'));
      ctx.navigate('/seats');
    };

    const discard = () => {
      if (!confirm(t('seats.confirmDiscard'))) return;
      storeDraft(null);
      ctx.navigate('/seats');
    };

    const remove = () => {
      if (!confirm(t('seats.confirmDelete'))) return;
      commit({ seatCharts: [{ id: chart.id, deleted: true, updatedAt: now() }] });
      storeDraft(null);
      ctx.navigate('/seats');
    };

    const image = async () => {
      const blob = await chartImage(chart, view, {
        title: `${state.cls.name} ${t('page.seats')}`,
        subtitle: `${chartTitle(chart)} · ${t(`view.${view}`)}`,
        seat: (cell) => {
          const sid = getSeat(chart, cell.key);
          return { text: sid ? names.get(sid)?.name : '' };
        },
      });
      saveFile(blob, exportName('seats', 'png'));
    };

    setChildren(
      container,
      h('label', { class: 'field' }, h('span', {}, t('seats.effectiveFrom')), effective),
      h(
        'div',
        { class: 'row space wrap' },
        segmented(
          [
            { value: 'arrange', label: t('seats.modeArrange') },
            { value: 'layout', label: t('seats.modeLayout') },
          ],
          mode,
          (m) => {
            mode = m;
            selection = null;
            draw();
          },
        ),
        viewToggle(draw),
      ),
      mode === 'arrange' ? shiftBar : layoutForm,
      h('p', { class: 'hint' }, hint),
      h('div', { class: 'grid-scroll' }, grid),
      mode === 'arrange' ? trayEl : null,
      h(
        'div',
        { class: 'actions sticky' },
        h(
          'button',
          { type: 'button', class: 'btn primary', onClick: save, disabled: !isDraft() },
          t('common.save'),
        ),
        h(
          'button',
          { type: 'button', class: 'btn', onClick: undo, disabled: !history.length },
          t('seats.undo'),
        ),
        h('button', { type: 'button', class: 'btn', onClick: image }, t('common.image')),
        isDraft() && saved
          ? h('button', { type: 'button', class: 'btn', onClick: discard }, t('seats.discard'))
          : null,
        saved
          ? h(
              'button',
              { type: 'button', class: 'btn danger', onClick: remove },
              t('common.delete'),
            )
          : null,
        !saved
          ? h('button', { type: 'button', class: 'btn', onClick: discard }, t('seats.discard'))
          : null,
      ),
    );
  };

  draw();
}

function numberField(label, value, min, max, onChange) {
  const input = h('input', {
    type: 'number',
    inputMode: 'numeric',
    min,
    max,
    value,
    onChange: () => {
      const n = Number(input.value);
      if (Number.isInteger(n) && n >= min && n <= max && n !== value) onChange(n);
      else input.value = value;
    },
  });
  return h('label', { class: 'field inline' }, h('span', {}, label), input);
}
