# Galon App — Frontend GitHub Pages (PWA)

Frontend kedua untuk Galon App. Backend (Apps Script, Spreadsheet, Drive) **tidak berubah**.
File di folder `frontend/` adalah salinan PERSIS file HTML versi Apps Script — tidak ada kode ganda.

## Pasang (sekali)
1. Buat repositori GitHub (publik, agar Pages gratis). Unggah seluruh isi folder ini, termasuk `.github/workflows/pages.yml`.
2. Buka `config.json`, isi `apiUrl` dengan URL Web App Apps Script (berakhiran `/exec`).
3. Repositori → **Settings → Pages → Source: GitHub Actions**.
4. Commit ke cabang `main`. Tab **Actions** akan membangun dan menerbitkan. Alamat akhir:
   `https://NAMA-GITHUB.github.io/NAMA-REPO/`
5. (Opsional) Isi `APP_ICON_URL` di `Config.gs` dengan `https://NAMA-GITHUB.github.io/NAMA-REPO/icons/icon-192.png`
   agar tab versi Apps Script memakai ikon yang sama.

## Pasang di HP
- **Android (Chrome):** menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*.
- **iPhone (Safari):** tombol Bagikan → *Tambah ke Layar Utama*.

## Memperbarui
Setiap kali file frontend di Apps Script berubah, ganti file bernama sama di folder `frontend/` lalu commit.
Nomor versi di `config.json` hanya penanda. Halaman selalu diambil terbaru dari jaringan saat aplikasi dibuka.

## Perilaku offline
- Cangkang aplikasi (tampilan) tetap terbuka tanpa internet, dengan data terakhir yang tersimpan di HP.
- **Tidak ada antrean tulis offline**: simpan/edit/hapus butuh koneksi. Ini disengaja agar tidak ada transaksi ganda atau stok palsu.
- Data tidak pernah disimpan service worker.

## Keamanan
- Repositori publik: jangan taruh rahasia apa pun. URL `/exec` memang akan terlihat; itu bukan rahasia.
- Daftar kode akses ada di backend, bukan di repositori ini.
- Sesi di versi ini terpisah dari versi Apps Script (penyimpanan browser berbeda) — masuk terpisah.
- Token sesi dikirim di dalam isi permintaan, bukan cookie/header (tidak ada risiko CSRF; header kustom akan memicu preflight CORS dan GAGAL di Apps Script).

## Uji lokal
`node build.js --allow-placeholder` lalu buka `dist/index.html` lewat server statis. Tanpa `apiUrl` yang valid, build biasa sengaja gagal.
