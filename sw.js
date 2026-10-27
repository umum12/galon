/* Service worker Galon App — shell aplikasi bisa dibuka tanpa jaringan; data selalu dari server. Build: 20261027065222 */
const VERSION = 'galon-20261027065222';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'api.js', 'config.js', 'pwa.js', 'manifest.webmanifest',
               'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST ke Apps Script tidak pernah lewat cache
  const url = new URL(req.url);
  if (url.origin === location.origin) {                   // jaringan dulu (selalu versi terbaru), cache bila offline
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
    );
  } else if (FONT_HOSTS.includes(url.hostname)) {         // font: cache dulu, perbarui di belakang
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || net;
    })));
  }
});
