#!/usr/bin/env node
/* Records store preview videos of real gameplay (Playwright video, scaled 2× with sharp pixels by ffmpeg).
 *   node tools/preview.js
 * Writes store/preview-landscape-1920x1080.mp4 (key art, ~16 s of a boss battle, closing card) and
 * store/preview-portrait-1080x1920.mp4 (the same battle framed inside the portrait key art; the game itself is
 * landscape only on phones).
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
    const ids = ['pip', 'shelly', 'shark_tide', 'stretch', 'flamingo_sun', 'bruno', 'ronin', 'kitsu', 'ember', 'drako'].filter((id) => __aw.AW.HERO[id]);
    while (ids.length < 10) { const h = __aw.AW.CT.HEROES[60 + ids.length * 7]; if (ids.indexOf(h.id) < 0) ids.push(h.id); }
    ids.forEach((id) => { s.heroes[id] = { lvl: 16, plus: 0, form: id === 'pip' || id === 'kitsu' ? 2 : 1 }; });
    s.lineup = ids;
    __aw.startBattle(__aw.AW.stageDef(0, region, 11), {});
    const b = __aw.battle, AW = __aw.AW, mid = b.L * 0.45;
    b.pouch.lvl = 8; b.pouch.max = 9000; b.pouch.rate = 160; b.pouch.acorns = 2500;
    // Stage the clash mid-lane (both armies live, real AI and attacks) so the video is all action.
    const ent = (side, st, x, y) => b.ents.push({ id: b.nextId++, side: side, st: st, x: x, y: y, hp: st.hp, max: st.hp, state: 'walk', t: 0, at: 0, cool: 0, hits: 0, kbi: 0, freeze: 0, slow: 0, weaken: 0, poison: 0, walkT: 0, boss: false, flash: 0, buff: 0 });
    s.lineup.forEach((id, i) => ent(0, AW.heroStats(s, id), mid - 10 - i * 11, (i * 3) % 7));
    const R0 = AW.CT.REGIONS[region], pool = R0.pool.a.concat(R0.pool.b, R0.pool.c);
    window.__foes = () => { for (let i = 0; i < 4; i++) ent(1, AW.enemyStats(pool[Math.floor(Math.random() * pool.length)], 260), mid + 30 + i * 16 + Math.random() * 20, (i * 2) % 6); };
    window.__foes(); window.__foes();
    window.__cam = () => { let f = 0; for (const e of b.ents) if (e.side === 0 && e.state !== 'dead') f = Math.max(f, e.x); window.AWRender.lookAt(f + 30); };
  }, region);
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 20000) {
    if (k % 14 === 0) await p.evaluate(() => window.__foes && window.__foes());
    await p.evaluate(() => window.__cam && window.__cam());
    // Round-robin through the whole lineup (cooldowns skipped) so every hero's own attack shows up.
    await p.evaluate((k) => { const b = __aw.battle; if (!b) return; b.pouch.acorns = b.pouch.max; const sl = b.slots[k % 10]; if (sl) { sl.cd = 0; __aw.AW.deploy(b, k % 10, []); } }, k);
    if (k % 30 === 29) await p.keyboard.press('r');
    k++;
    await p.waitForTimeout(220);
    if (Date.now() - t0 > 12000) await p.evaluate(() => { const b = __aw.battle; if (b && b.enemy.hp > b.enemy.max * 0.3) b.enemy.hp -= b.enemy.max * 0.004; });
  }
  await p.evaluate(() => { if (__aw.battle) __aw.battle.enemy.hp = 0; });
  await p.waitForTimeout(3000);
  const video = await p.video().path();
  await ctx.close();
  return video;
}

(async () => {
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  const browser = await chromium.launch();
  const port = srv.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-prev-'));
  // Key art stills for the opening and closing cards.
  const still = async (w, h, file) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:' + port + '/tools/keyart.html?w=' + w + '&h=' + h);
    await p.waitForSelector('body[data-ready]', { timeout: 20000 });
    await p.screenshot({ path: file });
    await p.close();
  };
  const landArt = path.join(tmp, 'land.png'), portArt = path.join(tmp, 'port.png');
  await still(1920, 1080, landArt); await still(1080, 1920, portArt);
  const video = await record(browser, port, 960, 540, null, 3);
  const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args));
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', '-an'];
  // Landscape: 2 s key art (zooming in slightly), the battle scaled 2× with sharp pixels, 2.5 s key art to close.
  const game = path.join(tmp, 'game.mp4');
  ff(['-ss', '2', '-i', video, '-vf', 'scale=1920:1080:flags=neighbor,fps=30', '-t', '17'].concat(enc, [game]));
  const intro = path.join(tmp, 'intro.mp4'), outro = path.join(tmp, 'outro.mp4');
  ff(['-loop', '1', '-i', landArt, '-t', '2', '-vf', "scale=2112:1188,zoompan=z='1+0.0015*on':d=60:s=1920x1080:fps=30,fade=t=out:st=1.7:d=0.3"].concat(enc, [intro]));
  ff(['-loop', '1', '-i', landArt, '-t', '2.5', '-vf', 'fps=30,fade=t=in:st=0:d=0.4'].concat(enc, [outro]));
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, [intro, game, outro].map((f) => "file '" + f + "'").join('\n'));
  const land = path.join(ROOT, 'store', 'preview-landscape-1920x1080.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', land]);
  console.log(path.relative(ROOT, land));
  // Portrait: the portrait key art, dimmed, with the battle in a framed band across the middle.
  const port1 = path.join(ROOT, 'store', 'preview-portrait-1080x1920.mp4');
  ff(['-loop', '1', '-i', portArt, '-i', land, '-filter_complex',
    "[0:v]scale=1080:1920,eq=brightness=-0.12,fps=30[bg];[1:v]scale=1080:608:flags=neighbor,pad=1092:620:6:6:color=0x1a0f12[g];[bg][g]overlay=-6:660:shortest=1",
    '-t', '21.5'].concat(enc, [port1]));
  console.log(path.relative(ROOT, port1));
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
