#!/usr/bin/env node
/* Renders the store key art (tools/keyart.html: the game's own sprites and paintings composed on one pixel grid)
 * into store/.
 *   node tools/covers.js
 * Sizes follow CrazyGames' usual cover formats; recheck the current requirements before upload.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Install it with: npm i -D playwright');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const SIZES = [
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, region: 0 },
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, region: 6 },
  { name: 'cover-square-800x800', w: 800, h: 800, region: 1 }
];

(async () => {
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  const port = srv.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
    await ctx.route('**/sdk.crazygames.com/**', (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${port}/tools/keyart.html?w=${s.w}&h=${s.h}&logo=0`);
    await p.waitForSelector('body[data-ready]', { timeout: 20000 });
    await p.screenshot({ path: path.join(OUT, s.name + '.png') });
    console.log('store/' + s.name + '.png');
    await ctx.close();
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
