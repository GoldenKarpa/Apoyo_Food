/**
 * Apoyo Food's service worker (Slice 12, architecture Part B1/C: "PWA from
 * the MVP … offline = cached shell + last-viewed browse data (read-only)").
 *
 * Hand-written, no `next-pwa`/workbox dependency — Salon's own PWA slice is
 * explicitly "PWA-none" and no sibling vertical has built one yet, so there is
 * no ecosystem library convention to follow, and the scope here (cache the
 * shell + recently-viewed pages/media) doesn't need one. Same instinct as
 * Slice 1's dependency-free PNG icon encoder: a small, well-understood job
 * doesn't need a framework.
 *
 * ⚠ Only ever registered from the (client) layout — the seller dashboard
 * (`/food/*`, a different HOST in production, `portal.apoyolime.com`, so a
 * `food.apoyolime.com`-scoped SW could never reach it there anyway) is
 * explicitly excluded below as a second layer of safety for local dev, where
 * one origin serves both surfaces. Session-dependent seller content must
 * never be served from a stale cache.
 *
 * ── Strategy, per request kind ──
 *  - Navigations (HTML pages): NETWORK-FIRST, caching each successful render
 *    keyed by URL. Offline, the last-seen version of a previously-visited
 *    page is served — "last-viewed browse data (read-only)" taken literally:
 *    this never re-executes a mutation, it replays a GET response. A page
 *    never visited before falls back to the precached `/offline` shell.
 *  - `/_next/static/*`, `/icons/*`: CACHE-FIRST. Next.js fingerprints these
 *    filenames by content hash, so a cached copy is never stale by
 *    definition — a fresh deploy ships new filenames, not new bytes at an old
 *    one.
 *  - `/api/media/*` (photos): STALE-WHILE-REVALIDATE. Serves the cached image
 *    instantly if present while refreshing it in the background, so a
 *    previously-seen dish photo still renders offline.
 *  - Everything else (mutations, session/account endpoints, anything under
 *    `/food`): PASS-THROUGH, never cached. Getting this wrong is a privacy
 *    bug (a stale/shared cache serving another session's data), not a
 *    freshness annoyance.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `food-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `food-runtime-${CACHE_VERSION}`;
const MEDIA_CACHE = `food-media-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const CURRENT_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE, MEDIA_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !CURRENT_CACHES.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function isExcludedPath(pathname) {
  // The seller dashboard and every non-media API route — see the header
  // comment on why these must never be served from a cache.
  return pathname.startsWith("/food") || (pathname.startsWith("/api") && !pathname.startsWith("/api/media/"));
}

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function handleCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
}

async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const revalidate = fetch(request)
    .then((fresh) => {
      cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => undefined);
  return cached ?? (await revalidate) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isExcludedPath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(handleCacheFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/media/")) {
    event.respondWith(handleStaleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }
});
