// Leave editor. Leaves are mostly entered by pasting rows from a spreadsheet (name, reason,
// sessions) into the shown week or date; the grid below is for checking and small fixes.
// "Weekly" shows the regular sessions of one week (Friday evening, Saturday morning and
// afternoon); "specific date" shows all slots on one date, for holiday make-up lessons. Tapping a cell toggles leave for that student and session; changes save at once.

import { activeStudents, findLeave, now, parseLeavePaste, pastedLeaves } from '../data.js';
import { addDays, toDateStr, toTimeStr } from '../dates.js';
import { h, setChildren, toast } from '../dom.js';
import { formatShortDate, slotName, slotPart } from '../format.js';
import { t } from '../i18n.js';
import { daySessions, defaultLeaveWeek, weekSessions } from '../sessions.js';
import { commit, isUnmerged, onChange, state } from '../store.js';
import { exportCollections, segmented } from './common.js';

// Kept across page switches.
let mode = 'week';
let date = null;
let filter = '';
let pasteText = '';
let pasteProblems = [];

export function renderLeaves(container) {
  if (!date) {
    const d = new Date();
    date = defaultLeaveWeek(state.data.slots, toDateStr(d), toTimeStr(d));
  }

  const setLeave = (session, studentId, on, note) => {
    const existing = findLeave(state.data, session.date, session.slot.id);
    let students = (existing?.students ?? []).filter((s) => s.id !== studentId);
    if (on) students = [...students, note ? { id: studentId, note } : { id: studentId }];
    commit({ leaves: [{ date: session.date, slot: session.slot.id, students, updatedAt: now() }] });
  };

  const draw = () => {
    const sessions =
      mode === 'week' ? weekSessions(state.data.slots, date) : daySessions(state.data.slots, date);
    const leaveSets = sessions.map((s) => {
      const leave = findLeave(state.data, s.date, s.slot.id);
      return new Map((leave?.students ?? []).map((x) => [x.id, x.note ?? '']));
    });
    const students = activeStudents(state.data).filter((s) => !filter || s.name.includes(filter));

    const dateInput = h('input', {
      type: 'date',
      value: date,
      onChange: (e) => {
        if (e.target.value) {
          date = e.target.value;
          draw();
        }
      },
    });
    const step = (days) => () => {
      date = addDays(date, days);
      draw();
    };
    const filterInput = h('input', {
      type: 'search',
      value: filter,
      placeholder: t('leaves.filter'),
      onInput: (e) => {
        filter = e.target.value.trim();
        const pos = e.target.selectionStart;
        draw();
        const again = container.querySelector('input[type=search]');
        again.focus();
        again.setSelectionRange(pos, pos);
      },
    });

    const headerCells = sessions.map((s) =>
      h(
        'th',
        {},
        h('div', {}, mode === 'week' ? slotName(s.slot) : slotPart(s.slot)),
        h('div', { class: 'muted small' }, formatShortDate(s.date)),
      ),
    );

    const rows = students.map((st) => {
      const any = leaveSets.some((set) => set.has(st.id));
      const all = leaveSets.every((set) => set.has(st.id));
      return h(
        'tr',
        { class: any ? 'has-leave' : '' },
        h(
          'th',
          { scope: 'row' },
          h(
            'button',
            {
              type: 'button',
              class: 'name-btn',
              title: t('leaves.toggleAll'),
              onClick: () => {
                const note = leaveSets.map((set) => set.get(st.id)).find(Boolean) ?? '';
                for (const s of sessions) setLeave(s, st.id, !all, note);
              },
            },
            st.name,
          ),
        ),
        sessions.map((s, i) => {
          const on = leaveSets[i].has(st.id);
          return h(
            'td',
            {},
            h(
              'button',
              {
                type: 'button',
                class: `leave-cell ${on ? 'on' : ''}`,
                'aria-pressed': String(on),
                onClick: () => setLeave(s, st.id, !on, leaveSets[i].get(st.id)),
              },
              on ? t('status.leave') : '',
            ),
          );
        }),
      );
    });

    // Notes for students with leave in the shown sessions; one note applies to all of them.
    const withLeave = activeStudents(state.data).filter((st) =>
      leaveSets.some((set) => set.has(st.id)),
    );
    const notes = withLeave.map((st) => {
      const note = leaveSets.map((set) => set.get(st.id)).find(Boolean) ?? '';
      return h(
        'label',
        { class: 'field inline' },
        h('span', {}, st.name),
        h('input', {
          type: 'text',
          value: note,
          placeholder: t('leaves.notePlaceholder'),
          onChange: (e) => {
            for (const [i, s] of sessions.entries()) {
              if (leaveSets[i].has(st.id)) setLeave(s, st.id, true, e.target.value.trim());
            }
          },
        }),
      );
    });

    const pasteInput = h('textarea', {
      rows: 6,
      value: pasteText,
      placeholder: t(
        mode === 'week' ? 'leaves.pastePlaceholderWeek' : 'leaves.pastePlaceholderDay',
      ),
      onInput: (e) => {
        pasteText = e.target.value;
      },
    });
    const register = () => {
      if (!pasteText.trim()) return;
      const aliases = new Map();
      for (const slot of state.data.slots) {
        aliases.set(slotName(slot), slot.id);
        aliases.set(slotPart(slot), slot.id);
      }
      const shown = new Set(sessions.map((s) => s.slot.id));
      const parsed = parseLeavePaste(pasteText, activeStudents(state.data), aliases);
      const entries = parsed.entries.filter(
        (e) => !e.slotIds || e.slotIds.some((id) => shown.has(id)),
      );
      pasteProblems = [
        parsed.unknownNames.length &&
          t('leaves.pasteUnknownNames', { names: parsed.unknownNames.join('、') }),
        parsed.unknownSlots.length &&
          t('leaves.pasteUnknownSlots', { words: parsed.unknownSlots.join('、') }),
      ].filter(Boolean);
      if (!pasteProblems.length) pasteText = '';
      const changes = pastedLeaves(state.data, sessions, entries, now());
      toast(t('leaves.pasted', { n: new Set(entries.map((e) => e.studentId)).size }));
      if (changes.length) commit({ leaves: changes });
      else draw();
    };

    const unmerged = sessions.some((s) => {
      const leave = findLeave(state.data, s.date, s.slot.id);
      return leave && isUnmerged('leaves', leave);
    });

    setChildren(
      container,
      segmented(
        [
          { value: 'week', label: t('leaves.modeWeek') },
          { value: 'day', label: t('leaves.modeDay') },
        ],
        mode,
        (m) => {
          mode = m;
          draw();
        },
      ),
      h(
        'div',
        { class: 'row date-nav' },
        h(
          'button',
          { type: 'button', class: 'btn small', onClick: step(mode === 'week' ? -7 : -1) },
          '‹',
        ),
        dateInput,
        h(
          'button',
          { type: 'button', class: 'btn small', onClick: step(mode === 'week' ? 7 : 1) },
          '›',
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, t('leaves.paste')),
        pasteInput,
        pasteProblems.map((p) => h('p', { class: 'warn-text small' }, p)),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn primary', onClick: register },
            t('leaves.pasteButton'),
          ),
        ),
      ),
      h('h2', {}, t('leaves.grid')),
      h('p', { class: 'hint' }, t(mode === 'week' ? 'leaves.hintWeek' : 'leaves.hintDay')),
      filterInput,
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'leave-table' },
          h('thead', {}, h('tr', {}, h('th', {}, t('leaves.student')), headerCells)),
          h('tbody', {}, rows),
        ),
      ),
      notes.length ? h('section', { class: 'card' }, h('h2', {}, t('leaves.notes')), notes) : null,
      unmerged ? h('p', { class: 'muted small' }, t('common.unmergedHint')) : null,
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          { type: 'button', class: 'btn', onClick: () => exportCollections(['leaves'], 'leaves') },
          t('leaves.export'),
        ),
      ),
    );
  };

  draw();
  return onChange(draw);
}
