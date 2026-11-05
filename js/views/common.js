// UI pieces shared by several pages.

import { getSeat } from '../chart.js';
import { h, saveFile, toast } from '../dom.js';
import { countRecords } from '../data.js';
import { t } from '../i18n.js';
import { formatDate, formatTimestamp, sessionLabel, slotPart } from '../format.js';
import { chartImage } from '../render/image.js';
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

/**
 * Session chooser: a button showing the current session that opens a bottom sheet listing
 * `items` ([{ date, slot }]) grouped by date. Used instead of a native <select>, whose
 * Android popup ignores the page styles, wraps every label and shows only a few options.
 * onPick(i) is called with the chosen index (only when it differs from `index`).
 */
export function sessionSelect(items, index, onPick) {
  const current = items[index];
  const open = () => {
    const rows = [];
    const groups = [];
    items.forEach((s, i) => {
      if (s.date !== items[i - 1]?.date) {
        groups.push(h('h3', { class: 'sheet-date' }, formatDate(s.date)));
      }
      const row = h(
        'button',
        {
          type: 'button',
          class: 'sheet-row',
          'aria-current': i === index ? 'true' : null,
          autofocus: i === index,
          onClick: () => {
            dialog.close();
            if (i !== index) onPick(i);
          },
        },
        h('span', {}, slotPart(s.slot)),
        h('span', { class: 'sheet-time' }, `${s.slot.start}–${s.slot.end}`),
      );
      rows.push(row);
      groups.push(row);
    });
    // With a mouse, drop down from the trigger like a select; on touch screens, a bottom sheet.
    const dropdown = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const dialog = h(
      'dialog',
      {
        class: dropdown ? 'sheet dropdown' : 'sheet',
        // A click on the dialog itself (not its content) is a click on the backdrop.
        onClick: (e) => e.target === dialog && dialog.close(),
        onClose: () => {
          removeEventListener('resize', close);
          dialog.remove();
        },
      },
      h(
        'div',
        { class: 'sheet-body' },
        dropdown ? null : h('div', { class: 'sheet-title' }, t('session.choose')),
        groups,
      ),
    );
    const close = () => dialog.close();
    if (dropdown) {
      const r = trigger.getBoundingClientRect();
      const below = innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 240 && above > below;
      Object.assign(dialog.style, {
        left: `${r.left}px`,
        width: `${r.width}px`,
        maxHeight: `${Math.min(up ? above : below, 480)}px`,
        ...(up ? { bottom: `${innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` }),
      });
      addEventListener('resize', close);
    }
    document.body.append(dialog);
    dialog.showModal();
    const row = rows[index];
    if (row) dialog.scrollTop = row.offsetTop - (dialog.clientHeight - row.offsetHeight) / 2;
  };
  const trigger = h(
    'button',
    { type: 'button', class: 'select-trigger', 'aria-haspopup': 'dialog', onClick: open },
    h('span', {}, current ? sessionLabel(current.date, current.slot) : ''),
  );
  return trigger;
}

/** ‹ (delta < 0) or › button stepping a picker; the chevron is drawn in CSS. */
export function stepButton(delta, onClick, disabled = false) {
  return h('button', {
    type: 'button',
    class: `btn step ${delta < 0 ? 'prev' : 'next'}`,
    'aria-label': t(delta < 0 ? 'nav.prev' : 'nav.next'),
    disabled,
    onClick,
  });
}

/**
 * Session chooser for the listed sessions (from listSessions) between ‹ › buttons for the
 * previous and next session. onChange({ date, slotId }).
 */
export function sessionPicker(list, date, slotId, onChange) {
  const index = list.findIndex((s) => s.date === date && s.slot.id === slotId);
  const go = (i) => onChange({ date: list[i].date, slotId: list[i].slot.id });
  const arrow = (delta) => stepButton(delta, () => go(index + delta), !list[index + delta]);
  return h('div', { class: 'session-picker' }, arrow(-1), sessionSelect(list, index, go), arrow(1));
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}` }, text);
}

const nameList = (list) => list.map((s) => s.name).join('、');

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
        names: nameList(summary.absent),
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
        names: nameList(summary.presentOnLeave),
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
  came: '#bfe8c9',
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
