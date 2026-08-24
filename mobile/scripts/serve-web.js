/**
 * Petit serveur statique pour prévisualiser le build web dans un navigateur.
 *
 *   npm run build:web && node scripts/serve-web.js
 *
 * Sert `dist-web/` sur toutes les interfaces, afin que la page soit aussi
 * accessible depuis un téléphone du même réseau Wi-Fi.
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist-web');
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(DIST)) {
  console.error(`Dossier introuvable : ${DIST}\nLancez d'abord : npm run build:web`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);

    // Application à page unique : toute route inconnue retombe sur index.html.
    if (!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'index.html');
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);

    console.log(`\n  N'ma Restaurant — aperçu web\n`);
    console.log(`  Sur cet ordinateur : http://localhost:${PORT}`);
    for (const address of addresses) {
      console.log(`  Depuis le réseau   : http://${address}:${PORT}`);
    }
    console.log('\n  Ctrl+C pour arrêter.\n');
  });
