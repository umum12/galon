#!/usr/bin/env node
/* Merakit frontend GitHub Pages dari file HTML yang SAMA dengan versi Apps Script.
   Perintah:  node build.js            (gagal bila apiUrl di config.json belum diisi)
              node build.js --allow-placeholder   (hanya untuk uji lokal)
   Hasil: folder dist/ siap diterbitkan. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = __dirname;
const FRONT = path.join(ROOT, 'frontend'), SRC = path.join(ROOT, 'src'), ICONS = path.join(ROOT, 'icons'), DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(p, 'utf8');
const cfg = JSON.parse(read(path.join(ROOT, 'config.json')));
const allowPlaceholder = process.argv.includes('--allow-placeholder');

const URL_RE = /^https:\/\/script\.google\.com\/(macros\/s|a\/macros\/[^/]+\/s)\/[A-Za-z0-9_-]+\/exec$/;
if (!URL_RE.test(cfg.apiUrl)) {
  if (!allowPlaceholder) {
    console.error('GAGAL: "apiUrl" di config.json belum berisi URL Web App (https://script.google.com/macros/s/.../exec).');
    process.exit(1);
  }
  console.warn('PERINGATAN: apiUrl belum valid (mode uji lokal).');
}

const INCLUDE_RE = /<\?!=\s*include\('([^']+)'\);?\s*\?>/g;
const shim = read(path.join(SRC, 'gas-shim.js'));
const bootstrap = `<script>window.GALON_API_URL=${JSON.stringify(cfg.apiUrl)};</script>\n<script>\n${shim}\n</script>\n`;

let html = read(path.join(FRONT, 'index.html'));
html = html.replace(INCLUDE_RE, (_, name) => {
  const f = path.join(FRONT, name + '.html');
  if (!fs.existsSync(f)) throw new Error(`File include tidak ditemukan: frontend/${name}.html`);
  return (name === 'script' ? bootstrap : '') + read(f);   // penyesuai dimuat sebelum JS aplikasi (script.html)
});
if (/<\?/.test(html)) throw new Error('Masih ada tag template Apps Script (<? ... ?>) di hasil rakitan.');
if (!html.includes('</head>') || !html.includes('</body>')) throw new Error('index.html tidak memiliki </head> atau </body>.');
if (!html.includes('window.GALON_API_URL')) throw new Error('Penyesuai tidak tersisip: include("script") tidak ditemukan di index.html.');

html = html.replace('</head>', read(path.join(SRC, 'head.html')) + '</head>');
html = html.replace('</body>', read(path.join(SRC, 'sw-register.html')) + '</body>');

const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);
const iconFiles = ['favicon.svg', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const precache = ['index.html', 'manifest.webmanifest', ...iconFiles.map((f) => 'icons/' + f)];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), read(path.join(SRC, 'manifest.webmanifest')));
fs.writeFileSync(path.join(DIST, 'sw.js'), read(path.join(SRC, 'sw.js')).replace('__HASH__', hash).replace('__PRECACHE__', JSON.stringify(precache)));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
for (const f of iconFiles) fs.copyFileSync(path.join(ICONS, f), path.join(DIST, 'icons', f));

console.log(`OK  dist/index.html ${(html.length / 1024).toFixed(1)} KB · cache ${hash} · v${cfg.version}`);
