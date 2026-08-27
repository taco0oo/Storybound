// ============================================
// SERVICE WORKER — caches the app shell.
// Note: pages that need live data (Supabase, the AI)
// still require an internet connection — this just
// makes the app itself load instantly and installably.
// ============================================

// IMPORTANT: bump this version string every time you change
// any cached file's *content* (not just this file). Otherwise
// the browser won't detect an update and will keep serving
// stale cached copies of your JS/CSS/HTML forever — this is
// what caused the "supabase.auth undefined" bug.
//
// FIX: bumped v2 -> v3 since the list below changed, and any
// user who already has v2 installed needs this to trigger an
// update.
const CACHE_NAME = "storybound-v3";
const APP_SHELL = [
  "index.html",
  "login.html",
  "create.html",
  "book.html",
  "map.html",
  "css/base.css",
  "css/login.css",
  "css/library.css",
  "css/create.css",
  "css/book.css",
  "css/settings.css",
  "css/map.css",
  "js/supabase-client.js",
  "js/auth.js",
  "js/account.js",
  "js/library.js",
  "js/create.js",
  "js/book.js",
  "js/ai-provider.js",
  "js/settings.js",
  "js/map.js",
  "js/story-schema.js",
  "js/pwa.js",
  "manifest.json",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // FIX: cache.addAll() is all-or-nothing — if ANY single file in
      // APP_SHELL 404s (a very common culprit: the icon PNGs not
      // actually existing in the repo yet), the entire install step
      // rejects and the service worker never activates. Since Chrome
      // requires a successfully-registered service worker + valid
      // manifest icons before it will offer "Install app", a single
      // missing icon file silently blocks the PWA install prompt with
      // no visible error.
      //
      // Caching files individually with Promise.allSettled means one
      // missing file just gets skipped (logged to the console) instead
      // of taking down the whole install.
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          console.warn(`Service worker: failed to cache "${APP_SHELL[i]}" — check this file actually exists at that path (GitHub Pages paths are case-sensitive).`, result.reason);
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for same-origin app-shell files (HTML/CSS/JS), so code
// changes show up on the very next load instead of being stuck behind
// a stale cache. Falls back to cache only when offline. Cross-origin
// requests (Supabase, the AI provider) are left completely untouched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
