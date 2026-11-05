import { applyI18n, loadLocale, t } from './i18n.js';
import { setChildren, h } from './dom.js';
import { fetchClasses, openClass, savedClassId, savedPassword, state } from './store.js';
import './install.js';
import { renderLogin } from './views/login.js';
import { renderCheckin } from './views/checkin.js';
import { renderSeatList, renderSeatEditor } from './views/seats.js';
import { renderLeaves } from './views/leaves.js';
import { renderReport } from './views/report.js';
import { renderSettings } from './views/settings.js';
import { renderStudents } from './views/students.js';

const DEFAULT_LANG = 'zh-CN';

/**
 * Route table. `pattern` is matched against the hash path; capture groups are passed to
 * `render(container, ctx)` as ctx.params. A render function may return a cleanup function,
 * called before the next route renders.
 */
const routes = [
  { pattern: /^\/checkin$/, tab: 'checkin', title: 'page.checkin', render: renderCheckin },
  { pattern: /^\/seats$/, tab: 'seats', title: 'page.seats', render: renderSeatList },
  {
    pattern: /^\/seats\/([^/]+)$/,
    tab: 'seats',
    title: 'page.seatEditor',
    back: '/seats',
    render: renderSeatEditor,
  },
  { pattern: /^\/leaves$/, tab: 'leaves', title: 'page.leaves', render: renderLeaves },
  { pattern: /^\/report$/, tab: 'report', title: 'page.report', render: renderReport },
  { pattern: /^\/settings$/, tab: 'settings', title: 'page.settings', render: renderSettings },
  {
    pattern: /^\/students$/,
    tab: 'settings',
    title: 'page.students',
    back: '/settings',
    render: renderStudents,
  },
  { pattern: /^\/login$/, title: 'page.login', render: renderLogin, public: true },
];

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const backEl = document.getElementById('back-button');
const classEl = document.getElementById('class-button');
const tabbarEl = document.getElementById('tabbar');

let cleanup = null;
let navigatedInApp = false;

export function navigate(path) {
  location.hash = `#${path}`;
}

function goBack(fallback) {
  if (navigatedInApp) history.back();
  else location.replace(`#${fallback}`);
}

function currentPath() {
  return location.hash.replace(/^#/, '') || '/checkin';
}

/** Renders the current route. Without an open class only the login page is reachable. */
export function render() {
  cleanup?.();
  cleanup = null;
  let path = currentPath();
  if (!state.cls && path !== '/login') path = '/login';
  let route = null;
  let params = [];
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      route = r;
      params = m.slice(1).map(decodeURIComponent);
      break;
    }
  }
  if (!route) {
    location.replace('#/checkin');
    return;
  }
  titleEl.textContent = t(route.title);
  document.title = `${t(route.title)} · ${t('app.title')}`;
  backEl.hidden = !route.back;
  backEl.onclick = () => goBack(route.back);
  classEl.hidden = !state.cls || route.public;
  classEl.textContent = state.cls?.name ?? '';
  tabbarEl.hidden = !state.cls || route.public;
  for (const a of tabbarEl.querySelectorAll('a')) {
    a.classList.toggle('active', a.dataset.tab === route.tab);
  }
  const container = h('div', { class: `page page-${route.tab ?? 'login'}` });
  setChildren(viewEl, container);
  const ctx = { params, rerender: render, navigate };
  cleanup = route.render(container, ctx) ?? null;
  viewEl.scrollTop = 0;
}

async function boot() {
  await loadLocale(DEFAULT_LANG);
  applyI18n(document);
  document.getElementById('apple-title').content = t('app.title');
  classEl.onclick = () => navigate('/login');
  window.addEventListener('hashchange', () => {
    navigatedInApp = true;
    render();
  });

  // Reopen the last class automatically when its password is remembered.
  const id = savedClassId();
  const password = id && savedPassword(id);
  if (password) {
    setChildren(viewEl, h('p', { class: 'loading' }, t('login.loading')));
    try {
      const cls = (await fetchClasses()).find((c) => c.id === id);
      if (cls) await openClass(cls, password);
    } catch (err) {
      console.warn('Auto-open failed', err);
    }
  }
  render();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err));
}

boot().catch((err) => {
  console.error(err);
  setChildren(viewEl, h('p', { class: 'error' }, String(err)));
});
