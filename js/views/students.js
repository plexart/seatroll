// Student roster: add students by pasting names, rename, mark as left (archived).

import { newId, now } from '../data.js';
import { h, setChildren, toast } from '../dom.js';
import { t } from '../i18n.js';
import { commit, isUnmerged, onChange, state } from '../store.js';

/** Splits pasted text into names: one per line, or separated by spaces, commas or 、. */
export function parseNames(text) {
  return text
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function renderStudents(container) {
  const draw = () => {
    const students = [...state.data.students].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const active = students.filter((s) => !s.archived);
    const archived = students.filter((s) => s.archived);
    const input = h('textarea', { rows: 4, placeholder: t('students.addPlaceholder') });

    const add = () => {
      const existing = new Set(state.data.students.map((s) => s.name));
      const names = [...new Set(parseNames(input.value))];
      const fresh = names.filter((n) => !existing.has(n));
      if (!names.length) return;
      if (fresh.length) {
        commit({ students: fresh.map((name) => ({ id: newId('s'), name, updatedAt: now() })) });
      }
      const dup = names.length - fresh.length;
      toast(
        t('students.added', { n: fresh.length }) +
          (dup ? t('students.duplicates', { n: dup }) : ''),
      );
    };

    const row = (s) =>
      h(
        'li',
        { class: 'student-row' },
        h('input', {
          type: 'text',
          value: s.name,
          'aria-label': t('students.name'),
          onChange: (e) => {
            const name = e.target.value.trim();
            if (name && name !== s.name) commit({ students: [{ ...s, name, updatedAt: now() }] });
            else e.target.value = s.name;
          },
        }),
        isUnmerged('students', s) ? h('span', { class: 'badge warn' }, t('common.unmerged')) : null,
        h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onClick: () =>
              commit({ students: [{ ...s, archived: !s.archived, updatedAt: now() }] }),
          },
          t(s.archived ? 'students.restore' : 'students.archive'),
        ),
      );

    setChildren(
      container,
      h(
        'section',
        { class: 'card' },
        h('h2', {}, t('students.add')),
        input,
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn primary', onClick: add },
            t('students.addButton'),
          ),
        ),
        h('p', { class: 'muted small' }, t('students.privacy')),
      ),
      h('h2', {}, t('students.active', { n: active.length })),
      h('ul', { class: 'student-list' }, active.map(row)),
      archived.length ? h('h2', {}, t('students.archived', { n: archived.length })) : null,
      archived.length ? h('ul', { class: 'student-list' }, archived.map(row)) : null,
    );
  };
  draw();
  return onChange(draw);
}
