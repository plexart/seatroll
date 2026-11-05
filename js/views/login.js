// Class picker and password entry; also used to switch classes.

import { h, setChildren } from '../dom.js';
import { t } from '../i18n.js';
import { fetchClasses, openClass, savedClassId, savedPassword, state } from '../store.js';

export function renderLogin(container, ctx) {
  const intro = h('p', { class: 'muted' }, t('login.intro'));
  const select = h('select', { id: 'login-class', required: true });
  const password = h('input', {
    id: 'login-password',
    type: 'password',
    autocomplete: 'current-password',
    placeholder: t('login.passwordPlaceholder'),
  });
  const error = h('p', { class: 'error', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn primary block' }, t('login.submit'));
  const cancel = state.cls
    ? h(
        'button',
        { type: 'button', class: 'btn block', onClick: () => ctx.navigate('/checkin') },
        t('common.cancel'),
      )
    : null;
  let classes = [];

  const syncPassword = () => {
    // Prefill the remembered password of the chosen class, so switching back is one tap.
    password.value = savedPassword(select.value) ?? '';
  };
  select.addEventListener('change', syncPassword);

  const form = h(
    'form',
    { class: 'card form' },
    h('label', { for: 'login-class' }, t('login.class')),
    select,
    h('label', { for: 'login-password' }, t('login.password')),
    password,
    error,
    submit,
    cancel,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const cls = classes.find((c) => c.id === select.value);
    if (!cls || !password.value) return;
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = t('login.loading');
    try {
      await openClass(cls, password.value);
      ctx.navigate('/checkin');
      if (location.hash === '#/checkin') ctx.rerender();
    } catch (err) {
      error.textContent = t(`login.error.${err.code ?? 'network'}`);
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = t('login.submit');
    }
  });

  setChildren(
    container,
    h(
      'div',
      { class: 'login-logo' },
      h('img', { src: 'icons/icon.svg', alt: '' }),
      h('strong', {}, t('app.title')),
    ),
    intro,
    form,
  );

  fetchClasses()
    .then((list) => {
      classes = list;
      setChildren(
        select,
        list.map((c) => h('option', { value: c.id }, c.name)),
      );
      const current = state.cls?.id ?? savedClassId();
      if (current && list.some((c) => c.id === current)) select.value = current;
      syncPassword();
    })
    .catch(() => {
      error.textContent = t('login.error.network');
      error.hidden = false;
    });
}
