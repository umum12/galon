/* Daftarkan service worker (hanya di https / localhost). */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW gagal didaftarkan', e); });
  });
}
