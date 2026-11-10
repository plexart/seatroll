// Reports: one session's sheet, per-student statistics over a date range, and a leave overview.

import {
  checkedSessions,
  findSlot,
  leaveOverview,
  rangeReport,
  sessionSummary,
  studentMap,
} from '../data.js';
import { monthRange, toDateStr, toTimeStr, weekRange } from '../dates.js';
import { copyAndShareText, h, saveFile, setChildren, toast } from '../dom.js';
import { formatDate, sessionLabel, slotPart } from '../format.js';
import { t } from '../i18n.js';
import { tableImage } from '../render/image.js';
import { listSessions, nextSessionDate } from '../sessions.js';
import { onChange, state } from '../store.js';
import {
  exportName,
  segmented,
  sessionImage,
  sessionSelect,
  sessionText,
  stepButton,
} from './common.js';

let tab = 'session';
let session = null;
let range = null;
let leaveRange = null;

export function renderReport(container) {
  const now = new Date();
  const today = toDateStr(now);
  range ??= monthRange(today);
  leaveRange ??= weekRange(nextSessionDate(listSessions(state.data), today, toTimeStr(now)));

  const draw = () => {
    const body =
      tab === 'session' ? sessionTab(draw) : tab === 'range' ? rangeTab(draw) : leaveTab(draw);
    setChildren(
      container,
      segmented(
        [
          { value: 'session', label: t('report.session') },
          { value: 'range', label: t('report.range') },
          { value: 'leaves', label: t('report.leaves') },
        ],
        tab,
        (v) => {
          tab = v;
          draw();
        },
      ),
      body,
    );
  };
  draw();
  return onChange(draw);
}

const copyButton = (getText) =>
  h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onClick: async () =>
        toast(t((await copyAndShareText(getText())) ? 'common.copied' : 'common.copyFailed')),
    },
    t('common.copyText'),
  );

const imageButton = (getBlob, kind, label = t('common.image')) =>
  h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onClick: () => saveFile(getBlob(), exportName(kind, 'png')),
    },
    label,
  );

/** Two date inputs between ‹ › buttons; `shift(±1)` gives the previous / next range. */
function rangePicker(value, onChange, shift) {
  const from = h('input', { type: 'date', value: value.from });
  const to = h('input', { type: 'date', value: value.to });
  const update = () => {
    if (from.value && to.value && from.value <= to.value)
      onChange({ from: from.value, to: to.value });
  };
  from.addEventListener('change', update);
  to.addEventListener('change', update);
  const arrow = (delta) => stepButton(delta, () => onChange(shift(delta)));
  return h('div', { class: 'session-picker' }, arrow(-1), from, h('span', {}, '–'), to, arrow(1));
}

function nameSection(title, list, render, kind) {
  return h(
    'section',
    { class: `card names ${kind}` },
    h('h2', {}, `${title}（${list.length}）`),
    list.length
      ? h(
          'ul',
          {},
          list.map((s) => h('li', {}, render(s))),
        )
      : h('p', { class: 'muted small' }, t('report.none')),
  );
}

function sessionTab(draw) {
  const list = checkedSessions(state.data);
  if (!list.length) return h('p', { class: 'empty' }, t('report.noCheckins'));
  if (!list.some((s) => s.date === session?.date && s.slot === session?.slot)) session = list[0];
  const summary = sessionSummary(state.data, session.date, session.slot);
  const names = studentMap(state.data);
  const items = list.map((s) => ({ date: s.date, slot: findSlot(state.data, s.slot) }));
  const index = list.findIndex((s) => s.date === session.date && s.slot === session.slot);
  const select = sessionSelect(items, index, (i) => {
    session = list[i];
    draw();
  });
  const picker = h('div', { class: 'session-picker' }, select);
  if (!summary.chart) return h('div', {}, picker, h('p', { class: 'empty' }, t('checkin.noChart')));
  return h(
    'div',
    {},
    picker,
    h('h2', { class: 'session-title' }, sessionLabel(summary.date, summary.slot)),
    h(
      'p',
      { class: summary.record ? 'muted' : 'warn-text' },
      !summary.record
        ? t('text.notChecked')
        : summary.record.by
          ? t('report.checkedBy', { by: summary.record.by })
          : t('report.checked'),
    ),
    h(
      'div',
      { class: 'stats' },
      ...[
        ['stat.expected', summary.expected.length, ''],
        ['stat.actual', summary.actualCount, 'ok'],
        ['stat.leave', summary.onLeave.length, 'leave'],
        ['stat.absent', summary.absent.length, 'absent'],
        ['stat.came', summary.presentOnLeave.length, 'came'],
      ].map(([k, v, c]) =>
        h('div', { class: `stat ${c}` }, h('b', {}, String(v)), h('span', {}, t(k))),
      ),
    ),
    nameSection(t('stat.absent'), summary.absent, (s) => s.name, 'absent'),
    nameSection(
      t('stat.leave'),
      summary.onLeave,
      (s) => (s.note ? `${s.name}（${s.note}）` : s.name),
      'leave',
    ),
    nameSection(t('stat.came'), summary.presentOnLeave, (s) => s.name, 'came'),
    h(
      'div',
      { class: 'actions' },
      imageButton(() => sessionImage(summary, names), 'session'),
      copyButton(() => sessionText(summary)),
    ),
  );
}

function rangeTab(draw) {
  const report = rangeReport(state.data, range.from, range.to);
  const picker = rangePicker(
    range,
    (r) => {
      range = r;
      draw();
    },
    (delta) => monthRange(range.from, delta),
  );
  const sessionRows = report.sessions.map((s) => [
    formatDate(s.date),
    slotPart(s.slot),
    s.expected.length,
    s.record ? s.actualCount : '-',
    s.onLeave.length,
    s.record ? s.absent.length : '-',
    s.record ? '✓' : '–',
  ]);
  const sessionHeader = [
    'report.date',
    'report.slot',
    'stat.expected',
    'stat.actual',
    'stat.leave',
    'stat.absent',
    'report.checkedCol',
  ].map((k) => t(k));
  const studentHeader = [
    'leaves.student',
    'report.present',
    'stat.absent',
    'stat.leave',
    'stat.came',
  ].map((k) => t(k));
  const studentRows = report.students.map((s) => [
    s.name,
    s.present,
    s.absent,
    s.leave,
    s.presentOnLeave,
  ]);
  const title = t('report.rangeTitle', { cls: state.cls.name, from: range.from, to: range.to });

  const text = () =>
    [
      title,
      ...report.sessions.map((s) => sessionText(s)),
      '',
      t('report.students'),
      ...report.students
        .filter((s) => s.absent || s.leave || s.presentOnLeave)
        .map((s) =>
          t('report.studentLine', {
            name: s.name,
            absent: s.absent,
            leave: s.leave,
            came: s.presentOnLeave,
          }),
        ),
    ].join('\n');

  // Nothing to show or export for a range without sessions (e.g. a future month).
  if (!report.sessions.length)
    return h('div', {}, picker, h('p', { class: 'empty' }, t('report.none')));

  return h(
    'div',
    {},
    picker,
    h('h2', {}, t('report.sessions', { n: report.sessions.length })),
    table(sessionHeader, sessionRows),
    h('h2', {}, t('report.students')),
    table(studentHeader, studentRows, (row) => (row[2] > 0 ? 'row-absent' : '')),
    h(
      'div',
      { class: 'actions' },
      imageButton(
        () =>
          tableImage({
            title,
            subtitle: t('report.sessions', { n: report.sessions.length }),
            header: studentHeader,
            rows: studentRows,
          }),
        'students',
        t('report.studentsImage'),
      ),
      imageButton(
        () => tableImage({ title, header: sessionHeader, rows: sessionRows }),
        'sessions',
        t('report.sessionsImage'),
      ),
      copyButton(text),
    ),
  );
}

function leaveTab(draw) {
  const overview = leaveOverview(state.data, leaveRange.from, leaveRange.to);
  const picker = rangePicker(
    leaveRange,
    (r) => {
      leaveRange = r;
      draw();
    },
    (delta) => weekRange(leaveRange.from, delta),
  );
  const line = (s) => (s.note ? `${s.name}（${s.note}）` : s.name);
  const text = () =>
    [
      t('report.leaveTitle', { cls: state.cls.name }),
      ...overview.map((o) => `${sessionLabel(o.date, o.slot)}：${o.students.map(line).join('、')}`),
    ].join('\n');
  return h(
    'div',
    {},
    picker,
    overview.length
      ? overview.map((o) =>
          h(
            'section',
            { class: 'card names leave' },
            h('h2', {}, `${sessionLabel(o.date, o.slot)}（${o.students.length}）`),
            h(
              'ul',
              {},
              o.students.map((s) => h('li', {}, line(s))),
            ),
          ),
        )
      : h('p', { class: 'empty' }, t('report.none')),
    overview.length > 0 && h('div', { class: 'actions' }, copyButton(text)),
  );
}

function table(header, rows, rowClass = () => '') {
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'data-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          header.map((x) => h('th', {}, x)),
        ),
      ),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            { class: rowClass(r) },
            r.map((x) => h('td', {}, String(x))),
          ),
        ),
      ),
    ),
  );
}
