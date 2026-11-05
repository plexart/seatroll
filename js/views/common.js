// UI pieces shared by several pages.

import { getSeat } from '../chart.js';
import { h, saveFile, toast } from '../dom.js';
import { countRecords } from '../data.js';
import { t } from '../i18n.js';
import { formatTimestamp, sessionLabel } from '../format.js';
import { chartImage } from '../render/image.js';
import { seatLabel } from '../render/seatgrid.js';
import { exportChangeset, prefs, state } from '../store.js';

/** Segmented control. options: [{ value, label }]. */
export function segmented(options, value, onChange, className = '') {
  return h(
    'div',
    { class: `segmented ${className}`, role: 'group' },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: o.value === value ? 'active' : '',
          'aria-pressed': String(o.value === value),
          onClick: () => o.value !== value && onChange(o.value),
        },
        o.label,
      ),
    ),
  );
}

/** Podium / seat view switch; the choice is remembered for all pages. */
export function viewToggle(onChange) {
  return segmented(
    [
      { value: 'podium', label: t('view.podium') },
      { value: 'seat', label: t('view.seat') },
    ],
    prefs.view,
    (v) => {
      prefs.view = v;
      onChange(v);
    },
    'view-toggle',
  );
}

/** Date input plus slot select. onChange({ date, slotId }). */
export function sessionPicker(date, slotId, onChange) {
  const dateInput = h('input', {
    type: 'date',
    value: date,
    onChange: () =>
      dateInput.value && onChange({ date: dateInput.value, slotId: slotSelect.value }),
  });
  const slotSelect = h(
    'select',
    { onChange: () => onChange({ date: dateInput.value, slotId: slotSelect.value }) },
    state.data.slots.map((s) =>
      h('option', { value: s.id, selected: s.id === slotId }, `${s.start}–${s.end}`),
    ),
  );
  return h('div', { class: 'session-picker' }, dateInput, slotSelect);
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}` }, text);
}

const nameList = (list, chart) =>
  list
    .map((s) => (chart && s.seat ? `${s.name}（${seatLabel(s.seat, chart)}）` : s.name))
    .join('、');

/** Plain-text session report for pasting into a group chat. */
export function sessionText(summary) {
  const lines = [
    t('text.title', { cls: state.cls.name, session: sessionLabel(summary.date, summary.slot) }),
    t('text.counts', {
      expected: summary.expected.length,
      actual: summary.actualCount,
      leave: summary.onLeave.length,
    }),
  ];
  if (!summary.record) lines.push(t('text.notChecked'));
  if (summary.absent.length) {
    lines.push(
      t('text.absent', {
        n: summary.absent.length,
        names: nameList(summary.absent, summary.chart),
      }),
    );
  } else if (summary.record) {
    lines.push(t('text.allPresent'));
  }
  if (summary.onLeave.length) {
    lines.push(
      t('text.leave', {
        n: summary.onLeave.length,
        names: summary.onLeave.map((s) => (s.note ? `${s.name}（${s.note}）` : s.name)).join('、'),
      }),
    );
  }
  if (summary.presentOnLeave.length) {
    lines.push(
      t('text.presentOnLeave', {
        n: summary.presentOnLeave.length,
        names: nameList(summary.presentOnLeave, null),
      }),
    );
  }
  if (summary.record?.by) lines.push(t('text.by', { name: summary.record.by }));
  return lines.join('\n');
}

/** Seat status for a session: 'empty' | 'expected' | 'leave' | 'absent' | 'came'. */
export function seatStatus(summary, studentId) {
  if (!studentId) return 'empty';
  const mark = summary.record?.marks?.[studentId];
  const onLeave = summary.onLeave.some((s) => s.id === studentId);
  if (onLeave) return mark === 'presentOnLeave' ? 'came' : 'leave';
  return mark === 'absent' ? 'absent' : 'expected';
}

const IMAGE_FILLS = {
  expected: '#eef4fb',
  leave: '#d1d5db',
  absent: '#f8b4b4',
  came: '#fcd9a8',
  empty: '#ffffff',
};

/** PNG of the session's seat chart with statuses. */
export function sessionImage(summary, names) {
  return chartImage(summary.chart, prefs.view, {
    title: `${state.cls.name} ${sessionLabel(summary.date, summary.slot)}`,
    subtitle: `${t(`view.${prefs.view}`)} · ${t('text.counts', {
      expected: summary.expected.length,
      actual: summary.actualCount,
      leave: summary.onLeave.length,
    })}`,
    seat: (cell) => {
      const id = getSeat(summary.chart, cell.key);
      const status = seatStatus(summary, id);
      return {
        text: id ? names.get(id)?.name : '',
        sub: status === 'expected' || status === 'empty' ? '' : t(`status.${status}`),
        fill: IMAGE_FILLS[status],
      };
    },
    legend: ['absent', 'leave', 'came'].map((s) => ({
      fill: IMAGE_FILLS[s],
      text: t(`status.${s}`),
    })),
  });
}

export function chartTitle(chart) {
  return t('seats.effective', { time: formatTimestamp(chart.effectiveFrom) });
}

/** Builds a timestamped file name like seatroll-demo-leaves-20261105-0930.json. */
export function exportName(kind, ext = 'json') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `seatroll-${state.cls.id}-${kind}-${stamp}.${ext}`;
}

/** Exports the unmerged records of some collections as a changeset file. */
export async function exportCollections(collections, kind) {
  const changeset = exportChangeset(collections);
  if (!countRecords(changeset)) {
    toast(t('export.nothing'));
    return;
  }
  const json = JSON.stringify(changeset, null, 2) + '\n';
  await saveFile(new Blob([json], { type: 'application/json' }), exportName(kind));
}
