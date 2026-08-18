/**
 * Church QR Attendance System - Service Worker
 * Provides offline shell caching and network-first sync
 */

const CACHE_NAME = "attendance-qr-v1.0.0";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./students.html",
  "./student.html",
  "./attendance.html",
  "./reports.html",
  "./settings.html",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/responsive.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/app.js",
  "./js/students.js",
  "./js/attendance.js",
  "./js/scanner.js",
  "./js/reports.js",
  "./js/settings.js",
  "./js/activity.js",
  "./js/utils.js",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching App Shell...");
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn("Some assets failed to cache during install:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Service Worker: Clearing Old Cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First, Cache Fallback)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("./dashboard.html") || caches.match("./index.html");
          }
        });
      })
  );
});
