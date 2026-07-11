/* COSMOS service worker — cache-first so the installed app works offline. */
var CACHE = 'cosmos-v1';
var ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './js/three.min.js', './js/assets.js', './js/assets_planets.js', './js/geo_data.js',
  './js/engine.js', './js/mod_universe.js', './js/mod_solar.js', './js/mod_earth.js',
  './js/mod_geo.js', './js/mod_exotic.js', './js/mod_monuments.js', './js/mod_multiverse.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './icons/favicon-32.png', './icons/favicon-16.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener('fetch', function (e) {
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request);
  }));
});
