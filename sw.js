const cacheName = "fantasy-inventory-v15";
const assets = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=6",
  "./styles.css?v=7",
  "./styles.css?v=8",
  "./styles.css?v=9",
  "./styles.css?v=10",
  "./styles.css?v=11",
  "./styles.css?v=12",
  "./styles.css?v=13",
  "./styles.css?v=14",
  "./styles.css?v=15",
  "./app.js",
  "./app.js?v=6",
  "./app.js?v=7",
  "./app.js?v=8",
  "./app.js?v=9",
  "./app.js?v=10",
  "./app.js?v=11",
  "./app.js?v=12",
  "./app.js?v=13",
  "./app.js?v=14",
  "./app.js?v=15",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
