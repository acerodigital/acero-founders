// Acero Founders — service worker
// Stage 1: basic offline shell caching.
// Stage 2 (once Firebase is connected): push event handling will be added here
// so scheduled check-in reminders arrive as real phone notifications.

const CACHE_NAME = "acero-founders-v1";
const CORE_ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// --- Placeholder for Stage 2 push handling ---
// self.addEventListener("push", (event) => { ... show real notification ... });
