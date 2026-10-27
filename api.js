/* GALON APP — adaptor API untuk PWA (GitHub Pages)
   Menyediakan google.script.run versi fetch, supaya app.js (salinan script.html) tidak perlu diubah.
   Kontrak server: Code.gs → doPost: { fn, args[], reqId? } (text/plain, tanpa preflight CORS) → JSON.
   Fungsi yang mengubah data (IDEMPOTENT) wajib reqId; percobaan ulang memakai reqId YANG SAMA,
   sehingga server mengembalikan hasil yang sama dan tidak menyimpan dua kali. */
(function () {
  'use strict';
  var IDEMPOTENT = ['saveTransaction', 'deleteTransaction', 'editTransaction', 'correctStock', 'createAnnouncement'];
  var TIMEOUT_MS = 90000;   // Apps Script bisa lambat saat "cold start"
  var MAX_TRIES  = 3;

  function newId() {
    var a = new Uint8Array(12), s = '';
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < a.length; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return 'r' + Date.now().toString(36) + s;          // cocok /^[A-Za-z0-9_-]{8,64}$/
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fatal(msg) { var e = new Error(msg); e.fatal = true; return e; }

  function post(fn, args) {
    var url = window.GALON_API_URL || '';
    if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[^/]+\/exec$/.test(url))
      return Promise.reject(new Error('Alamat server belum diisi dengan benar (config.js).'));

    var body = { fn: fn, args: args };
    var idem = IDEMPOTENT.indexOf(fn) !== -1;
    if (idem) body.reqId = newId();
    var json = JSON.stringify(body);

    var attempt = function (i) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
      return fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: json, redirect: 'follow', credentials: 'omit', signal: ctrl.signal
      }).then(function (res) {
        clearTimeout(timer);
        if (res.status >= 500) throw new Error('Server HTTP ' + res.status);          // dicoba ulang
        if (!res.ok) throw fatal('Server menolak permintaan (HTTP ' + res.status + ').');
        return res.text();
      }).then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) { throw fatal('Respons server bukan JSON. Pastikan deployment: Execute as "Me" dan akses "Anyone".'); }
      }).catch(function (err) {
        clearTimeout(timer);
        if (err && err.fatal) throw err;
        if (i + 1 >= MAX_TRIES)
          throw new Error(idem
            ? 'Koneksi bermasalah. Hasil tidak pasti — periksa riwayat sebelum mengulang.'
            : 'Koneksi bermasalah. Coba lagi.');
        return sleep(800 * (i + 1)).then(function () { return attempt(i + 1); });
      });
    };
    return attempt(0);
  }

  function runner(ok, fail) {
    return new Proxy({}, { get: function (_, k) {
      if (k === 'withSuccessHandler') return function (f) { return runner(f, fail); };
      if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
      if (k === 'withUserObject')     return function ()  { return runner(ok, fail); };
      if (typeof k !== 'string' || k === 'then') return undefined;
      return function () {
        var args = Array.prototype.slice.call(arguments);
        post(k, args).then(
          function (r) { if (ok) ok(r); },
          function (e) { if (fail) fail(e); else console.error(k, e); }
        );
      };
    } });
  }

  window.google = { script: { get run() { return runner(null, null); } } };
  window.GalonAPI = { post: post };
})();
