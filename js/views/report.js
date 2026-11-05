// Reports: one session's sheet, per-student statistics over a date range, and a leave overview.

import {
  checkedSessions,
  findSlot,
  leaveOverview,
  rangeReport,
  sessionSummary,
  studentMap,
} from '../data.js';
import { addDays, toDateStr } from '../dates.js';
import { copyText, h, saveFile, setChildren, toast } from '../dom.js';
import { formatDate, sessionLabel, slotPart } from '../format.js';
import { t } from '../i18n.js';
import { tableImage } from '../render/image.js';
import { onChange, state } from '../store.js';
import { exportName, segmented, sessionImage, sessionText } from './common.js';

let tab = 'session';
let session = null;
let range = null;
let leaveRange = null;

export function renderReport(container) {
  const today = toDateStr(new Date());
  range ??= { from: addDays(today, -27), to: today };
  leaveRange ??= { from: addDays(today, -7), to: addDays(today, 21) };

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
        toast(t((await copyText(getText())) ? 'common.copied' : 'common.copyFailed')),
    },
    t('common.copyText'),
  );

const imageButton = (getBlob, kind, label = t('common.image')) =>
  h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onClick: async () => saveFile(await getBlob(), exportName(kind, 'png')),
    },
    label,
  );

function rangePicker(value, onChange) {
  const from = h('input', { type: 'date', value: value.from });
  const to = h('input', { type: 'date', value: value.to });
  const update = () => {
    if (from.value && to.value && from.value <= to.value)
      onChange({ from: from.value, to: to.value });
  };
  from.addEventListener('change', update);
  to.addEventListener('change', update);
  return h('div', { class: 'session-picker' }, from, h('span', {}, '–'), to);
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
  const select = h(
    'select',
    {
      onChange: () => {
        session = list[Number(select.value)];
        draw();
      },
    },
    list.map((s, i) =>
      h(
        'option',
        { value: String(i), selected: s.date === session.date && s.slot === session.slot },
        sessionLabel(s.date, findSlot(state.data, s.slot)),
      ),
    ),
  );
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
  const picker = rangePicker(range, (r) => {
    range = r;
    draw();
  });
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

  return h(
    'div',
    {},
    picker,
    h('h2', {}, t('report.sessions', { n: report.sessions.length })),
    report.sessions.length
      ? table(sessionHeader, sessionRows)
      : h('p', { class: 'empty' }, t('report.none')),
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
  const picker = rangePicker(leaveRange, (r) => {
    leaveRange = r;
    draw();
  });
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
    h('div', { class: 'actions' }, copyButton(text)),
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
