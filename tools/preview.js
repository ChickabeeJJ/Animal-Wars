#!/usr/bin/env node
/* Records store preview videos of real gameplay (Playwright video, scaled 2× with sharp pixels by ffmpeg).
 *   node tools/preview.js
 * Writes store/preview-landscape-1920x1080.mp4 (the game is landscape only on phones, so there is no portrait video).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Install it with: npm i -D playwright');
}
const { chromium } = loadPlaywright();
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

async function record(browser, port, w, h, out, region) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-video-'));
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: dir, size: { width: w, height: h } } });
  await ctx.route('**/sdk.crazygames.com/**', (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto('http://localhost:' + port + '/index.html');
  await p.waitForTimeout(300);
  await p.evaluate((region) => {
    const s = __aw.state;
    s.clear[0][0] = 12; s.flags.tutDone = true; s.flags.tutRoar = true; s.settings.speed = 1;
    const ids = ['pip', 'shelly', 'spike', 'stretch', 'bamboo', 'bruno', 'ronin', 'kitsu', 'ember', 'drako'];
    ids.forEach((id) => { s.heroes[id] = { lvl: 22, plus: 0, form: id === 'pip' || id === 'kitsu' ? 2 : 1 }; });
    s.lineup = ids;
    __aw.startBattle(__aw.AW.stageDef(0, region, 11), {});
    __aw.battle.pouch.lvl = 8; __aw.battle.pouch.max = 9000; __aw.battle.pouch.rate = 160; __aw.battle.pouch.acorns = 2500;
  }, region);
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 17000) {
    await p.keyboard.press('1234567890'[k % 10]);
    if (k % 25 === 24) await p.keyboard.press('r');
    k++;
    await p.waitForTimeout(220);
    if (Date.now() - t0 > 6000) await p.evaluate(() => { const b = __aw.battle; if (b && b.enemy.hp > b.enemy.max * 0.3) b.enemy.hp -= b.enemy.max * 0.004; });
  }
  await p.evaluate(() => { if (__aw.battle) __aw.battle.enemy.hp = 0; });
  await p.waitForTimeout(3000);
  const video = await p.video().path();
  await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', 'scale=' + w * 2 + ':' + h * 2 + ':flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-an', out]);
  console.log(path.relative(ROOT, out));
}

(async () => {
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  const browser = await chromium.launch();
  await record(browser, srv.address().port, 960, 540, path.join(ROOT, 'store', 'preview-landscape-1920x1080.mp4'), 0);
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
