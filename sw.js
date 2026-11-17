/*
 * Service worker: permite instalar la aplicación y abrirla sin conexión.
 * Estrategia: red primero para la aplicación (las mejoras llegan al momento) y copia local si no hay red.
 * Nunca guarda en caché los datos (Supabase): solo los archivos de la aplicación.
 */
const VERSION = 'gc-v4';
const APP = ['./', './index.html', './config.js', './manifest.webmanifest', './css/app.css',
  './js/core.js', './js/store.js', './js/demo.js', './js/app.js', './js/finanzas.js', './js/portal.js', './js/correo.js', './js/pwa.js',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const staticCdn = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.hostname);
  if (!sameOrigin && !staticCdn) return; // Supabase y demás: siempre a la red
  if (staticCdn) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
