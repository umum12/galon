/* ███ 1. INTI: konstanta, state, util, cache, sesi, toast, jam ███ */
/* ── CONSTANTS ───────────────── */
const APP_NAME      = 'Galon App';   /* nama aplikasi TETAP (tidak ada pengaturan di UI; server tidak mengubahnya) */
const CACHE_KEY     = 'galon_v2';
const IDLE_MS       = 30 * 60 * 1000;
const LONG_PRESS_MS = 500;
const MAX_BACKDATE_DAYS = 14;  /* 2 minggu — harus sama dengan BACKDATE_MAX_DAYS di Code.gs */

const HARI_ID  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const HARI_SHORT_ID = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const BULAN_ID = ['','Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_SHORT_ID = ['','Jan','Feb','Mar','Apr','Mei','Jun',
                  'Jul','Ags','Sep','Okt','Nov','Des'];
const ROLE_LABEL = { petugas: 'FACILITY SUPPORT', admin: 'ADMIN', demo: 'DEMO' };

/* ── STATE ───────────────────── */
const S = {
  token: null, user: null, expiresAt: 0,
  stock: 0, warning: 20, danger: 10,
  appName: APP_NAME, status: 'safe',
  recent: [], month: { masuk: 0, keluar: 0 }, monthLabel: '—',
  mode: 'AMBIL', qty: 0,
  photoDataUrl: '', photoName: '',
  lastActivity: Date.now(), idleTimer: null,
  submitState: 'idle',
  pendingDelete: null,
  pendingEdit: null,
  ann: [],   /* running text */
  syncing: false, syncError: false, lastSync: 0,       /* status sinkron data */
  flash: '',                                           /* kunci transaksi yang disorot sebentar */
  txCustom: false,            /* true = user memilih tanggal/jam sendiri */
};

/* Kunci perangkat tepercaya (TIDAK dihapus saat logout) dan selisih jam perangkat↔server.
   Semua logika tanggal ("hari ini", batas mundur) memakai nowS() = waktu menurut zona server, bukan zona perangkat. */
S.deviceKey = (function () { try { return localStorage.getItem('galon_dev') || ''; } catch (_) { return ''; } })();
S.skewMs = 0;
function nowS() { return new Date(Date.now() + (S.skewMs || 0)); }
function setServerSkew(str) {   /* 'yyyy-MM-dd HH:mm:ss' (zona skrip) → selisih terhadap jam perangkat, dibulatkan ke menit */
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return;
  const wall = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]).getTime();
  S.skewMs = Math.round((wall - Date.now()) / 60000) * 60000;
}
/* Draf formulir: bila sesi habis mendadak, jumlah + catatan dipulihkan setelah login ulang (≤15 menit, pengguna sama). Foto tidak disimpan. */
const DRAFT_KEY = 'galon_draft', DRAFT_TTL_MS = 15 * 60 * 1000;
function saveDraft() {
  try {
    const note = E.noteInput.value.trim();
    if (!S.user || S.user.role === 'demo' || (S.qty < 1 && !note)) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ kode: S.user.kode, mode: S.mode, qty: S.qty, note, t: Date.now() }));
  } catch (_) {}
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return;
    localStorage.removeItem(DRAFT_KEY);
    const d = JSON.parse(raw);
    if (!d || !S.user || S.user.role === 'demo' || d.kode !== S.user.kode || Date.now() - d.t > DRAFT_TTL_MS) return;
    setMode(d.mode === 'DATANG' ? 'DATANG' : 'AMBIL');
    S.qty = Math.max(0, Math.min(999, parseInt(d.qty, 10) || 0)); E.qtyInput.value = S.qty;
    E.noteInput.value = String(d.note || '').substring(0, 200);
    updateSubmitText();
    toast(d.mode === 'DATANG' ? 'Draf dipulihkan. Foto invoice perlu diambil ulang.' : 'Draf dipulihkan. Periksa lalu kirim.', 'ok', 4500);
  } catch (_) {}
}

/* Monthly table state */
const MT = { year: 0, month: 0, loading: false, lastData: null, seq: 0 };

/* ── DOM REFS ────────────────── */
const $ = id => document.getElementById(id);
const E = {
  loginView: $('loginView'), mainView: $('mainView'),
  codeInput: $('codeInput'), loginBtn: $('loginBtn'), loginError: $('loginError'),
  stockCard: $('stockCard'), scAppName: $('scAppName'), scClock: $('scClock'),
  menuModal: $('menuModal'),
  refreshBtn: $('refreshBtn'), adminBtn: $('adminBtn'), logoutBtn: $('logoutBtn'),
  stockNumber: $('stockNumber'), stockStatusPill: $('stockStatusPill'), stockStatusText: $('stockStatusText'),
  statMasuk: $('statMasuk'), statKeluar: $('statKeluar'),
  statMasukLabel: $('statMasukLabel'), statKeluarLabel: $('statKeluarLabel'),
  formCard: $('formCard'), resetFormBtn: $('resetFormBtn'), demoNotice: $('demoNotice'), modeBanner: $('modeBanner'), modeBannerIc: $('modeBannerIc'), modeBannerText: $('modeBannerText'),
  scUnit: $('scUnit'), stockStatusIcon: $('stockStatusIcon'), menuAvatar: $('menuAvatar'), menuNama: $('menuNama'), menuRole: $('menuRole'),
  scSync: $('scSync'), scSyncDot: $('scSyncDot'), scSyncLabel: $('scSyncLabel'),
  timeNowView: $('timeNowView'), timeEditView: $('timeEditView'),
  timeEditBtn: $('timeEditBtn'), timeResetBtn: $('timeResetBtn'),
  txDateInput: $('txDateInput'), txTimeInput: $('txTimeInput'),
  modeAmbilBtn: $('modeAmbilBtn'), modeDatangBtn: $('modeDatangBtn'),
  qtyInput: $('qtyInput'), minusBtn: $('minusBtn'), plusBtn: $('plusBtn'),
  noteInput: $('noteInput'),
  photoSection: $('photoSection'), photoThumb: $('photoThumb'),
  photoInputCamera: $('photoInputCamera'), photoInputGallery: $('photoInputGallery'),
  photoCameraBtn: $('photoCameraBtn'), photoGalleryBtn: $('photoGalleryBtn'),
  photoRemoveBtn: $('photoRemoveBtn'),
  submitBtn: $('submitBtn'),
  navAkun: $('navAkun'), navSaya: $('navSaya'), navInput: $('navInput'), navRiwayat: $('navRiwayat'), navLaporan: $('navLaporan'), historyTitle: $('historyTitle'),
  txList: $('txList'), pickerModal: $('pickerModal'), photoPickerCancelBtn: $('photoPickerCancelBtn'),
  historyModal: $('historyModal'), historyCloseBtn: $('historyCloseBtn'), historySub: $('historySub'),
  historyScroll: $('historyScroll'), historyLoading: $('historyLoading'),
  historyList: $('historyList'), historyEmpty: $('historyEmpty'),
  adminModal: $('adminModal'),
  correctStockInput: $('correctStockInput'), correctNoteInput: $('correctNoteInput'),
  correctStockBtn: $('correctStockBtn'),
  closeAdminBtn: $('closeAdminBtn'),
  reloadConfigBtn: $('reloadConfigBtn'), reloadTxBtn: $('reloadTxBtn'), reloadAllBtn: $('reloadAllBtn'),
  adminStockInfo: $('adminStockInfo'),
  deleteModal: $('deleteModal'),
  deleteNama: $('deleteNama'), deleteMeta: $('deleteMeta'),
  deleteStockPreview: $('deleteStockPreview'),
  confirmDeleteBtn: $('confirmDeleteBtn'), cancelDeleteBtn: $('cancelDeleteBtn'),
  openEditBtn: $('openEditBtn'),
  editModal: $('editModal'), editNama: $('editNama'), editMeta: $('editMeta'),
  editQtyInput: $('editQtyInput'), editMinusBtn: $('editMinusBtn'), editPlusBtn: $('editPlusBtn'),
  editNoteInput: $('editNoteInput'), editDateInput: $('editDateInput'), editTimeInput: $('editTimeInput'),
  editStockPreview: $('editStockPreview'), saveEditBtn: $('saveEditBtn'), cancelEditBtn: $('cancelEditBtn'),
  monthlyModal: $('monthlyModal'),
  mtPickerScreen: $('mtPickerScreen'), mtPickerCloseBtn: $('mtPickerCloseBtn'),
  mtMonthSel: $('mtMonthSel'), mtYearSel: $('mtYearSel'), mtRenderBtn: $('mtRenderBtn'),
  mtReportScreen: $('mtReportScreen'),
  mtTitle: $('mtTitle'), mtPrevBtn: $('mtPrevBtn'), mtNextBtn: $('mtNextBtn'),
  mtCloseBtn: $('mtCloseBtn'), mtInfo: $('mtInfo'),
  mtLoading: $('mtLoading'), mtWrap: $('mtWrap'), mtKoreksiNotes: $('mtKoreksiNotes'),
  mtExportPdfBtn: $('mtExportPdfBtn'), mtExportExcelBtn: $('mtExportExcelBtn'),
  mtPrintTitle: $('mtPrintTitle'),
  confirmModal: $('confirmModal'), confirmTitle: $('confirmTitle'), confirmMessage: $('confirmMessage'),
  confirmYesBtn: $('confirmYesBtn'), confirmNoBtn: $('confirmNoBtn'),
  toast: $('toast'),
};

/* ── UTILITY ─────────────────── */
function esc(t) {
  return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* Ikon Material Symbols (font dari Google Fonts CDN) */
function ic(name, cls) { return `<span class="ms${cls ? ' ' + cls : ''}" aria-hidden="true">${name}</span>`; }

/* Bilah muat linear di dasar tombol — pengganti spinner. */
function loadingBar() { return '<span class="btn-lp" aria-hidden="true"></span>'; }

/* Ikon baru ditampilkan setelah font siap (mencegah teks "arrow_downward" muncul sesaat). */
(function () {
  const root = document.documentElement, ready = () => root.classList.add('icons-ready');
  if (document.fonts && document.fonts.load) document.fonts.load('24px "Material Symbols Rounded"', 'check').then(ready, () => {});
  else ready();
})();

/* ── SPLASH: bilah muat bergerak (cepat di awal, melambat mendekati 92%) lalu penuh saat selesai ── */
const Splash = {
  el: $('splash'), bar: $('splashBar'), txt: $('splashText'), timers: [],
  _clear() { this.timers.forEach(clearTimeout); this.timers = []; },
  show(text, steps) {
    this._clear();
    this.el.classList.remove('hide');
    this.bar.style.transition = 'none'; this.bar.style.width = '0%'; void this.bar.offsetWidth;
    this.bar.style.transition = 'width 9s cubic-bezier(.08,.75,.2,1)'; this.bar.style.width = '92%';
    this.txt.textContent = text || 'Memuat…';
    (steps || []).forEach(([ms, t]) => this.timers.push(setTimeout(() => { this.txt.textContent = t; }, ms)));
  },
  finish(fast) {
    this._clear();
    this.bar.style.transition = `width ${fast ? .15 : .25}s ease-out`; this.bar.style.width = '100%';
    this.timers.push(setTimeout(() => this.el.classList.add('hide'), fast ? 180 : 320));
  },
  cancel() { this._clear(); this.el.classList.add('hide'); }
};

/* ── WAKTU TRANSAKSI (tanggal/jam kejadian) ─ */
function pad2(n) { return String(n).padStart(2,'0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function toHHMM(d)    { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function formatDicatat(ts) {  /* 'yyyy-MM-dd HH:mm:ss' → '03 Okt 14:20' */
  const m = String(ts||'').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]} ${BULAN_SHORT_ID[Number(m[2])]} ${m[4]}:${m[5]}` : '';
}

function formatTanggalPendek(raw) {  /* 'yyyy-MM-dd' → 'Sen, 05 Okt 2026' */
  const m = String(raw||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '—';
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return `${HARI_SHORT_ID[new Date(y, mo-1, d).getDay()]}, ${pad2(d)} ${BULAN_SHORT_ID[mo]} ${y}`;
}

/* ── MENU OVERFLOW (Refresh / Admin / Logout) ─ */
function openMenu()  { E.menuModal.classList.remove('hidden'); setNav('akun'); }
function closeMenu() { E.menuModal.classList.add('hidden'); navReset('akun'); }

/* ── NAVBAR BAWAH: 5 menu. Akun = lembar menu, Riwayat/Laporan = lembar penuh di atas halaman Input. ── */
const NAV_MAP = { akun:'navAkun', saya:'navSaya', input:'navInput', riwayat:'navRiwayat', laporan:'navLaporan' };
function setNav(name) {
  S.nav = name;
  Object.keys(NAV_MAP).forEach(k => {
    const b = E[NAV_MAP[k]], on = (k === name);
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
}
function navReset(name) { if (S.nav === name) setNav('input'); }   /* lembar ditutup → kembali ke Input */
function goNav(name) {
  setActivity();
  const again = (S.nav === name && name !== 'input');   /* ketuk menu yang sedang aktif = tutup */
  closeMenu(); closeHistory(); closeMonthlyTable();
  setNav('input');
  if (again) return;
  if (name === 'input') { window.scrollTo({ top:0, behavior:'smooth' }); return; }
  if (name === 'akun') openMenu();
  else if (name === 'saya') openHistory(true);
  else if (name === 'riwayat') openHistory(false);
  else if (name === 'laporan') openMonthlyTable();
}

/* ── CONFIRM MODAL (generik) ─── */
let _confirmCallback = null;
function showConfirm(title, message, onYes) {
  E.confirmTitle.textContent = title;
  E.confirmMessage.textContent = message;
  _confirmCallback = onYes;
  E.confirmModal.classList.remove('hidden');
}
function hideConfirm() { E.confirmModal.classList.add('hidden'); _confirmCallback = null; }
function formatTanggalID(raw) {
  if (!raw) return '—';
  const s = String(raw).trim();
  let y, m, d;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { [,y,m,d] = iso.map(Number); }
  else { const dt = new Date(s); if (isNaN(dt.getTime())) return s; y=dt.getFullYear(); m=dt.getMonth()+1; d=dt.getDate(); }
  const js = new Date(y, m-1, d);
  return `${HARI_ID[js.getDay()]}, ${d} - ${BULAN_ID[m]||m} - ${y}`;
}

/* ── CACHE ───────────────────── */
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ token:S.token, user:S.user, expiresAt:S.expiresAt, lastActivity:S.lastActivity, stock:S.stock, warning:S.warning, danger:S.danger, status:S.status, recent:S.recent, month:S.month, monthLabel:S.monthLabel, ann:S.ann, lastSync:S.lastSync, skewMs:S.skewMs })); } catch(_) {}
}
function loadCache()  { try { const r=localStorage.getItem(CACHE_KEY); return r?JSON.parse(r):null; } catch(_){return null;} }
function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch(_){} }

/* ── SESSION ─────────────────── */
let _actSaved = 0;
function setActivity() { S.lastActivity = Date.now(); if (S.lastActivity - _actSaved > 2000) { _actSaved = S.lastActivity; saveCache(); } }   /* tulis localStorage maks. tiap 2 dtk */
function startIdleWatcher() {
  if (S.idleTimer) clearInterval(S.idleTimer);
  S.idleTimer = setInterval(() => { if (S.token && Date.now()-S.lastActivity>IDLE_MS) doLogout(true); }, 15000);
}

/* ── VIEWS ───────────────────── */
function showView(v) {
  E.loginView.classList.toggle('hidden', v !== 'login');
  E.mainView.classList.toggle('hidden',  v !== 'main');
  if (v === 'main') setNav('input');
}

/* ── TOAST ───────────────────── */
let _tT = null;
function toast(msg, type='', ms) {
  if (_tT) clearTimeout(_tT);
  E.toast.innerHTML = ic(type==='ok' ? 'check_circle' : type==='err' ? 'error' : 'info', 'ms-20') + `<span class="toast-msg">${esc(msg)}</span>`;
  E.toast.className = 'toast show'+(type==='ok'?' ok':type==='err'?' err':'');
  _tT = setTimeout(() => E.toast.classList.remove('show'), ms || (type==='err' ? 4500 : 2800));
}

/* ── CLOCK ───────────────────── */
let _lastDay = '';
function updateClock() {
  const now = nowS();
  const dayKey = toISODate(now);
  if (_lastDay && dayKey !== _lastDay && S.token) renderRecent();   /* lewat tengah malam: Hari Ini/Kemarin bergeser */
  _lastDay = dayKey;
  const hari = HARI_ID[now.getDay()];
  const tgl  = now.getDate();
  const bln  = BULAN_SHORT_ID[now.getMonth()+1];
  const thn  = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2,'0');
  const mm   = String(now.getMinutes()).padStart(2,'0');
  const ss   = String(now.getSeconds()).padStart(2,'0');
  E.scClock.textContent = `${hari}, ${tgl} ${bln} ${thn} | ${hh}:${mm}:${ss}`;
}
setInterval(updateClock, 1000);

/* ███ 2. STOK & RIWAYAT: render, tekan-tahan, hapus, edit ███ */
/* ── TINGKAT STOK (6 warna, ambang tetap; dihitung di klien dari jumlah galon) ──
   ≥24 Aman · 16–23 Menipis · 8–15 Waspada · 1–7 Darurat · 0 Habis · <0 Stok Minus */
const STOCK_LEVELS = {
  safe:   { key:'safe',   label:'AMAN',       icon:'verified_user', unit:'Galon Tersisa' },
  low:    { key:'low',    label:'MENIPIS',    icon:'trending_down', unit:'Galon Tersisa' },
  alert:  { key:'alert',  label:'WASPADA',    icon:'warning',       unit:'Galon Tersisa' },
  danger: { key:'danger', label:'DARURAT',    icon:'crisis_alert',  unit:'Galon Tersisa' },
  empty:  { key:'empty',  label:'HABIS',      icon:'block',         unit:'Galon Habis' },
  minus:  { key:'minus',  label:'STOK MINUS', icon:'remove_circle', unit:'Galon Minus · Cek Pencatatan' },
};
function stockLevel(n) {
  n = Math.trunc(Number(n)) || 0;
  if (n < 0)   return 'minus';
  if (n === 0) return 'empty';
  if (n <= 7)  return 'danger';
  if (n <= 15) return 'alert';
  if (n <= 23) return 'low';
  return 'safe';
}
/* ── RENDER: STOCK ───────────── */
function renderStock(animate=false) {
  document.title = APP_NAME;
  E.scAppName.textContent = APP_NAME;
  if (S.user) {
    const role  = S.user.role || 'petugas';
    const label = ROLE_LABEL[role] || role.toUpperCase();
    E.menuAvatar.textContent = String(S.user.nama || '?').trim().charAt(0).toUpperCase();
    E.menuNama.textContent = S.user.nama; E.menuRole.textContent = label;
    const isDemo = role === 'demo', isAdmin = role === 'admin';
    E.adminBtn.classList.toggle('hidden', !isAdmin && !isDemo);
    E.demoNotice.classList.toggle('hidden', !isDemo);
    E.navSaya.classList.toggle('hidden', isDemo);   /* demo tidak punya transaksi */
    if (isDemo) {
      E.submitBtn.disabled = true;
      E.submitBtn.innerHTML = ic('lock','ms-20') + 'Mode Demo';
      E.submitBtn.setAttribute('data-state','idle');
      E.submitBtn.setAttribute('data-mode', S.mode);
    }
  }
  const prev = parseInt(E.stockNumber.textContent, 10);
  E.stockNumber.textContent = S.stock;
  if (animate && !isNaN(prev) && prev !== S.stock) {
    E.stockNumber.classList.remove('pop');
    void E.stockNumber.offsetWidth;
    E.stockNumber.classList.add('pop');
  }
  const lv = STOCK_LEVELS[stockLevel(S.stock)];
  E.stockCard.className = `stock-card ${lv.key}`;
  E.stockStatusText.textContent = lv.label;
  E.stockStatusIcon.textContent = lv.icon;
  E.scUnit.textContent = lv.unit;
  E.statMasuk.textContent  = S.month.masuk;
  E.statKeluar.textContent = S.month.keluar;
  E.statMasukLabel.textContent  = S.monthLabel;
  E.statKeluarLabel.textContent = S.monthLabel;
  E.adminStockInfo.textContent  = `${S.stock} galon`;
  updateSubmitText();
}

/* ── RENDER: RIWAYAT ─────────── */
/* Kartu satu transaksi:
   baris 1 = nama + jam (di sampingnya) · ⋯   |   baris 2 = lencana berikon · jumlah   |   keterangan (kotak sendiri)
   |   kaki = "dicatat/diedit …" (kiri) · chip Foto (kanan).
   Lencana: JENIS · BARU (hari ini) · SUSULAN (waktu kejadian ≠ waktu input) · EDIT (pernah diedit). */
const TX_LABEL = { AMBIL: ['Ambil', 'logout'], DATANG: ['Datang', 'login'], KOREKSI: ['Koreksi', 'tune'] };
function txPill(cls, icon, label) { return `<span class="tx-pill ${cls}">${ic(icon, 'ms-16')}${label}</span>`; }
function buildTxItem(tx, colorClass, mine) {
  const isAmbil=tx.jenis==='AMBIL', isKoreksi=tx.jenis==='KOREKSI';
  const pillClass = isKoreksi?'koreksi':isAmbil?'ambil':'datang';
  const qtyClass  = isKoreksi?(tx.qty>0?'plus':tx.qty<0?'minus':'neutral'):isAmbil?'minus':'plus';
  const sign      = isAmbil?'−':isKoreksi?(tx.qty>0?'+':tx.qty<0?'−':''):'+';
  const lab = TX_LABEL[tx.jenis] || [tx.jenis, 'receipt_long'];
  const pills = txPill(pillClass, lab[1], esc(lab[0])) +
    (tx.isNew    ? txPill('baru',    'auto_awesome',       'Baru')    : '') +   /* transaksi hari ini */
    (tx.susulan  ? txPill('susulan', 'history_toggle_off', 'Susulan') : '') +
    (tx.editedAt ? txPill('edit',    'edit',               'Edit')    : '');
  const noteHtml  = tx.note ? `<div class="tx-note-box">${ic('chat','ms-20')}<span class="tx-note-text">${esc(tx.note)}</span></div>` : '';
  const photoUrl  = /^https?:\/\//i.test(String(tx.photoUrl || '')) ? String(tx.photoUrl) : '';   /* tolak javascript:/data: */
  const photoHtml = photoUrl ? `<a class="tx-photo-chip" href="${esc(photoUrl)}" target="_blank" rel="noopener" aria-label="Foto invoice">${ic('photo_camera','ms-18')}Foto</a>` : '';
  const stamp = tx.editedAt
    ? `diedit ${esc(formatDicatat(tx.editedAt))}`
    : `dicatat ${esc(formatDicatat(tx.timestamp))}`;
  const hhmm = tx.time ? tx.time.substring(0,5) : '—';
  const moreHtml = canManageTx(tx) ? '<button type="button" class="tx-more" aria-label="Edit atau hapus">' + ic('more_horiz') + '</button>' : '';
  /* Mode "Riwayat Saya": nama selalu milik sendiri, jadi yang tampil tanggal + jam. */
  const who = mine
    ? `<span class="tx-nama tx-when-date">${ic('calendar_today','ms-18')}${esc(formatTanggalPendek(tx.date))}</span><span class="tx-time">${esc(hhmm)}</span>`
    : `<span class="tx-nama">${esc(tx.nama||tx.kode)}</span><span class="tx-time">${esc(hhmm)}</span>`;
  const div = document.createElement('div');
  const flashCls = (S.flash && S.flash === `${tx.timestamp}|${tx.kode}`) ? ' tx-flash' : '';
  div.className = `tx-item ${colorClass}${flashCls}`;
  div.innerHTML = `
    <div class="tx-row1"><div class="tx-who">${who}</div>${moreHtml}</div>
    <div class="tx-row2">
      <span class="tx-pills">${pills}</span>
      <div class="tx-qty ${qtyClass}">${sign}${Math.abs(tx.qty)}</div>
    </div>
    ${noteHtml}
    <div class="tx-row3"><span class="tx-sisa">${stamp}</span>${photoHtml}</div>`;
  setupLongPress(div, tx);
  const moreBtn = div.querySelector('.tx-more');
  if (moreBtn) {
    const stop = e => e.stopPropagation();   /* jangan memicu tekan-tahan milik kartu */
    moreBtn.addEventListener('touchstart', stop, { passive:true });
    moreBtn.addEventListener('mousedown', stop);
    moreBtn.addEventListener('click', e => { e.stopPropagation(); setActivity(); handleLongPress(tx); });
  }
  return div;
}

/* Daftar bertanggal: header per hari + warna bergantian per hari. Dipakai kartu Riwayat & Riwayat Lengkap. */
function renderTxList(container, items, mine) {
  container.innerHTML = '';
  const dayColors = ['tx-day-a','tx-day-b','tx-day-c','tx-day-d'];
  let lastDate = null, dayColorIdx = -1;
  items.forEach(tx => {
    const txDate = String(tx.date||'').substring(0,10);
    if (txDate !== lastDate) {
      lastDate = txDate;
      dayColorIdx = (dayColorIdx + 1) % dayColors.length;
      if (mine) { /* tiap kartu sudah memuat tanggal sendiri → tanpa header */ }
      else {
      const hdr = document.createElement('div');
      hdr.className = 'tx-date-hdr';
      hdr.innerHTML = ic('calendar_today','ms-20') + '<span>' + esc(formatTanggalID(txDate)) + '</span>';
      container.appendChild(hdr);
      }
    }
    container.appendChild(buildTxItem(tx, dayColors[dayColorIdx], mine));
  });
}

/* Kartu dashboard: transaksi HARI INI (berlencana BARU) dan KEMARIN, menurut tanggal kejadian (waktu perangkat).
   Yang lebih lama ada di Riwayat Lengkap. Server mengirim RECENT_SERVER_LIMIT transaksi terbaru. */
const RECENT_SERVER_LIMIT = 30;   /* sama dengan TX_RECENT_LIMIT di Code.gs */
function renderRecent() {
  const now = nowS();
  const today = toISODate(now), yest = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const all = S.recent || [];
  const groups = [
    { title: 'Transaksi Hari Ini', empty: 'Belum ada transaksi hari ini.', isNew: true,  items: all.filter(t => String(t.date).substring(0,10) === today) },
    { title: 'Transaksi Kemarin',  empty: 'Tidak ada transaksi kemarin.',  isNew: false, items: all.filter(t => String(t.date).substring(0,10) === yest) },
  ];
  E.txList.innerHTML = '';
  groups.forEach(g => {
    const sec = document.createElement('div');
    sec.className = 'tx-group';
    sec.innerHTML = `<div class="tx-group-hdr"><span class="tx-group-title">${g.title}</span><span class="tx-group-count">${g.items.length}</span></div>`;
    if (!g.items.length) {
      sec.insertAdjacentHTML('beforeend', `<div class="tx-group-empty">${g.empty}</div>`);
    } else {
      g.items.forEach(tx => sec.appendChild(buildTxItem(g.isNew ? Object.assign({}, tx, { isNew: true }) : tx, 'tx-day-a')));
    }
    E.txList.appendChild(sec);
  });
  const oldest = all.length ? String(all[all.length - 1].date).substring(0,10) : '';
  if (all.length >= RECENT_SERVER_LIMIT && oldest >= yest) {
    E.txList.insertAdjacentHTML('beforeend', '<div class="tx-group-empty">Daftar dibatasi ' + RECENT_SERVER_LIMIT + ' transaksi terbaru — lihat selengkapnya di Riwayat Lengkap.</div>');
  }
}

/* ── LONG PRESS ──────────────── */
function setupLongPress(el, tx) {
  let timer=null, startX=0, startY=0;
  function onStart(x,y) {
    startX=x; startY=y;
    el.classList.add('pressing');
    timer = setTimeout(() => { timer=null; el.classList.remove('pressing'); if(navigator.vibrate) navigator.vibrate(30); handleLongPress(tx); }, LONG_PRESS_MS);
  }
  function onCancel() { if(timer){clearTimeout(timer);timer=null;} el.classList.remove('pressing'); }
  el.addEventListener('touchstart', e=>{const t=e.touches[0];onStart(t.clientX,t.clientY);},{passive:true});
  el.addEventListener('touchmove',  e=>{const t=e.touches[0];if(Math.abs(t.clientX-startX)>10||Math.abs(t.clientY-startY)>10)onCancel();},{passive:true});
  el.addEventListener('touchend',    onCancel);
  el.addEventListener('touchcancel', onCancel);
  el.addEventListener('mousedown', e=>onStart(e.clientX,e.clientY));
  el.addEventListener('mouseup',   onCancel);
  el.addEventListener('mouseleave',onCancel);
  el.addEventListener('contextmenu',e=>e.preventDefault());
}
/* Boleh dikelola (edit/hapus)? Aturan sama dengan handleLongPress & server: demo tidak, KOREKSI tidak,
   petugas hanya miliknya, admin semua. Dipakai untuk menampilkan tombol ⋯. */
function canManageTx(tx) {
  if (!S.user || S.user.role === 'demo' || tx.jenis === 'KOREKSI') return false;
  return S.user.role === 'admin' || S.user.kode === tx.kode;
}
function handleLongPress(tx) {
  if (!S.user) return;
  const role = S.user.role;
  if (role==='demo') { toast('Mode demo — tidak dapat menghapus.','err'); return; }
  if (tx.jenis==='KOREKSI') { toast('Transaksi KOREKSI tidak dapat dihapus.','err'); return; }
  if (role==='petugas' && S.user.kode!==tx.kode) { toast('Hanya bisa menghapus transaksi sendiri.','err'); return; }
  openDeleteModal(tx);
}

/* ── DELETE MODAL ────────────── */
function openDeleteModal(tx) {
  S.pendingDelete = tx;
  const isAmbil = tx.jenis==='AMBIL';
  const delta = isAmbil?tx.qty:-tx.qty;
  E.deleteNama.textContent = tx.nama||tx.kode;
  E.deleteMeta.innerHTML = `<span class="tx-pill ${isAmbil?'ambil':'datang'}" style="font-size:10px;">${esc(tx.jenis)}</span> ${esc(tx.time?tx.time.substring(0,5):'—')} &nbsp;·&nbsp; ${Math.abs(tx.qty)} galon`;
  E.deleteStockPreview.textContent = `Jika dihapus, stok: ${S.stock} → ${S.stock+delta}`;
  E.confirmDeleteBtn.disabled=false; E.confirmDeleteBtn.innerHTML=ic('delete','ms-20')+'Hapus Transaksi';
  E.deleteModal.classList.remove('hidden');
}
function closeDeleteModal() { E.deleteModal.classList.add('hidden'); S.pendingDelete=null; }
function doDeleteTransaction() {
  if (!S.pendingDelete) return;
  const tx = S.pendingDelete;
  E.confirmDeleteBtn.disabled=true; E.confirmDeleteBtn.innerHTML = loadingBar() + 'Menghapus…';
  google.script.run
    .withSuccessHandler(res => {
      E.confirmDeleteBtn.disabled=false; E.confirmDeleteBtn.innerHTML=ic('delete','ms-20')+'Hapus Transaksi';
      closeDeleteModal();
      if (!res||!res.ok) { toast((res&&res.message)||'Gagal menghapus.','err'); return; }
      applyData(res); toast(res.message||'Transaksi dihapus.','ok'); setActivity();
      if (isHistoryOpen()) fetchFullHistory(true);
    })
    .withFailureHandler(err => {
      E.confirmDeleteBtn.disabled=false; E.confirmDeleteBtn.innerHTML=ic('delete','ms-20')+'Hapus Transaksi';
      closeDeleteModal(); toast((err&&err.message)||'Gagal menghapus.','err');
    })
    .deleteTransaction(S.token, tx.timestamp, tx.kode, tx.id || '');
}

/* ── EDIT MODAL ──────────────── */
function openEditModal(tx) {
  S.pendingEdit = tx;
  const isAmbil = tx.jenis==='AMBIL';
  const now = nowS();
  const minAllowed = toISODate(new Date(now.getTime() - MAX_BACKDATE_DAYS*86400000));
  E.editNama.textContent = tx.nama||tx.kode;
  E.editMeta.innerHTML = `<span class="tx-pill ${isAmbil?'ambil':'datang'}" style="font-size:10px;">${esc(tx.jenis)}</span> ${isAmbil?'Ambil galon':'Galon datang'} &nbsp;·&nbsp; jenis tidak bisa diubah`;
  E.editQtyInput.value  = tx.qty;
  E.editNoteInput.value = tx.note || '';
  E.editDateInput.min   = tx.date < minAllowed ? tx.date : minAllowed;  /* tanggal asli tetap valid */
  E.editDateInput.max   = toISODate(now);
  E.editDateInput.value = tx.date;
  E.editTimeInput.value = String(tx.time||'').substring(0,5);
  E.saveEditBtn.disabled = false; E.saveEditBtn.textContent = 'Simpan Perubahan';
  updateEditPreview();
  E.editModal.classList.remove('hidden');
}
function closeEditModal() { E.editModal.classList.add('hidden'); S.pendingEdit = null; }
function readEditQty() {
  const v = parseInt(E.editQtyInput.value, 10);
  return (Number.isInteger(v) && v >= 1) ? Math.min(999, v) : 0;
}
function updateEditPreview() {
  const tx = S.pendingEdit; if (!tx) return;
  const q = readEditQty();
  if (!q) { E.editStockPreview.textContent = 'Jumlah minimal 1'; return; }
  const delta = (tx.jenis==='AMBIL' ? -1 : 1) * (q - tx.qty);
  E.editStockPreview.textContent = delta === 0
    ? `Stok tetap: ${S.stock}`
    : `Stok akan berubah: ${S.stock} → ${S.stock+delta}`;
}
function stepEditQty(d) {
  const q = readEditQty() || 1;
  E.editQtyInput.value = Math.max(1, Math.min(999, q + d));
  updateEditPreview(); setActivity();
}
function checkWhenRange(date, time) {
  const now = nowS();
  if (date > toISODate(now)) return 'Tanggal tidak boleh di masa depan.';
  if (date < toISODate(new Date(now.getTime() - MAX_BACKDATE_DAYS*86400000))) return `Maksimal mundur ${MAX_BACKDATE_DAYS} hari.`;
  if (date === toISODate(now) && time > toHHMM(now)) return 'Jam tidak boleh di masa depan.';
  return '';
}
function doEditTransaction() {
  const tx = S.pendingEdit; if (!tx) return;
  if (isDemo()) { toast('Mode demo — tidak dapat mengedit.','err'); return; }
  const qty = readEditQty();
  if (!qty) { toast('Jumlah harus lebih dari 0.','err'); return; }
  const note = E.editNoteInput.value.trim();
  const date = E.editDateInput.value, time = E.editTimeInput.value;
  if (!date || !time) { toast('Tanggal dan jam harus diisi.','err'); return; }

  /* Tanggal/jam yang tidak diubah tidak dicek batas mundur (agar qty transaksi lama tetap bisa diedit). */
  const whenChanged = date !== tx.date || time !== String(tx.time||'').substring(0,5);
  if (whenChanged) { const err = checkWhenRange(date, time); if (err) { toast(err,'err'); return; } }
  if (qty === tx.qty && note === (tx.note||'') && !whenChanged) { toast('Tidak ada perubahan.'); return; }

  E.saveEditBtn.disabled = true; E.saveEditBtn.innerHTML = loadingBar() + 'Menyimpan…';
  const reset = () => { E.saveEditBtn.disabled = false; E.saveEditBtn.textContent = 'Simpan Perubahan'; };
  google.script.run
    .withSuccessHandler(res => {
      reset();
      if (!res || !res.ok) {
        if (res && res.message==='SESSION_EXPIRED') { closeEditModal(); doLogout(true); return; }
        toast((res&&res.message)||'Gagal menyimpan.','err'); return;
      }
      flashTx(`${tx.timestamp}|${tx.kode}`); closeEditModal(); applyData(res); clearFlashLater(); toast(res.message||'Transaksi diperbarui.','ok'); setActivity();
      if (isHistoryOpen()) fetchFullHistory(true);
    })
    .withFailureHandler(err => { reset(); toast((err&&err.message)||'Gagal menyimpan.','err'); })
    .editTransaction({ token:S.token, id:tx.id || '', timestamp:tx.timestamp, kode:tx.kode, qty, note, txDate:date, txTime:time });
}

/* ███ 3. LAPORAN BULANAN: tabel, ekspor CSV/PDF ███ */
/* ── MONTHLY TABLE ═══════════════════════════════════════════════ */

const MT_YEAR_MIN = 2025, MT_YEAR_MAX = 2028;   /* pilihan tahun di dropdown */

function buildMonthlySelects() {
  if (E.mtMonthSel.options.length) return;   /* cukup sekali */
  for (let m = 1; m <= 12; m++) E.mtMonthSel.add(new Option(BULAN_ID[m], m));
  for (let y = MT_YEAR_MIN; y <= MT_YEAR_MAX; y++) E.mtYearSel.add(new Option(y, y));
}

function openMonthlyTable() {
  const now = nowS();
  MT.year  = Math.min(MT_YEAR_MAX, Math.max(MT_YEAR_MIN, now.getFullYear()));
  MT.month = now.getMonth() + 1;
  MT.lastData = null;
  buildMonthlySelects();
  E.mtMonthSel.value = String(MT.month);
  E.mtYearSel.value  = String(MT.year);
  E.monthlyModal.classList.remove('hidden');
  setNav('laporan');
  showPickerScreen();
}
function closeMonthlyTable() { E.monthlyModal.classList.add('hidden'); navReset('laporan'); }

function showPickerScreen() {
  E.monthlyModal.classList.add('mt-picking');      /* kartu kecil di tengah */
  E.mtPickerScreen.classList.remove('hidden');
  E.mtReportScreen.classList.add('hidden');
}
function showReportScreen() {
  E.monthlyModal.classList.remove('mt-picking');   /* kembali ke lembar penuh */
  E.mtPickerScreen.classList.add('hidden');
  E.mtReportScreen.classList.remove('hidden');
}

/* Panah ‹ › di header laporan: dibatasi Jan MT_YEAR_MIN … Des MT_YEAR_MAX. */
function updateMtNavBounds(prevBtn, nextBtn) {
  prevBtn.disabled = (MT.year === MT_YEAR_MIN && MT.month === 1);
  nextBtn.disabled = (MT.year === MT_YEAR_MAX && MT.month === 12);
}
function stepReportMonth(delta) {
  let m = MT.month + delta, y = MT.year;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  if (y < MT_YEAR_MIN || y > MT_YEAR_MAX) return;
  MT.year = y; MT.month = m;
  fetchMonthlyTable();
}
function renderFromPicker() {
  MT.month = parseInt(E.mtMonthSel.value, 10);
  MT.year  = parseInt(E.mtYearSel.value, 10);
  fetchMonthlyTable();
}

function fetchMonthlyTable() {
  const seq = ++MT.seq;
  MT.loading = true;

  showReportScreen();
  E.mtTitle.textContent = `${BULAN_ID[MT.month]} ${MT.year}`;
  updateMtNavBounds(E.mtPrevBtn, E.mtNextBtn);

  /* Tampilkan loading, sembunyikan tabel, info & catatan koreksi */
  E.mtLoading.classList.remove('hidden');
  E.mtWrap.classList.add('hidden');
  E.mtInfo.classList.add('hidden');
  E.mtKoreksiNotes.classList.add('hidden');

  google.script.run
    .withSuccessHandler(res => {
      if (seq !== MT.seq) return;   /* jawaban basi */
      MT.loading = false;
      E.mtLoading.classList.add('hidden');
      if (!res || !res.ok) {
        if (res && res.message === 'SESSION_EXPIRED') { closeMonthlyTable(); doLogout(true); return; }
        toast((res&&res.message)||'Gagal memuat tabel.','err'); return;
      }
      renderMonthlyTable(res);
    })
    .withFailureHandler(err => {
      if (seq !== MT.seq) return;
      MT.loading = false;
      E.mtLoading.classList.add('hidden');
      toast((err&&err.message)||'Gagal memuat tabel.','err');
    })
    .getMonthlyTable(S.token, MT.year, MT.month);
}

function renderMonthlyTable(data) {
  MT.lastData = data; /* simpan untuk export — tanpa fetch ulang ke server */

  const { rows, totals, users, openingStock, monthName, year, koreksiList } = data;

  E.mtPrintTitle.textContent = `Tabel Galon — ${monthName} ${year}`;

  /* Info bar */
  const koreksiInfoHtml = totals.koreksi !== 0
    ? `<span>Koreksi: <span class="${totals.koreksi>0?'hi':'lo'}">${totals.koreksi>0?'+':''}${totals.koreksi}</span></span>`
    : '';
  E.mtInfo.innerHTML =
    `<span>Sisa Awal: <span class="bl">${openingStock}</span></span>` +
    `<span>Masuk: <span class="hi">${totals.masuk}</span></span>` +
    `<span>Keluar: <span class="lo">${totals.keluar}</span></span>` +
    koreksiInfoHtml +
    `<span>Sisa Akhir: <span class="bl">${totals.sisakAkhir}</span></span>`;
  E.mtInfo.classList.remove('hidden');

  /* Build table HTML — urutan kolom: HARI, TGL, <petugas…>, ( − ), ( + ), SISA, ( ± ) */
  const koreksiTd = (v, zeroCls) =>
      v > 0 ? `<td class="mt-col-koreksi mt-koreksi-val plus">+${v}</td>`
    : v < 0 ? `<td class="mt-col-koreksi mt-koreksi-val minus">${v}</td>`
    :         `<td class="mt-col-koreksi ${zeroCls}">0</td>`;
  let h = '<table class="mt-table">';

  /* Head */
  h += '<thead><tr>';
  h += `<th class="mt-s1">Hari</th>`;
  h += `<th class="mt-s2">Tgl</th>`;
  users.forEach(u => { h += `<th class="mt-col-user">${esc(u)}</th>`; });
  h += `<th class="mt-col-pm">( − )</th>`;
  h += `<th class="mt-col-pm">( + )</th>`;
  h += `<th class="mt-col-sisa">Sisa</th>`;
  h += `<th class="mt-col-koreksi">( ± )</th>`;
  h += '</tr></thead>';

  /* Body */
  h += '<tbody>';

  /* Opening stock row */
  h += `<tr class="mt-opening">`;
  h += `<td class="mt-s1" colspan="1"></td>`;
  h += `<td class="mt-s2">Sisa Awal</td>`;
  users.forEach(() => { h += '<td></td>'; });
  h += `<td></td><td></td>`;
  h += `<td class="mt-col-sisa mt-sisa-val">${openingStock}</td>`;
  h += `<td></td>`;
  h += '</tr>';

  /* Day rows */
  rows.forEach(row => {
    const cls = row.isWeekend ? 'mt-weekend' : '';
    h += `<tr class="${cls}">`;
    h += `<td class="mt-s1">${esc(row.hari)}</td>`;
    h += `<td class="mt-s2" style="font-size:10px;">${esc(row.tgl)}</td>`;

    users.forEach(u => {
      const v = row.users[u] || 0;
      if (v > 0) h += `<td class="mt-col-user mt-user-val">${v}</td>`;
      else       h += `<td class="mt-col-user mt-zero">0</td>`;
    });

    /* (−) keluar */
    if (row.keluar > 0) h += `<td class="mt-col-pm mt-keluar-val">${row.keluar}</td>`;
    else                h += `<td class="mt-col-pm mt-zero">0</td>`;

    /* (+) masuk */
    if (row.masuk > 0) h += `<td class="mt-col-pm mt-masuk-val">${row.masuk}</td>`;
    else               h += `<td class="mt-col-pm mt-zero">0</td>`;

    /* Sisa */
    h += `<td class="mt-col-sisa mt-sisa-val">${row.sisa}</td>`;

    /* (±) koreksi stok opname */
    h += koreksiTd(row.koreksi, 'mt-zero');
    h += '</tr>';
  });

  h += '</tbody>';

  /* Footer total */
  h += '<tfoot><tr>';
  h += `<td class="mt-s1" colspan="2">TOTAL</td>`;
  users.forEach(u => { h += `<td class="mt-col-user">${totals.users[u]||0}</td>`; });
  h += `<td class="mt-col-pm mt-keluar-val">${totals.keluar}</td>`;
  h += `<td class="mt-col-pm mt-masuk-val">${totals.masuk}</td>`;
  h += `<td class="mt-col-sisa mt-sisa-val">${totals.sisakAkhir}</td>`;
  h += koreksiTd(totals.koreksi, '');
  h += '</tr></tfoot>';

  h += '</table>';

  E.mtWrap.innerHTML = h;
  E.mtWrap.classList.remove('hidden');

  /* Scroll ke atas */
  E.mtWrap.scrollTop = 0;
  E.mtWrap.scrollLeft = 0;

  /* Catatan Koreksi Stok (stock opname) — terbaru di atas */
  renderKoreksiNotes(koreksiList || []);
}

function renderKoreksiNotes(koreksiList) {
  if (!koreksiList.length) {
    E.mtKoreksiNotes.classList.add('hidden');
    E.mtKoreksiNotes.innerHTML = '';
    return;
  }
  let h = `<div class="mt-koreksi-notes-title">${ic('edit_note','ms-18')}Catatan Koreksi Stok (${koreksiList.length})</div>`;
  koreksiList.forEach(k => {
    const isPlus  = k.delta > 0;
    const sign    = isPlus ? '+' : '';
    const dclass  = isPlus ? 'plus' : 'minus';
    h += `
      <div class="mt-koreksi-note-item">
        <div class="mt-koreksi-note-row1">
          <span class="mt-koreksi-note-meta">${esc(k.tgl)} · ${esc(k.time?k.time.substring(0,5):'—')} · ${esc(k.nama)}</span>
          <span class="mt-koreksi-note-delta ${dclass}">${sign}${k.delta}</span>
        </div>
        <div class="mt-koreksi-note-text">${esc(k.note || '—')}</div>
      </div>`;
  });
  E.mtKoreksiNotes.innerHTML = h;
  E.mtKoreksiNotes.classList.remove('hidden');
}

/* ── EXPORT: CSV (dibuka sebagai Excel) ──────────────────────── */
function exportMonthlyCsv() {
  const data = MT.lastData;
  if (!data) { toast('Data belum siap.', 'err'); return; }
  const { rows, totals, users, openingStock, monthName, year, koreksiList } = data;

  const sep   = ';';
  const lines = [];
  lines.push(`Tabel Galon - ${monthName} ${year}`);
  lines.push('');
  lines.push(['Hari', 'Tanggal', ...users, '(-)', '(+)', 'Sisa', '(±)'].join(sep));
  lines.push(['', 'Sisa Awal', ...users.map(() => ''), '', '', openingStock, ''].join(sep));

  rows.forEach(row => {
    lines.push([
      row.hari, row.tgl,
      ...users.map(u => row.users[u] || 0),
      row.keluar, row.masuk, row.sisa, row.koreksi,
    ].join(sep));
  });

  lines.push([
    'TOTAL', '',
    ...users.map(u => totals.users[u] || 0),
    totals.keluar, totals.masuk, totals.sisakAkhir, totals.koreksi,
  ].join(sep));

  if (koreksiList && koreksiList.length) {
    lines.push('');
    lines.push('Catatan Koreksi Stok (Stock Opname)');
    lines.push(['Tanggal', 'Jam', 'Oleh', 'Selisih', 'Catatan'].join(sep));
    koreksiList.forEach(k => {
      lines.push([
        k.tgl, k.time ? k.time.substring(0,5) : '',
        k.nama, (k.delta>0?'+':'')+k.delta,
        String(k.note||'').replace(/;/g, ','),
      ].join(sep));
    });
  }

  const csvContent = '\uFEFF' + lines.join('\r\n'); /* BOM → teks Indonesia aman di Excel */
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveBlobFile(blob, `Galon_${monthName}_${year}.csv`).then(r => {
    if (r !== 'cancel') toast(r === 'share' ? 'CSV siap disimpan/dibagikan.' : 'CSV berhasil diunduh.', 'ok');
  });
}
/* Simpan berkas: iOS (aplikasi terpasang) sering memblokir unduhan blob → pakai lembar Bagikan; selain itu unduhan biasa. */
async function saveBlobFile(blob, filename) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (ios && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return 'share'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'download';
}

/* ── EXPORT: PDF (via dialog print bawaan browser) ───────────── */
function exportMonthlyPdf() {
  if (!MT.lastData) { toast('Data belum siap.', 'err'); return; }
  document.body.classList.add('mt-printing');
  toast('Di dialog cetak, pilih "Simpan sebagai PDF".', '', 5000);
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('mt-printing'));

/* ███ 4. RIWAYAT LENGKAP & RIWAYAT SAYA ███ */
/* ── RIWAYAT LENGKAP & RIWAYAT SAYA (2 minggu, edit/hapus lewat tekan & tahan) ──
   Satu modal, dua mode: mine=false → semua orang; mine=true → hanya milik pengguna (disaring di server). */
const HIST = { loading: false, items: [], days: 14, mine: false, seq: 0 };   /* seq: hanya jawaban permintaan TERAKHIR yang dipakai */

function isHistoryOpen() { return !E.historyModal.classList.contains('hidden'); }

function openHistory(mine) {
  setActivity();
  HIST.mine = mine === true;
  HIST.items = [];
  E.historyTitle.innerHTML = HIST.mine ? ic('person') + 'Riwayat Saya' : ic('history') + 'Riwayat Lengkap';
  E.historyScroll.scrollTop = 0;
  E.historyModal.classList.remove('hidden');
  setNav(HIST.mine ? 'saya' : 'riwayat');
  fetchFullHistory(false);
}
function closeHistory() { E.historyModal.classList.add('hidden'); navReset(HIST.mine ? 'saya' : 'riwayat'); }

/* keepScroll=true: dipanggil setelah edit/hapus — daftar disegarkan tanpa loncat ke atas. */
function fetchFullHistory(keepScroll) {
  const seq = ++HIST.seq;
  HIST.loading = true;
  if (!keepScroll) {
    E.historyLoading.classList.remove('hidden');
    E.historyList.classList.add('hidden');
    E.historyEmpty.classList.add('hidden');
  }
  google.script.run
    .withSuccessHandler(res => {
      if (seq !== HIST.seq) return;   /* jawaban basi (mode/permintaan sudah berganti) */
      HIST.loading = false;
      E.historyLoading.classList.add('hidden');
      if (!res || !res.ok) {
        if (res && res.message === 'SESSION_EXPIRED') { closeHistory(); doLogout(true); return; }
        toast((res && res.message) || 'Gagal memuat riwayat.','err'); return;
      }
      HIST.items = res.items || [];
      HIST.days  = res.days || 14;
      renderHistory();
    })
    .withFailureHandler(err => {
      if (seq !== HIST.seq) return;
      HIST.loading = false;
      E.historyLoading.classList.add('hidden');
      toast((err && err.message) || 'Gagal memuat riwayat.','err');
    })
    .getTransactionHistory(S.token, HIST.mine);
}

function renderHistory() {
  const items = HIST.items;
  E.historySub.textContent = HIST.mine
    ? `${HIST.days} hari terakhir · ${items.length} transaksi milik Anda · ketuk ⋯ untuk edit atau hapus`
    : `${HIST.days} hari terakhir · ${items.length} transaksi · ketuk ⋯ untuk edit atau hapus`;
  E.historyEmpty.textContent = HIST.mine
    ? `Belum ada transaksi Anda dalam ${HIST.days} hari terakhir.`
    : `Tidak ada transaksi dalam ${HIST.days} hari terakhir.`;
  if (!items.length) {
    E.historyList.classList.add('hidden');
    E.historyEmpty.classList.remove('hidden');
    return;
  }
  E.historyEmpty.classList.add('hidden');
  const top = E.historyScroll.scrollTop;
  renderTxList(E.historyList, items, HIST.mine);
  E.historyList.classList.remove('hidden');
  E.historyScroll.scrollTop = top;
}

/* ███ 5. AKSI: submit, login, dashboard, simpan, admin, sinkron ███ */
/* ── SUBMIT STATE MACHINE ────── */
function isDemo() { return S.user && S.user.role==='demo'; }
/* Warna form mengikuti mode (Ambil = merah, Datang = hijau); aktif penuh setelah jumlah >= 1. */
function syncFormTheme() {
  const datang = S.mode === 'DATANG';
  E.formCard.setAttribute('data-mode', datang ? 'DATANG' : 'AMBIL');
  E.formCard.classList.toggle('has-qty', Number.isInteger(S.qty) && S.qty >= 1);
  E.modeBannerIc.textContent = datang ? 'login' : 'logout';
  E.modeBannerText.textContent = datang ? 'Stok datang' : 'Pengambilan galon';
}
function updateSubmitText() {
  syncFormTheme();
  if (S.submitState !== 'idle') return;
  if (isDemo()) { E.submitBtn.disabled=true; E.submitBtn.innerHTML=ic('lock','ms-20')+'Mode Demo'; E.submitBtn.setAttribute('data-mode',S.mode); E.submitBtn.setAttribute('data-state','idle'); return; }
  const qtyValid = Number.isInteger(S.qty) && S.qty >= 1;
  E.submitBtn.disabled = !qtyValid;
  E.submitBtn.setAttribute('data-mode', S.mode);
  E.submitBtn.setAttribute('data-state','idle');
  if (!qtyValid) { E.submitBtn.textContent = 'Jumlah minimal 1'; return; }
  const after = S.mode==='AMBIL'?S.stock-S.qty:S.stock+S.qty;
  const arrow = S.mode==='AMBIL'?'↓':'↑';
  E.submitBtn.innerHTML = ic('send','ms-20') + `<span>Kirim · ${S.stock} ${arrow} ${after}</span>`;
}
function setSubmitState(state) {
  S.submitState = state;
  if (state==='idle') {
    clearInterval(SUB.timer); SUB.timer = null;
    E.formCard.classList.remove('busy');
    E.submitBtn.setAttribute('data-state','idle');
    updateSubmitText();
  } else if (state==='submitting') {
    /* Terkunci selama proses: tombol biru + animasi + teks; sisa form tidak bisa disentuh. */
    E.formCard.classList.add('busy');
    E.submitBtn.disabled=true; E.submitBtn.setAttribute('data-state','submitting');
    E.submitBtn.innerHTML = '<span class="submit-prog" id="submitProg" aria-hidden="true"></span><span class="submit-prog-inner"><span class="btn-ring" aria-hidden="true"></span><span id="submitPct"></span></span>';
    submitProgressStart();
  }
}
/* Progres kirim: bar oranye mengisi tombol + persen. Naik cepat lalu melambat (maks 92%) sampai server menjawab, lalu 100%. */
const SUB = { timer: null, pct: 0 };
function submitProgressSet(p) {
  SUB.pct = p;
  const bar = document.getElementById('submitProg'), tx = document.getElementById('submitPct');
  if (bar) bar.style.width = p + '%';
  if (tx)  tx.textContent = (S.mode === 'AMBIL' ? 'Mengurangi stok' : 'Menambah stok') + '... ' + Math.round(p) + '%';
}
function submitProgressStart() {
  clearInterval(SUB.timer); submitProgressSet(0);
  SUB.timer = setInterval(() => { submitProgressSet(Math.min(92, SUB.pct + Math.max(.35, (92 - SUB.pct) * .045))); }, 80);
}
/* success=true: tampilkan 100% sebentar lalu lanjut; gagal: langsung lanjut. */
function submitProgressEnd(success, done) {
  clearInterval(SUB.timer); SUB.timer = null;
  if (!success) { done(); return; }
  submitProgressSet(100); setTimeout(done, 280);
}
/* Reset jumlah + catatan (mode, waktu, dan foto tidak diubah). */
function doResetForm() {
  if (S.submitState === 'submitting') return;
  S.qty = 0; E.qtyInput.value = 0; E.noteInput.value = '';
  updateSubmitText(); setActivity(); toast('Jumlah dan catatan direset.');
}
function handleSubmitTap() {
  if (isDemo()) { toast('Mode demo — tidak dapat menyimpan.','err'); return; }
  setActivity();
  if (S.submitState==='submitting') return;   /* cegah klik berulang selama proses */
  if (!Number.isInteger(S.qty)||S.qty<1) { toast('Jumlah harus lebih dari 0.','err'); return; }
  if (S.mode==='DATANG'&&!S.photoDataUrl) { toast('Foto invoice belum diambil.','err'); return; }
  const w = readTxWhen();
  if (w.error) { toast(w.error,'err'); return; }

  /* Tanpa dialog konfirmasi: data langsung diproses. */
  setSubmitState('submitting');
  doSaveTransaction();
}

/* ── MODE ────────────────────── */
function setMode(mode) {
  if (S.submitState==='submitting') return;   /* jangan ganti mode saat penyimpanan berjalan */
  S.mode=mode; S.photoDataUrl=''; S.photoName=''; E.photoInputCamera.value=''; E.photoInputGallery.value=''; renderPhotoThumb();
  E.modeAmbilBtn.classList.toggle('active', mode!=='DATANG');
  E.modeDatangBtn.classList.toggle('active', mode==='DATANG');
  E.photoSection.classList.toggle('hidden', mode!=='DATANG');
  S.qty=0; E.qtyInput.value=0; resetTxWhen(); setSubmitState('idle'); setActivity();
}
/* Pilih sumber foto invoice: dialog di tengah layar dengan latar blur (seperti referensi). */
function openPhotoPicker()  { E.pickerModal.classList.remove('hidden'); }
function closePhotoPicker() { E.pickerModal.classList.add('hidden'); }
function renderPhotoThumb() {
  if (!S.photoDataUrl) {
    E.photoThumb.innerHTML=ic('receipt_long','ms-28')+'<span>Tap untuk pilih foto invoice — dari kamera atau galeri</span>';
    E.photoThumb.classList.remove('has-photo');
    E.photoRemoveBtn.classList.add('hidden');
  } else {
    E.photoThumb.innerHTML=`<img src="${S.photoDataUrl}" alt="Invoice">`;
    E.photoThumb.classList.add('has-photo');
    E.photoRemoveBtn.classList.remove('hidden');
  }
}

/* ── WAKTU TRANSAKSI ─────────── */
function openTxWhenEdit() {
  const now = nowS();
  E.txDateInput.min   = toISODate(new Date(now.getTime() - MAX_BACKDATE_DAYS*86400000));
  E.txDateInput.max   = toISODate(now);
  E.txDateInput.value = toISODate(now);
  E.txTimeInput.value = toHHMM(now);
  S.txCustom = true;
  E.timeNowView.classList.add('hidden');
  E.timeEditView.classList.remove('hidden');
  setActivity();
}
function resetTxWhen() {
  S.txCustom = false;
  E.txDateInput.value = ''; E.txTimeInput.value = '';
  E.timeEditView.classList.add('hidden');
  E.timeNowView.classList.remove('hidden');
}
/* Validasi tanggal/jam pilihan user (server memvalidasi ulang). */
function readTxWhen() {
  if (!S.txCustom) return { custom:false };
  const date = E.txDateInput.value, time = E.txTimeInput.value;
  if (!date || !time) return { error:'Tanggal dan jam harus diisi.' };
  const now = nowS();
  if (date > toISODate(now)) return { error:'Tanggal tidak boleh di masa depan.' };
  if (date < toISODate(new Date(now.getTime() - MAX_BACKDATE_DAYS*86400000))) return { error:`Maksimal mundur ${MAX_BACKDATE_DAYS} hari.` };
  if (date === toISODate(now) && time > toHHMM(now)) return { error:'Jam tidak boleh di masa depan.' };
  return { custom:true, date, time };
}

/* ── APPLY DATA ──────────────── */
function applyData(res) {
  const prev=S.stock;
  if(res.serverTime!==undefined) setServerSkew(res.serverTime);
  if(res.stock!==undefined)  S.stock  =Number(res.stock);
  if(res.warning!==undefined)S.warning=Number(res.warning);
  if(res.danger!==undefined) S.danger =Number(res.danger);
  if(res.status!==undefined) S.status =res.status;
  if(res.recent!==undefined) S.recent =res.recent;
  if(res.month!==undefined)  S.month  =res.month;
  if(res.monthLabel!==undefined) S.monthLabel=res.monthLabel;
  if(res.user!==undefined)   S.user   =res.user;
  if(res.announcements!==undefined)      S.ann = res.announcements;
  if(res.stock!==undefined)              { S.lastSync = Date.now(); S.syncError = false; }   /* respons berisi stok = data segar */
  renderStock(prev!==S.stock); renderRecent(); renderAnnouncements(); renderRunningTextAdmin(); renderSync(); saveCache();
}

/* ── LOGIN / LOGOUT ──────────── */
function doLogin() {
  const code=E.codeInput.value.trim(); setLoginError('');
  if(!code){setLoginError('Kode akses harus diisi.');return;}
  E.loginBtn.disabled=true;
  Splash.show('Memverifikasi kode akses…', [[1600,'Memuat data stok…'],[6000,'Masih memuat, mohon tunggu…']]);
  google.script.run
    .withSuccessHandler(res=>{
      E.loginBtn.disabled=false;
      if(!res||!res.ok){Splash.cancel();setLoginError((res&&res.message)||'Login gagal.');return;}
      S.token=res.token; S.user=res.user; S.expiresAt=res.expiresAt; S.lastActivity=Date.now(); saveCache();
      if (res.deviceKey) { S.deviceKey = res.deviceKey; try { localStorage.setItem('galon_dev', res.deviceKey); } catch (_) {} }
      showView('main'); setMode('AMBIL');
      if (res.stock !== undefined) applyData(res); else loadDashboard(false);   /* login sudah membawa data dashboard */
      startIdleWatcher();
      Splash.finish();   /* bilah penuh lalu splash memudar, menu utama sudah siap di belakangnya */
      toast(`Masuk sebagai ${res.user.kode}`,'ok');
      restoreDraft();
    })
    .withFailureHandler(err=>{ E.loginBtn.disabled=false; Splash.cancel(); setLoginError((err&&err.message)||'Koneksi gagal.'); })
    .login(code, S.deviceKey || '');
}
function setLoginError(msg) { E.loginError.textContent=msg; E.loginError.classList.toggle('hidden',!msg); }
function doLogout(fromIdle=false) {
  if(fromIdle) saveDraft();   /* sesi habis mendadak: jangan hilangkan isian */
  if(S.token) google.script.run.logout(S.token);
  clearCache();
  Object.assign(S,{token:null,user:null,expiresAt:0,stock:0,recent:[],month:{masuk:0,keluar:0},monthLabel:'—',qty:1,photoDataUrl:'',photoName:'',pendingDelete:null,ann:[],syncing:false,syncError:false,lastSync:0,flash:''});
  if(S.idleTimer){clearInterval(S.idleTimer);S.idleTimer=null;}
  showView('login'); E.codeInput.value=''; setLoginError('');
  if(fromIdle) toast('Sesi berakhir. Silakan masuk lagi.');
}

/* ── DASHBOARD ───────────────── */
function loadDashboard(silent=false) {
  if(!S.token || S.syncing) return;
  S.syncing = true; S.syncError = false; renderSync();
  if(!silent){E.refreshBtn.classList.add('spinning');E.refreshBtn.disabled=true;}
  google.script.run
    .withSuccessHandler(res=>{
      S.syncing = false;
      if(!silent){E.refreshBtn.classList.remove('spinning');E.refreshBtn.disabled=false;}
      if(!res||!res.ok){
        if(res&&res.message==='SESSION_EXPIRED'){doLogout(true);return;}
        S.syncError = true; renderSync();
        if(!silent)toast((res&&res.message)||'Gagal memuat.','err');
        return;
      }
      applyData(res); if(!silent)toast('Data diperbarui','ok'); setActivity();
    })
    .withFailureHandler(err=>{
      S.syncing = false; S.syncError = true; renderSync();
      if(!silent){E.refreshBtn.classList.remove('spinning');E.refreshBtn.disabled=false;toast((err&&err.message)||'Gagal memuat.','err');}
    })
    .getDashboardData(S.token);
}

/* ── SINKRON, JUMLAH CEPAT, SOROT ── */
const AUTO_REFRESH_MIN_MS = 30 * 1000;   /* jeda minimal antar pembaruan otomatis */

function renderSync() {
  const busy = S.syncing, err = !busy && S.syncError;
  E.scSyncDot.classList.toggle('sync-busy', busy);
  E.scSyncDot.classList.toggle('sync-err', err);
  E.scSyncLabel.classList.toggle('err', err);
  E.scSyncLabel.textContent = busy ? 'Memperbarui…'
    : err ? 'Gagal memperbarui · ketuk untuk ulangi'
    : S.lastSync ? `Diperbarui ${toHHMM(new Date(S.lastSync))} ↻`
    : 'Ketuk untuk memperbarui ↻';
}

/* Aplikasi kembali tampil (buka HP / pindah dari aplikasi lain): segarkan diam-diam bila data >30 detik. */
function maybeAutoRefresh() {
  if (!S.token || S.syncing) return;
  if (Date.now() - S.lastActivity > IDLE_MS) { doLogout(true); return; }
  if (Date.now() - S.lastSync < AUTO_REFRESH_MIN_MS) return;
  loadDashboard(true);
}

/* Transaksi milik sendiri terbaru = yang baru saja disimpan (waktu input terbesar). */
function newestOwnTxKey(list) {
  const mine = (list || []).filter(t => S.user && t.kode === S.user.kode);
  if (!mine.length) return '';
  const t = mine.reduce((a, b) => String(b.timestamp) > String(a.timestamp) ? b : a);
  return `${t.timestamp}|${t.kode}`;
}
function flashTx(key) { S.flash = key || ''; if (key && navigator.vibrate) navigator.vibrate(40); }
function clearFlashLater() {
  if (!S.flash) return;
  setTimeout(() => {
    S.flash = '';
    document.querySelectorAll('.tx-flash').forEach(el => el.classList.remove('tx-flash'));
  }, 2600);
}

/* ── SAVE TX ─────────────────── */
function doSaveTransaction() {
  const mode = S.mode, qty = S.qty;
  google.script.run
    .withSuccessHandler(res=>{
      submitProgressEnd(!!(res&&res.ok), ()=>{
        setSubmitState('idle');   /* tombol kembali normal, berhasil maupun gagal */
        if(res&&res.message==='SESSION_EXPIRED'){doLogout(true);return;}
        if(!res||!res.ok){toast('Gagal menyimpan: '+((res&&res.message)||'tidak ada respons dari server.'),'err',4500);return;}
        E.noteInput.value=''; S.photoDataUrl=''; S.photoName=''; E.photoInputCamera.value=''; E.photoInputGallery.value=''; renderPhotoThumb();
        S.qty=0; E.qtyInput.value=0; resetTxWhen(); flashTx(newestOwnTxKey(res.recent)); applyData(res); clearFlashLater();
        const sisa = Number(res.stock);
        toast(`${mode==='AMBIL'?'Ambil':'Galon datang'} ${qty} galon tersimpan. Sisa stok: ${sisa}${sisa<0?' (minus, cek pencatatan)':''}.`,'ok',4000);
        setActivity();
      });
    })
    .withFailureHandler(err=>{ submitProgressEnd(false, ()=>{ setSubmitState('idle'); toast('Gagal menyimpan: '+((err&&err.message)||'koneksi bermasalah.'),'err',4500); }); })
    .saveTransaction({token:S.token,type:mode,qty:qty,note:E.noteInput.value.trim(),photoDataUrl:mode==='DATANG'?S.photoDataUrl:'',photoName:S.photoName,txDate:S.txCustom?E.txDateInput.value:'',txTime:S.txCustom?E.txTimeInput.value:''});
}

/* ── IMAGE COMPRESS ──────────── */
function compressImage(file,maxW=1280,q=0.72) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('File tidak bisa dibaca.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Gambar tidak valid.'));
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        resolve(cv.toDataURL('image/jpeg',q));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── ADMIN ───────────────────── */
function openAdmin() {
  const demo=isDemo();
  E.correctStockInput.value=''; E.correctNoteInput.value='';
  E.correctStockBtn.disabled=demo; E.correctStockBtn.innerHTML=demo?ic('lock','ms-20')+'Mode Demo':'Simpan Koreksi';
  [E.reloadConfigBtn,E.reloadTxBtn,E.reloadAllBtn].forEach(b=>{ b.disabled=demo; });
  onAdminOpenAnnouncements(demo);
  E.adminModal.classList.remove('hidden');
}
function closeAdmin() { E.adminModal.classList.add('hidden'); }
function doCorrectStock() {
  if(isDemo()){toast('Mode demo — tidak dapat menyimpan.','err');return;}
  const val=E.correctStockInput.value.trim(), note=E.correctNoteInput.value.trim();
  if(!val){toast('Isi stok aktual dulu.','err');return;}
  if(!note){toast('Alasan koreksi wajib diisi.','err');return;}
  E.correctStockBtn.disabled=true; E.correctStockBtn.textContent='Menyimpan…';
  google.script.run
    .withSuccessHandler(res=>{
      E.correctStockBtn.disabled=false; E.correctStockBtn.textContent='Simpan Koreksi';
      if(!res||!res.ok){toast((res&&res.message)||'Gagal.','err');return;}
      applyData(res); toast(res.message||'Koreksi tersimpan.','ok');
      E.correctStockInput.value=''; E.correctNoteInput.value=''; closeAdmin();
    })
    .withFailureHandler(err=>{ E.correctStockBtn.disabled=false; E.correctStockBtn.textContent='Simpan Koreksi'; toast((err&&err.message)||'Gagal.','err'); })
    .correctStock(S.token,parseInt(val,10),note);
}
function runReloadCache(btn, label, fnName) {
  if(isDemo()){toast('Mode demo — tidak dapat memuat ulang cache.','err');return;}
  const original=btn.innerHTML;
  btn.disabled=true; btn.innerHTML=loadingBar()+'Memuat ulang…';
  google.script.run
    .withSuccessHandler(res=>{
      btn.disabled=false; btn.innerHTML=original;
      if(!res||!res.ok){toast((res&&res.message)||'Gagal memuat ulang.','err');return;}
      applyData(res); toast(res.message||`${label} dimuat ulang.`,'ok');
    })
    .withFailureHandler(err=>{ btn.disabled=false; btn.innerHTML=original; toast((err&&err.message)||'Gagal memuat ulang.','err'); })
    [fnName](S.token);
}
function doReloadConfigCache()      { runReloadCache(E.reloadConfigBtn, 'Config cache',      'reloadConfigCache'); }
function doReloadTransactionCache() { runReloadCache(E.reloadTxBtn,     'Transaction cache',  'reloadTransactionCache'); }
function doReloadAllCache()         { runReloadCache(E.reloadAllBtn,    'Semua cache',        'reloadAllCache'); }

/* ███ 6. RUNNING TEXT: teks berjalan untuk semua role + form admin ███ */
/* Satu teks berjalan tanpa batas waktu (tampil untuk petugas, admin, dan demo) sampai admin mengedit/menghapusnya.
   Admin: satu kolom teks; tombol "Kirim Running Text" bila belum ada, "Edit Running Text" bila sudah ada, plus "Hapus". */
const A = { list: $('annList'), pesan: $('annPesan'), sendBtn: $('annSendBtn'), delBtn: $('annDeleteBtn') };

function currentRunningText() { return (S.ann && S.ann[0]) ? String(S.ann[0].pesan || '') : ''; }

function renderAnnouncements() {
  const text = currentRunningText().replace(/\s*\n\s*/g, ' ').trim();
  A.list.innerHTML = '';
  if (!text) { A.list.classList.add('hidden'); return; }
  const dur = Math.max(14, Math.round((text.length + 14) * 0.16));   /* kecepatan baca tetap: lebih panjang = lebih lama */
  A.list.innerHTML =
    `<div class="ann-strip warn" role="marquee" title="${esc(text)}">` +
      ic('campaign', 'ann-lead') +
      `<div class="ann-marquee"><div class="ann-marquee-content" style="animation-duration:${dur}s"><span class="ann-seg"><b>Pengumuman:</b> ${esc(text)}</span></div></div>` +
    `</div>`;
  A.list.classList.remove('hidden');
}

/* Label tombol mengikuti kondisi: ada running text → Edit (+ Hapus); belum ada → Kirim. */
function renderRunningTextAdmin() {
  const has = !!currentRunningText();
  if (S.annBusy) return;   /* jangan menimpa label "Mengirim…" saat permintaan berjalan */
  A.sendBtn.innerHTML = isDemo() ? ic('lock','ms-20') + 'Mode Demo'
                                 : ic(has ? 'edit' : 'send','ms-20') + (has ? 'Edit Running Text' : 'Kirim Running Text');
  A.delBtn.classList.toggle('hidden', !has);
}

function onAdminOpenAnnouncements(demo) {
  A.pesan.value = currentRunningText();
  A.pesan.disabled = demo; A.sendBtn.disabled = demo; A.delBtn.disabled = demo;
  renderRunningTextAdmin();
  if (!demo) loadDashboard(true);   /* segarkan teks terbaru dari server */
}

function doSaveRunningText() {
  if (isDemo()) { toast('Mode demo — tidak dapat menyimpan.','err'); return; }
  const pesan = A.pesan.value.trim(), editing = !!currentRunningText();
  if (!pesan) { toast('Isi teks running text dulu.','err'); return; }
  if (pesan === currentRunningText()) { toast('Tidak ada perubahan.'); return; }
  S.annBusy = true; A.sendBtn.disabled = true; A.delBtn.disabled = true;
  A.sendBtn.innerHTML = loadingBar() + (editing ? 'Menyimpan…' : 'Mengirim…');
  const done = () => { S.annBusy = false; A.sendBtn.disabled = false; A.delBtn.disabled = false; renderRunningTextAdmin(); };
  google.script.run
    .withSuccessHandler(res => {
      done();
      if (!res || !res.ok) {
        if (res && res.message === 'SESSION_EXPIRED') { closeAdmin(); doLogout(true); return; }
        toast((res && res.message) || 'Gagal menyimpan.','err'); return;
      }
      applyData(res); A.pesan.value = currentRunningText();
      toast(res.message || 'Running text tersimpan.','ok'); setActivity();
    })
    .withFailureHandler(err => { done(); toast((err && err.message) || 'Gagal menyimpan.','err'); })
    .saveRunningText(S.token, pesan);
}

function doDeleteRunningText() {
  if (isDemo()) { toast('Mode demo — tidak dapat menyimpan.','err'); return; }
  showConfirm('Hapus Running Text?', 'Teks berjalan akan hilang dari semua pengguna.', () => {
    S.annBusy = true; A.sendBtn.disabled = true; A.delBtn.disabled = true; A.delBtn.innerHTML = loadingBar() + 'Menghapus…';
    const done = () => { S.annBusy = false; A.sendBtn.disabled = false; A.delBtn.disabled = false; A.delBtn.innerHTML = ic('delete','ms-20') + 'Hapus Running Text'; renderRunningTextAdmin(); };
    google.script.run
      .withSuccessHandler(res => {
        done();
        if (!res || !res.ok) {
          if (res && res.message === 'SESSION_EXPIRED') { closeAdmin(); doLogout(true); return; }
          toast((res && res.message) || 'Gagal menghapus.','err'); return;
        }
        applyData(res); A.pesan.value = '';
        toast(res.message || 'Running text dihapus.','ok'); setActivity();
      })
      .withFailureHandler(err => { done(); toast((err && err.message) || 'Gagal menghapus.','err'); })
      .deleteRunningText(S.token);
  });
}

/* ███ 7. EVENT & INIT ███ */
/* Esc menutup dialog/lembar yang paling atas. */
function closeTopDialog() {
  const order = [['confirmModal', hideConfirm], ['pickerModal', closePhotoPicker], ['editModal', closeEditModal], ['deleteModal', closeDeleteModal],
                 ['adminModal', closeAdmin], ['menuModal', closeMenu], ['monthlyModal', closeMonthlyTable], ['historyModal', closeHistory]];
  for (const [id, fn] of order) if (!E[id].classList.contains('hidden')) { fn(); return true; }
  return false;
}
/* ── EVENTS ──────────────────── */
function bindEvents() {
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && closeTopDialog()) ev.preventDefault(); });
  window.addEventListener('pagehide', saveCache);   /* simpan aktivitas terakhir saat aplikasi ditutup */
  E.loginBtn.addEventListener('click', doLogin);
  E.codeInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') doLogin(); });

  E.menuModal.addEventListener('click', ev=>{ if(ev.target===E.menuModal) closeMenu(); });

  E.refreshBtn.addEventListener('click', ()=>{ closeMenu(); setActivity(); loadDashboard(false); });
  E.logoutBtn.addEventListener('click',  ()=>{
    closeMenu();
    showConfirm('Keluar Aplikasi?', 'Anda harus login kembali untuk melanjutkan.', ()=>doLogout(false));
  });
  E.adminBtn.addEventListener('click',   ()=>{ closeMenu(); openAdmin(); });

  E.modeAmbilBtn.addEventListener('click', ()=>setMode('AMBIL'));
  E.modeDatangBtn.addEventListener('click', ()=>setMode('DATANG'));

  E.minusBtn.addEventListener('click', ()=>{ S.qty=Math.max(0,S.qty-1); E.qtyInput.value=S.qty; updateSubmitText(); setActivity(); });
  E.plusBtn.addEventListener('click',  ()=>{ S.qty=Math.min(999,S.qty+1); E.qtyInput.value=S.qty; updateSubmitText(); setActivity(); });
  E.qtyInput.addEventListener('input', ()=>{ const v=parseInt(E.qtyInput.value,10); S.qty=(Number.isInteger(v)&&v>=0)?Math.min(999,v):0; updateSubmitText(); setActivity(); });
  E.qtyInput.addEventListener('blur',  ()=>{ E.qtyInput.value=S.qty; });

  async function handlePhotoFile(ev) {
    const file=ev.target.files&&ev.target.files[0]; if(!file) return;
    setActivity(); toast('Mengompres foto…');
    try { S.photoDataUrl=await compressImage(file); S.photoName=file.name||'invoice.jpg'; renderPhotoThumb(); toast('Foto siap.','ok'); }
    catch(err){ toast(err.message||'Gagal memproses foto.','err'); S.photoDataUrl=''; S.photoName=''; renderPhotoThumb(); }
  }
  E.photoInputCamera.addEventListener('change', handlePhotoFile);
  E.photoInputGallery.addEventListener('change', handlePhotoFile);
  E.photoThumb.addEventListener('click', ()=>{ if (S.submitState==='submitting') return; setActivity(); openPhotoPicker(); });
  E.photoCameraBtn.addEventListener('click', ()=>{ setActivity(); closePhotoPicker(); E.photoInputCamera.click(); });
  E.photoGalleryBtn.addEventListener('click', ()=>{ setActivity(); closePhotoPicker(); E.photoInputGallery.click(); });
  E.photoPickerCancelBtn.addEventListener('click', closePhotoPicker);
  E.pickerModal.addEventListener('click', ev=>{ if(ev.target===E.pickerModal) closePhotoPicker(); });
  E.resetFormBtn.addEventListener('click', doResetForm);
  E.photoRemoveBtn.addEventListener('click', ()=>{
    S.photoDataUrl=''; S.photoName=''; E.photoInputCamera.value=''; E.photoInputGallery.value=''; renderPhotoThumb(); setActivity();
  });

  E.submitBtn.addEventListener('click', handleSubmitTap);

  /* Sinkron: ketuk label untuk memperbarui; otomatis saat aplikasi kembali tampil */
  E.scSync.addEventListener('click', ()=>{ setActivity(); loadDashboard(false); });
  document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') maybeAutoRefresh(); });
  window.addEventListener('focus', maybeAutoRefresh);

  E.timeEditBtn.addEventListener('click', openTxWhenEdit);
  E.timeResetBtn.addEventListener('click', ()=>{ resetTxWhen(); setActivity(); });


  /* Monthly table */

  /* Riwayat Lengkap */
  /* Navbar bawah */
  Object.keys(NAV_MAP).forEach(k => E[NAV_MAP[k]].addEventListener('click', ()=>goNav(k)));
  E.historyCloseBtn.addEventListener('click', closeHistory);
  E.historyModal.addEventListener('click', ev=>{ if(ev.target===E.historyModal) closeHistory(); });
  E.mtPickerCloseBtn.addEventListener('click', closeMonthlyTable);
  E.mtRenderBtn.addEventListener('click', renderFromPicker);

  E.mtCloseBtn.addEventListener('click', closeMonthlyTable);
  E.mtExportPdfBtn.addEventListener('click', exportMonthlyPdf);
  E.mtExportExcelBtn.addEventListener('click', exportMonthlyCsv);
  E.monthlyModal.addEventListener('click', ev=>{ if(ev.target===E.monthlyModal) closeMonthlyTable(); });
  E.mtPrevBtn.addEventListener('click', ()=> stepReportMonth(-1));
  E.mtNextBtn.addEventListener('click', ()=> stepReportMonth(1));

  /* Admin modal */
  E.correctStockBtn.addEventListener('click', doCorrectStock);
  E.reloadConfigBtn.addEventListener('click', doReloadConfigCache);
  E.reloadTxBtn.addEventListener('click',     doReloadTransactionCache);
  E.reloadAllBtn.addEventListener('click',    doReloadAllCache);
  E.closeAdminBtn.addEventListener('click',   closeAdmin);
  E.adminModal.addEventListener('click', ev=>{ if(ev.target===E.adminModal) closeAdmin(); });

  /* Delete modal */
  E.confirmDeleteBtn.addEventListener('click', doDeleteTransaction);
  E.cancelDeleteBtn.addEventListener('click',  closeDeleteModal);
  E.deleteModal.addEventListener('click', ev=>{ if(ev.target===E.deleteModal) closeDeleteModal(); });
  E.openEditBtn.addEventListener('click', ()=>{ const tx=S.pendingDelete; closeDeleteModal(); if(tx) openEditModal(tx); });

  /* Edit modal */
  E.editMinusBtn.addEventListener('click', ()=>stepEditQty(-1));
  E.editPlusBtn.addEventListener('click',  ()=>stepEditQty(1));
  E.editQtyInput.addEventListener('input', updateEditPreview);
  E.saveEditBtn.addEventListener('click',  doEditTransaction);
  E.cancelEditBtn.addEventListener('click', closeEditModal);
  E.editModal.addEventListener('click', ev=>{ if(ev.target===E.editModal) closeEditModal(); });

  /* Pengumuman (admin) */
  A.sendBtn.addEventListener('click', doSaveRunningText);
  A.delBtn.addEventListener('click',  doDeleteRunningText);

  /* Confirm modal (generik) */
  E.confirmYesBtn.addEventListener('click', ()=>{ const cb=_confirmCallback; hideConfirm(); if (cb) cb(); });
  E.confirmNoBtn.addEventListener('click',  hideConfirm);
  E.confirmModal.addEventListener('click', ev=>{ if(ev.target===E.confirmModal) hideConfirm(); });

  /* Activity */
  ['pointerdown','keydown','touchstart'].forEach(ev=>{
    document.addEventListener(ev, ()=>{ if(S.token) setActivity(); }, { passive:true });
  });
}

/* ── KEYBOARD-AWARE SCROLL (mirip FB: input naik otomatis di atas keyboard) ── */
function scrollFieldAboveKeyboard(el) {
  if (!el) return;
  const doScroll = () => {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(_) {}
  };
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onResize = () => { doScroll(); vv.removeEventListener('resize', onResize); };
    vv.addEventListener('resize', onResize);
    /* Fallback: kalau event resize tidak terpicu (browser lama), tetap scroll setelah animasi keyboard */
    setTimeout(doScroll, 350);
  } else {
    setTimeout(doScroll, 350);
  }
}
function bindKeyboardAwareScroll() {
  document.addEventListener('focusin', ev => {
    const el = ev.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      scrollFieldAboveKeyboard(el);
    }
  });
}

/* ── INIT ────────────────────── */
function init() {
  Splash.show('Memulai…');
  bindEvents();
  bindKeyboardAwareScroll();
  updateClock();
  const cache = loadCache();
  if (!cache||!cache.token||Date.now()-(cache.lastActivity||0)>IDLE_MS) {   /* sesi geser: kedaluwarsa bila tak aktif 30 menit (server memperpanjang tiap panggilan) */
    clearCache(); showView('login'); setTimeout(()=>E.codeInput.focus(),80); Splash.finish(true); return;
  }
  Object.assign(S, {
    token:cache.token, user:cache.user, expiresAt:cache.expiresAt,
    lastActivity:cache.lastActivity||Date.now(),
    stock:cache.stock||0, warning:cache.warning||20, danger:cache.danger||10,
    status:cache.status||'safe',
    recent:cache.recent||[], month:cache.month||{masuk:0,keluar:0}, monthLabel:cache.monthLabel||'—', ann:cache.ann||[], lastSync:cache.lastSync||0, skewMs:cache.skewMs||0,
  });
  showView('main'); setMode('AMBIL');
  renderStock(false); renderRecent(); renderAnnouncements(); startIdleWatcher();
  Splash.finish(true);
  loadDashboard(true);
}
init();
