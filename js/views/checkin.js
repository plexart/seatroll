// Check-in: the expected seat chart for the current (or chosen) session. Tapping a seat marks
// an expected student absent, or a student on leave as present after all.

import { getSeat } from '../chart.js';
import { findAttendance, now, sessionSummary, studentMap } from '../data.js';
import { toDateStr, toTimeStr } from '../dates.js';
import { copyAndShareText, h, saveFile, setChildren, toast } from '../dom.js';
import { formatDate, sessionLabel } from '../format.js';
import { t } from '../i18n.js';
import { renderSeatGrid } from '../render/seatgrid.js';
import { resolveSlot } from '../sessions.js';
import { commit, isUnmerged, onChange, prefs, state } from '../store.js';
import {
  exportCollections,
  exportName,
  sessionImage,
  sessionPicker,
  sessionText,
  seatStatus,
  viewToggle,
} from './common.js';

// The session being viewed: null = follow the clock, otherwise { date, slotId }. Kept across
// page switches so a volunteer filling in an old session does not lose their place.
let pinned = null;

function currentSession() {
  if (pinned) return pinned;
  const d = new Date();
  const date = toDateStr(d);
  return {
    date,
    slotId: resolveSlot(state.data.slots, state.data.schedule, date, toTimeStr(d)).id,
  };
}

export function renderCheckin(container) {
  const clock = h('div', { class: 'clock' });
  const tick = () => {
    const d = new Date();
    clock.textContent = `${formatDate(toDateStr(d))} ${d.toLocaleTimeString('zh-CN', { hour12: false })}`;
  };
  tick();
  const timer = setInterval(tick, 1000);

  const draw = () => {
    const { date, slotId } = currentSession();
    const summary = sessionSummary(state.data, date, slotId);
    const names = studentMap(state.data);

    const header = h(
      'section',
      { class: 'card session-card' },
      h(
        'div',
        { class: 'row space' },
        pinned ? h('strong', { class: 'pinned' }, t('checkin.pinned')) : clock,
        pinned
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn small',
                onClick: () => {
                  pinned = null;
                  draw();
                },
              },
              t('checkin.backToNow'),
            )
          : null,
      ),
      h('div', { class: 'session-title' }, sessionLabel(date, summary.slot)),
      sessionPicker(date, slotId, (s) => {
        pinned = s;
        draw();
      }),
    );

    if (!summary.chart) {
      setChildren(container, header, h('p', { class: 'empty' }, t('checkin.noChart')));
      return;
    }

    const toggle = (studentId) => {
      const status = seatStatus(summary, studentId);
      const record = findAttendance(state.data, date, slotId);
      const marks = { ...(record?.marks ?? {}) };
      if (status === 'expected') marks[studentId] = 'absent';
      else if (status === 'leave') marks[studentId] = 'presentOnLeave';
      else delete marks[studentId];
      save(marks);
    };
    const save = (marks) =>
      commit({
        attendance: [
          { date, slot: slotId, marks, by: prefs.volunteer || undefined, updatedAt: now() },
        ],
      });

    const stats = h(
      'div',
      { class: 'stats' },
      stat(t('stat.expected'), summary.expected.length),
      stat(t('stat.actual'), summary.actualCount, 'ok'),
      stat(t('stat.leave'), summary.onLeave.length, 'leave'),
      stat(t('stat.absent'), summary.absent.length, 'absent'),
      stat(t('stat.came'), summary.presentOnLeave.length, 'came'),
    );

    const grid = renderSeatGrid(summary.chart, prefs.view, (cell) => {
      if (cell.kind !== 'seat') return {};
      const id = getSeat(summary.chart, cell.key);
      const status = seatStatus(summary, id);
      return {
        text: id ? names.get(id)?.name : '',
        sub: status === 'expected' || status === 'empty' ? '' : t(`status.${status}`),
        className: `st-${status}`,
        onClick: id ? () => toggle(id) : null,
      };
    });

    const record = summary.record;
    const status = record
      ? h(
          'p',
          { class: 'muted small' },
          t('checkin.saved', {
            time: new Date(record.updatedAt).toLocaleString('zh-CN', { hour12: false }),
          }),
          record.by ? ` · ${record.by}` : '',
          isUnmerged('attendance', record) ? ` · ${t('common.unmerged')}` : '',
        )
      : h('p', { class: 'muted small' }, t('checkin.notSaved'));

    const actions = h(
      'div',
      { class: 'actions one-line' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: () => exportCollections(['attendance'], 'attendance'),
        },
        t('checkin.export'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: async () =>
            saveFile(await sessionImage(summary, names), exportName('checkin', 'png')),
        },
        t('common.image'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: async () =>
            toast(
              t(
                (await copyAndShareText(sessionText(summary)))
                  ? 'common.copied'
                  : 'common.copyFailed',
              ),
            ),
        },
        t('common.copy'),
      ),
      record
        ? null
        : h(
            'button',
            { type: 'button', class: 'btn primary', onClick: () => save({}) },
            t('checkin.confirm'),
          ),
    );

    setChildren(
      container,
      header,
      stats,
      h('div', { class: 'toolbar' }, viewToggle(draw)),
      h('div', { class: 'grid-scroll' }, grid),
      h('p', { class: 'hint' }, t('checkin.hint')),
      status,
      actions,
    );
  };

  draw();
  const off = onChange(draw);
  return () => {
    clearInterval(timer);
    off();
  };
}

function stat(label, value, kind = '') {
  return h('div', { class: `stat ${kind}` }, h('b', {}, String(value)), h('span', {}, label));
}
