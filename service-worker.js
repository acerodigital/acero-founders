// Acero Founders — service worker
// Handles: offline shell caching + background push notifications (Firebase Cloud Messaging)

const CACHE_NAME = "acero-founders-v4";
const CORE_ASSETS = ["./manifest.json"];

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
  const isPage = event.request.mode === "navigate" || event.request.destination === "document";
  if (isPage) {
    // Network-first for the app itself: always get the latest version when online,
    // so a plain refresh shows updates immediately. Falls back to cache only if offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets (icons, manifest) — fine for these since they rarely change.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// --- Firebase Cloud Messaging (background push) ---
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBM9X4Ev3T53D0Vsrp8CnJuDv0mlgcQHWA",
  authDomain: "acero-founders.firebaseapp.com",
  projectId: "acero-founders",
  storageBucket: "acero-founders.firebasestorage.app",
  messagingSenderId: "381028447110",
  appId: "1:381028447110:web:ef05a489a0535d80aab207",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Acero Founders";
  const body = (payload.notification && payload.notification.body) || "You have a check-in reminder.";
  self.registration.showNotification(title, {
    body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: payload.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
