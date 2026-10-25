#!/usr/bin/env node
/* Records the store trailers from real gameplay: a fast montage of hard cuts (no fades) across lands, chapters,
 * bosses and a Legend hatch, recorded at 1920×1080 with the interface drawn smaller, then given extra vibrance.
 *   node tools/preview.js
 * Writes store/preview-landscape-1920x1080.mp4 and store/preview-portrait-1080x1920.mp4 (the same montage framed
 * inside the portrait key art; the game itself is landscape only on phones).
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const W = 1920, H = 1080;

// Shots: [land, stage, chapter-flavoured lineup offset, seconds to keep]. Stage 11 brings a boss.
const SHOTS = [[0, 6, 0, 3.2], [3, 11, 7, 3.2], [9, 5, 23, 3], [14, 11, 41, 3.2], [21, 8, 59, 3], [23, 11, 77, 3.4]];

async function main() {
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  const port = srv.address().port;
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-trailer-'));
  const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args));
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-r', '30', '-an'];
  const grade = 'vibrance=intensity=0.45,eq=saturation=1.12:contrast=1.06';

  // Portrait key art (with the logo) for the portrait frame and the last beat of both videos.
  const still = async (w, h, file) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:' + port + '/tools/keyart.html?w=' + w + '&h=' + h);
    await p.waitForSelector('body[data-ready]', { timeout: 20000 });
    await p.screenshot({ path: file });
    await p.close();
  };
  const landArt = path.join(tmp, 'land.png'), portArt = path.join(tmp, 'port.png');
  await still(W, H, landArt); await still(1080, 1920, portArt);

  // One recording session; every shot logs when it starts so the montage can cut straight to the action.
  const dir = fs.mkdtempSync(path.join(tmp, 'v-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: dir, size: { width: W, height: H } } });
  await ctx.route('**/sdk.crazygames.com/**', (r) => r.abort());
  const v0 = Date.now();
  const p = await ctx.newPage();
  await p.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'trailer-z'; st.textContent = ':root{--ui-z:.72 !important}'; document.head.appendChild(st); }); });
  await p.goto('http://localhost:' + port + '/index.html');
  await p.waitForTimeout(800);
  const cuts = [];
  for (const [region, stage, off, keep] of SHOTS) {
    await p.evaluate(([region, stage, off]) => {
      const g = __aw, AW = g.AW, s = g.state;
      s.flags.tutDone = true; s.flags.tutRoar = true; s.settings.speed = 2;
      const ids = AW.CT.HEROES.filter((h) => h.rarity >= 1).slice(off % 100, off % 100 + 10).map((h) => h.id);
      ids.forEach((id, i) => { s.heroes[id] = { lvl: 18, plus: 0, form: i % 3 === 0 ? 2 : 1 }; });
      s.lineup = ids;
      document.getElementById('modal').hidden = true;
      g.startBattle(AW.stageDef(0, region, stage), {});
      const b = g.battle, mid = b.L * 0.45;
      b.pouch.lvl = 8; b.pouch.max = 9000; b.pouch.acorns = 9000;
      document.getElementById('callout') && document.getElementById('callout').classList.remove('show');
      const ent = (side, st, x, y) => b.ents.push({ id: b.nextId++, side: side, st: st, x: x, y: y, hp: st.hp, max: st.hp, state: 'walk', t: 0, at: 0, cool: 0, hits: 0, kbi: 0, freeze: 0, slow: 0, weaken: 0, poison: 0, walkT: 0, boss: false, flash: 0, buff: 0 });
      s.lineup.forEach((id, i) => ent(0, AW.heroStats(s, id), mid - 6 - i * 10, (i * 3) % 7));
      const R0 = AW.CT.REGIONS[region], pool = R0.pool.a.concat(R0.pool.b, R0.pool.c);
      for (let i = 0; i < 7; i++) ent(1, AW.enemyStats(pool[i % pool.length], 300), mid + 24 + i * 13, (i * 2) % 6);
      if (stage === 11) { const bs = AW.enemyStats(R0.boss, 400); ent(1, bs, mid + 70, 0); b.ents[b.ents.length - 1].boss = true; }
      window.__beat = () => {
        b.pouch.acorns = b.pouch.max;
        for (let i = 0; i < 10; i++) if (b.slots[i] && Math.random() < 0.35) { b.slots[i].cd = 0; AW.deploy(b, i, []); }
        let f = 0; for (const e of b.ents) if (e.side === 0 && e.state !== 'dead') f = Math.max(f, e.x);
        window.AWRender.lookAt(f + 40);
        if (AW.canRoar(b) && Math.random() < 0.2) AW.roar(b, []);
      };
    }, [region, stage, off]);
    const start = (Date.now() - v0) / 1000;
    const t = Date.now();
    while (Date.now() - t < (keep + 0.9) * 1000) { await p.evaluate(() => window.__beat && window.__beat()); await p.waitForTimeout(180); }
    cuts.push([start + 0.9, keep]);
  }
  // A Legend hatch: the egg, three quick taps, the reveal.
  await p.evaluate(() => {
    const g = __aw; g.enterHome(); document.getElementById('modal').hidden = true;
    document.getElementById('trailer-z').textContent = ':root{--ui-z:1.35 !important}';
    const L = g.AW.CT.HEROES.filter((h) => h.rarity === 4)[3].id;
    g.showHatch([{ id: L, rarity: 4, isNew: true }], null, 'royal');
  });
  const hs = (Date.now() - v0) / 1000;
  await p.waitForTimeout(650);
  for (let i = 0; i < 3; i++) { await p.click('#h-next'); await p.waitForTimeout(260); }
  await p.waitForTimeout(1500);
  cuts.push([hs + 0.2, 3.2]);
  const video = await p.video().path();
  await ctx.close();

  // Montage: hard cuts, graded, then a short key-art beat.
  const parts = [];
  cuts.forEach(([ss, d], i) => {
    const out = path.join(tmp, 'c' + i + '.mp4');
    ff(['-ss', ss.toFixed(2), '-i', video, '-t', String(d), '-vf', 'scale=' + W + ':' + H + ',fps=30,' + grade].concat(enc, [out]));
    parts.push(out);
  });
  const end = path.join(tmp, 'end.mp4');
  ff(['-loop', '1', '-i', landArt, '-t', '1.6', '-vf', 'fps=30,' + grade].concat(enc, [end]));
  parts.push(end);
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, parts.map((f) => "file '" + f + "'").join('\n'));
  const land = path.join(ROOT, 'store', 'preview-landscape-1920x1080.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list].concat(enc, [land]));
  console.log(path.relative(ROOT, land));
  // Portrait: the portrait key art with the montage in a framed band across the middle.
  const port1 = path.join(ROOT, 'store', 'preview-portrait-1080x1920.mp4');
  ff(['-loop', '1', '-i', portArt, '-i', land, '-filter_complex',
    '[0:v]scale=1080:1920,eq=brightness=-0.1,fps=30[bg];[1:v]scale=1080:608,pad=1092:620:6:6:color=0x1a0f12[g];[bg][g]overlay=-6:660:shortest=1'].concat(enc, [port1]));
  console.log(path.relative(ROOT, port1));
  await browser.close();
  srv.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
