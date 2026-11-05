// Settings: class switching, volunteer name, unmerged data (export / import / clear), install.

import { COLLECTIONS } from '../data.js';
import { h, setChildren, toast } from '../dom.js';
import { t } from '../i18n.js';
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  onInstallChange,
  promptInstall,
} from '../install.js';
import {
  clearOverlay,
  closeClass,
  forgetPassword,
  importChangeset,
  onChange,
  overlayCounts,
  prefs,
  state,
} from '../store.js';
import { APP_VERSION } from '../version.js';
import { exportCollections } from './common.js';

function classCard(ctx) {
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, t('settings.class')),
    h('p', {}, state.cls.name),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn danger',
          onClick: () => {
            if (!confirm(t('settings.confirmLogout'))) return;
            forgetPassword(state.cls.id);
            closeClass();
            ctx.navigate('/login');
          },
        },
        t('settings.logout'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn', onClick: () => ctx.navigate('/login') },
        t('settings.switchClass'),
      ),
    ),
    h(
      'a',
      { class: 'list-item', href: '#/students' },
      t('page.students'),
      h('span', { class: 'muted' }, '›'),
    ),
  );
}

function volunteerCard() {
  return h(
    'section',
    { class: 'card' },
    h(
      'label',
      { class: 'field' },
      h('span', {}, t('settings.volunteer')),
      h('input', {
        type: 'text',
        value: prefs.volunteer,
        placeholder: t('settings.volunteerPlaceholder'),
        onChange: (e) => {
          prefs.volunteer = e.target.value;
          toast(t('common.saved'));
        },
      }),
    ),
    h('p', { class: 'muted small' }, t('settings.volunteerHint')),
  );
}

function dataCard() {
  const counts = overlayCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    multiple: true,
    hidden: true,
    onChange: async (e) => {
      const messages = [];
      for (const file of e.target.files) {
        try {
          const counts = importChangeset(JSON.parse(await file.text()));
          const changed = Object.entries(counts)
            .map(([k, n]) => `${t(`collection.${k}`)} ${n}`)
            .join('，');
          messages.push(
            t('import.done', { file: file.name, changes: changed || t('import.noChanges') }),
          );
        } catch (err) {
          messages.push(
            t('import.failed', {
              file: file.name,
              reason: t(`import.error.${err.code ?? 'notChangeset'}`),
            }),
          );
        }
      }
      e.target.value = '';
      alert(messages.join('\n'));
    },
  });
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, t('settings.data')),
    h('p', { class: 'muted small' }, t('settings.dataHint')),
    h(
      'ul',
      { class: 'counts' },
      COLLECTIONS.map((k) =>
        h('li', {}, h('span', {}, t(`collection.${k}`)), h('b', {}, String(counts[k]))),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn danger',
          disabled: !total,
          onClick: () => confirm(t('settings.confirmClear')) && clearOverlay(),
        },
        t('settings.clear'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn', onClick: () => fileInput.click() },
        t('settings.import'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary',
          disabled: !total,
          onClick: () => exportCollections(COLLECTIONS, 'all'),
        },
        t('settings.exportAll'),
      ),
    ),
    fileInput,
  );
}

function installCard(redraw) {
  if (isStandalone()) return null;
  onInstallChange(redraw);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, t('install.title')),
    h('p', { class: 'muted small' }, t(isIOS() ? 'install.iosHint' : 'install.hint')),
    canPromptInstall()
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn primary',
            onClick: async () => {
              if (await promptInstall()) toast(t('install.done'));
              redraw();
            },
          },
          t('install.button'),
        )
      : null,
  );
}

export function renderSettings(container, ctx) {
  const draw = () => {
    if (!state.cls) return;
    setChildren(
      container,
      classCard(ctx),
      volunteerCard(),
      dataCard(),
      installCard(draw),
      h('p', { class: 'muted small center' }, t('settings.version', { version: APP_VERSION })),
    );
  };
  draw();
  const off = onChange(draw);
  return () => {
    off();
    onInstallChange(null);
  };
}
