/* Penyesuai google.script.run → fetch ke Web App Apps Script (/exec).
   Seluruh JS frontend GAS bisa dipakai TANPA diubah:
     google.script.run.withSuccessHandler(ok).withFailureHandler(err).namaFungsi(arg...)

   Aturan CORS Apps Script (tidak bisa diubah dari sisi server):
   - POST dengan body string → Content-Type otomatis text/plain → "permintaan sederhana", tanpa preflight.
   - JANGAN menambah header apa pun (application/json atau Authorization memicu preflight dan gagal).
   - Token sesi ada di dalam body (argumen pertama fungsi), bukan di header/cookie. */
(function () {
  'use strict';
  var API_URL = window.GALON_API_URL;

  /* Fungsi yang mengubah data dan tidak aman diulang → server mewajibkan reqId (anti kirim ganda). */
  var IDEMPOTENT = { saveTransaction: 1, deleteTransaction: 1, editTransaction: 1, correctStock: 1, createAnnouncement: 1 };
  /* Login dihitung pembatas percobaan di server → jangan diulang otomatis. */
  var NO_RETRY = { login: 1 };
  var TIMEOUT_MS = { saveTransaction: 60000 };   /* ada unggah foto ke Drive */
  var DEFAULT_TIMEOUT_MS = 30000;

  function newReqId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function netError(msg) { var e = new Error(msg); e.retryable = true; return e; }

  function once(fn, args, reqId) {
    var body = { fn: fn, args: args };
    if (reqId) body.reqId = reqId;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS[fn] || DEFAULT_TIMEOUT_MS);
    return fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(body),      /* tanpa headers → text/plain → tanpa preflight */
      redirect: 'follow',              /* /exec dialihkan ke script.googleusercontent.com */
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal
    }).then(function (resp) {
      return resp.text();
    }, function (e) {
      throw netError(e && e.name === 'AbortError'
        ? 'Waktu habis. Periksa koneksi lalu coba lagi.'
        : 'Tidak ada koneksi ke server.');
    }).then(function (text) {
      clearTimeout(timer);
      try { return JSON.parse(text); }
      catch (e) { throw new Error('Respons server tidak dapat dibaca. Coba lagi sebentar lagi.'); }
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ── Mode diagnosis: buka alamat dengan ?debug=1 (matikan dengan ?debug=0) ──
     Menampilkan lencana kecil: total · waktu server · selisih (jaringan + redirect /exec). */
  var DEBUG = false, debugLines = [];
  try {
    var q = new URLSearchParams(location.search).get('debug');
    if (q === '1') localStorage.setItem('galon_debug', '1');
    if (q === '0') localStorage.removeItem('galon_debug');
    DEBUG = localStorage.getItem('galon_debug') === '1';
  } catch (e) { /* penyimpanan diblokir: abaikan */ }

  function sec(ms) { return (ms / 1000).toFixed(1) + 'dtk'; }
  function report(fn, t0, res, err) {
    var total = Math.round(performance.now() - t0);
    var server = res && typeof res._ms === 'number' ? res._ms : null;
    window.GALON_LAST = { fn: fn, total: total, server: server, error: !!err };
    if (!DEBUG || !document.body) return;
    debugLines.unshift(err
      ? fn + '  GAGAL ' + sec(total)
      : fn + '  total ' + sec(total) + (server === null ? '' : '  server ' + sec(server) + '  jaringan ' + sec(Math.max(0, total - server))));
    debugLines = debugLines.slice(0, 5);
    var el = document.getElementById('galonDebug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'galonDebug';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(15,23,42,.88);color:#fff;font:11px/1.45 monospace;padding:6px 8px;border-radius:8px;max-width:94vw;pointer-events:none;white-space:pre';
      document.body.appendChild(el);
    }
    el.textContent = debugLines.join('\n');
  }

  /* Satu reqId dipakai untuk semua percobaan ulang → server menjalankan paling banyak satu kali. */
  function call(fn, args) {
    var t0 = performance.now();
    var reqId = IDEMPOTENT[fn] ? newReqId() : undefined;
    var maxTries = NO_RETRY[fn] ? 1 : 2;
    function attempt(n) {
      return once(fn, args, reqId).catch(function (e) {
        if (e && e.retryable && n < maxTries) return sleep(1200).then(function () { return attempt(n + 1); });
        throw e;
      });
    }
    return attempt(1).then(
      function (res) { report(fn, t0, res); return res; },
      function (err) { report(fn, t0, null, err); throw err; }
    );
  }

  /* Meniru rantai google.script.run yang tidak dapat diubah (immutable) */
  function runner(onOk, onErr) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (f) { return runner(f, onErr); };
        if (prop === 'withFailureHandler') return function (f) { return runner(onOk, f); };
        if (prop === 'then') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          call(String(prop), args).then(
            function (res) { if (onOk) onOk(res); },
            function (err) { if (onErr) onErr(err); }
          );
        };
      }
    });
  }

  window.google = { script: { run: runner(null, null) } };

  /* Pemanasan: di layar login, kirim ping ringan supaya sambungan (DNS/TLS ke 2 alamat Google) dan
     runtime Apps Script sudah siap saat kode akses ditekan → login pertama tidak menanggung "start dingin". */
  window.addEventListener('load', function () {
    setTimeout(function () {
      var lv = document.getElementById('loginView');
      if (lv && !lv.classList.contains('hidden')) call('ping', []).catch(function () {});
    }, 300);
  });
})();
