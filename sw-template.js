/*
 * Service worker for 5-Star Chef Restaurant. GENERATED at build time from
 * sw-template.js (vite.config.ts fills in VERSION and PRECACHE); do not edit docs/sw.js.
 *
 *  - Page (navigations): network first, so a new release is picked up at once;
 *    the cached copy is used only when offline.
 *  - App shell (hashed JS/CSS, scene art, icons): precached on install.
 *  - Dish photos: cached as they are first shown, refreshed in the background
 *    (stale-while-revalidate). Not precached: 4 MB a one-time visitor never needs.
 *    Offline, an uncached dish falls back to its course illustration in the game.
 *  - Google Fonts: cached after first use so typography survives offline.
 *  - Anything else cross-origin (the Supabase play log) is never touched.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `sc-shell-${VERSION}`;
const RUNTIME = 'sc-runtime-v1';
const FONTS = 'sc-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sc-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return; // e.g. Supabase: hands off

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || caches.match(req, { ignoreSearch: true }))),
    );
    return;
  }

  if (url.pathname.includes('/dishes/')) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }
  // Shell files have hashed or versioned names: the precache is authoritative.
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || staleWhileRevalidate(req, RUNTIME)));
});
