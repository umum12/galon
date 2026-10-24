/* Service worker Galon App.
   Hanya menyimpan "cangkang" aplikasi (HTML, ikon, manifest) agar bisa dibuka cepat dan tampil saat offline.
   DATA TIDAK PERNAH DISIMPAN: permintaan ke Apps Script (lintas-origin) dilewatkan langsung ke jaringan,
   karena stok harus selalu segar dan tidak ada antrean tulis offline (mencegah transaksi ganda / stok palsu). */
const CACHE = 'galon-shell-__HASH__';
const PRECACHE = __PRECACHE__;
const INDEX_URL = new URL('index.html', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('galon-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Font Google (Roboto, Material Symbols): cache-first agar ikon & teks tetap tampil saat offline setelah pernah dimuat.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('galon-fonts').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== self.location.origin) return;           // API Apps Script → langsung ke jaringan (tidak pernah disimpan)

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

/* Halaman: jaringan dulu (selalu versi terbaru), cadangan dari cache bila lambat >4 dtk atau offline. */
async function networkFirst(req) {
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(INDEX_URL, copy)); }
    return res;
  } catch (err) {
    const cached = await caches.match(INDEX_URL);
    if (cached) return cached;
    throw err;
  }
}
