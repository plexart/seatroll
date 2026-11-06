// Browser state: the open class, its decrypted data, and local changes not yet merged into
// the data file (the "overlay": own edits plus imported changesets, kept in localStorage).

import { centerPodium } from './chart.js';
import { decryptJson } from './crypto.js';
import {
  COLLECTIONS,
  countRecords,
  emptyChangeset,
  mergeInto,
  pickCollections,
  pruneOverlay,
  recordKey,
  validateChangeset,
} from './data.js';

const PREFIX = 'seatroll:';
const KEY_CURRENT = `${PREFIX}current`;
const KEY_VIEW = `${PREFIX}view`;
const KEY_VOLUNTEER = `${PREFIX}volunteer`;
const passwordKey = (id) => `${PREFIX}pw:${id}`;
const overlayKey = (id) => `${PREFIX}overlay:${id}`;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the app still works for this session.
  }
}

export const prefs = {
  get view() {
    return read(KEY_VIEW) === 'seat' ? 'seat' : 'podium';
  },
  set view(v) {
    write(KEY_VIEW, v);
  },
  get volunteer() {
    return read(KEY_VOLUNTEER) ?? '';
  },
  set volunteer(v) {
    write(KEY_VOLUNTEER, v.trim() || null);
  },
};

/** Error with a `code` used as an i18n key suffix (login.error.<code>). */
export class LoadError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** The open class. `data` = decrypted file + overlay. */
export const state = {
  cls: null,
  base: null,
  overlay: null,
  data: null,
};

const listeners = new Set();

/** Subscribes to data changes; returns an unsubscribe function. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function fetchClasses() {
  const res = await fetch('data/classes.json', { cache: 'no-cache' });
  if (!res.ok) throw new LoadError('network');
  return res.json();
}

export function savedClassId() {
  return read(KEY_CURRENT);
}

export function savedPassword(classId) {
  return read(passwordKey(classId));
}

/**
 * WebCrypto is only available in secure contexts: HTTPS, or http://localhost. A plain
 * http:// LAN address (e.g. a dev server opened on a phone) cannot decrypt the data.
 */
export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

/** Fetches and decrypts a class data file. */
async function loadBase(cls, password) {
  let envelope;
  try {
    const res = await fetch(cls.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    envelope = await res.json();
  } catch {
    throw new LoadError('network');
  }
  try {
    return await decryptJson(envelope, password);
  } catch (err) {
    throw new LoadError(err.code === 'wrongPassword' ? 'wrongPassword' : 'corrupt');
  }
}

function readOverlay(classId) {
  try {
    return JSON.parse(read(overlayKey(classId)) ?? 'null');
  } catch {
    return null;
  }
}

/** Loads and decrypts a class. On success the class and password are remembered. */
export async function openClass(cls, password) {
  if (!cryptoAvailable()) throw new LoadError('insecure');
  let base;
  try {
    base = await loadBase(cls, password);
  } catch (err) {
    if (err.code === 'wrongPassword') write(passwordKey(cls.id), null);
    throw err;
  }
  write(KEY_CURRENT, cls.id);
  write(passwordKey(cls.id), password);
  state.cls = cls;
  state.base = base;
  state.overlay = pruneOverlay(base, readOverlay(cls.id) ?? emptyChangeset(cls.id));
  lastRefresh = Date.now();
  recompute();
}

const REFRESH_INTERVAL = 30_000;
let lastRefresh = 0;
let refreshing = null;

/**
 * Fetches the open class's data file again, e.g. when the app returns to the foreground, so a
 * newly merged file shows up without a restart. Local unmerged edits are kept. Failures (offline,
 * changed password) leave the current data alone. Resolves to true when the data changed.
 */
export function refreshClass() {
  if (refreshing) return refreshing;
  const cls = state.cls;
  const password = cls && savedPassword(cls.id);
  if (!password || !cryptoAvailable() || Date.now() - lastRefresh < REFRESH_INTERVAL) {
    return Promise.resolve(false);
  }
  lastRefresh = Date.now();
  refreshing = loadBase(cls, password)
    .then((base) => {
      if (state.cls !== cls || JSON.stringify(base) === JSON.stringify(state.base)) return false;
      state.base = base;
      state.overlay = pruneOverlay(base, state.overlay);
      recompute();
      return true;
    })
    .catch((err) => {
      console.warn('Refresh failed', err);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Picks up overlay edits made in another tab on the same class. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!state.cls || e.key !== overlayKey(state.cls.id)) return;
    const overlay = readOverlay(state.cls.id) ?? emptyChangeset(state.cls.id);
    if (JSON.stringify(overlay) === JSON.stringify(state.overlay)) return;
    state.overlay = pruneOverlay(state.base, overlay);
    recompute();
  });
}

/** Forgets the open class (the saved password stays, so switching back is instant). */
export function closeClass() {
  write(KEY_CURRENT, null);
  state.cls = state.base = state.overlay = state.data = null;
}

export function forgetPassword(classId) {
  write(passwordKey(classId), null);
}

function recompute() {
  state.data = mergeInto(state.base, state.overlay).result;
  state.data.seatCharts = state.data.seatCharts.map(centerPodium);
  write(
    overlayKey(state.cls.id),
    countRecords(state.overlay) ? JSON.stringify(state.overlay) : null,
  );
  for (const fn of listeners) fn();
}

/** Applies local edits (a partial changeset) to the overlay. */
export function commit(changes) {
  state.overlay = mergeInto(state.overlay, changes).result;
  recompute();
}

/**
 * Imports a parsed changeset file. Returns the per-collection counts of records that changed.
 * Throws LoadError('notChangeset' | 'invalidRecord' | 'otherClass').
 */
export function importChangeset(changeset) {
  const error = validateChangeset(changeset);
  if (error) throw new LoadError(error);
  if (changeset.classId !== state.cls.id) throw new LoadError('otherClass');
  // Only records newer than what we show count as changes.
  const { counts } = mergeInto(state.data, changeset);
  state.overlay = pruneOverlay(state.base, mergeInto(state.overlay, changeset).result);
  recompute();
  return counts;
}

export function exportChangeset(collections = COLLECTIONS) {
  return pickCollections(state.overlay, collections);
}

export function clearOverlay() {
  state.overlay = emptyChangeset(state.cls.id);
  recompute();
}

/** Number of unmerged records per collection. */
export function overlayCounts() {
  return Object.fromEntries(COLLECTIONS.map((n) => [n, state.overlay?.[n]?.length ?? 0]));
}

/** True when a record exists only locally (edited or imported, not yet in the data file). */
export function isUnmerged(collection, record) {
  const key = recordKey(collection, record);
  return (state.overlay?.[collection] ?? []).some((r) => recordKey(collection, r) === key);
}
