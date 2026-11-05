// Service worker. The app shell is served cache-first (instant start, works offline) and
// refreshed in the background on every launch, so a deploy shows up on the next launch.
// Class data under data/ is served network-first, so a freshly merged data file is seen
// immediately, with the cached copy as the offline fallback.

const CACHE = 'seatroll-v1';

// Every app file. tests/sw.test.js checks this list against the repository.
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'locales/zh-CN.json',
  'locales/zh-CN.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/chart.js',
  'js/crypto.js',
  'js/data.js',
  'js/dates.js',
  'js/dom.js',
  'js/format.js',
  'js/i18n.js',
  'js/install.js',
  'js/render/image.js',
  'js/render/seatgrid.js',
  'js/sessions.js',
  'js/store.js',
  'js/version.js',
  'js/views/checkin.js',
  'js/views/common.js',
  'js/views/leaves.js',
  'js/views/login.js',
  'js/views/report.js',
  'js/views/seats.js',
  'js/views/settings.js',
  'js/views/students.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === 'navigate' && (await cache.match('./')));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

// Re-downloads the whole app shell. addAll stores nothing unless every file arrives, so the
// cache never mixes files from two deploys.
async function refresh() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'no-cache' }))).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (url.pathname.startsWith(`${scope.pathname}data/`)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
  if (request.mode === 'navigate') event.waitUntil(refresh());
});
