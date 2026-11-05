// Minimal i18n: UI strings live in locales/<lang>.json, keyed by flat dotted names.

let messages = {};
let currentLang = '';

export async function loadLocale(lang) {
  const res = await fetch(`locales/${lang}.json`);
  if (!res.ok) throw new Error(`Failed to load locale "${lang}": HTTP ${res.status}`);
  setMessages(await res.json(), lang);
}

export function setMessages(msgs, lang) {
  messages = msgs;
  currentLang = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang() {
  return currentLang;
}

/** Replaces {name} placeholders with values from params; unknown placeholders are kept. */
export function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** Translates a string key. Missing keys are logged and rendered as the key itself. */
export function t(key, params) {
  const value = messages[key];
  if (typeof value !== 'string') {
    console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(value, params);
}

/** Returns a non-string locale value (array or object), e.g. weekday names. */
export function raw(key) {
  if (!Object.hasOwn(messages, key)) console.warn(`[i18n] missing key: ${key}`);
  return messages[key];
}

/** Fills elements marked with data-i18n / data-i18n-placeholder / data-i18n-aria-label. */
export function applyI18n(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }
}
