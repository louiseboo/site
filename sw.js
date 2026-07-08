const CACHE_NAME = "supplier-form-v2";
const SUPPLIER_ASSETS = [
  "/decks/category-lab/supplier-submit",
  "/decks/category-lab/supplier-submit.html",
  "/decks/category-lab/cloudbase-config.js",
  "/decks/category-lab/supabase-config.js",
  "/manifest.webmanifest",
  "/assets/supplier-pwa-icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(SUPPLIER_ASSETS.map(asset => cache.add(asset))))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (!SUPPLIER_ASSETS.includes(requestUrl.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
