#!/usr/bin/env node
/* Browser QA for Animal Wars (Playwright + Chromium).
 *   node tests/browser.qa.js [screenshotDir]
 * Serves the game folder (or QA_ROOT=dist), runs each check, prints PASS/FAIL, exits non-zero on failure.
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

const ROOT = path.resolve(__dirname, '..', process.env.QA_ROOT || '.');
const SHOTS = process.argv[2] || null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('PASS', name); }
  catch (e) { results.push([false, name, e.message]); console.log('FAIL', name, '—', e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

(async () => {
  const srv = await serve();
  const URL = 'http://localhost:' + srv.address().port + '/index.html';
  const browser = await chromium.launch();
  const errors = [];

  async function page(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
    await ctx.route('**/sdk.crazygames.com/**', (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    return p;
  }
  const S = (p, fn, arg) => p.evaluate(fn, arg);
  async function shot(p, name) { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }); }

  let p = await page();
  await p.goto(URL);
  await p.waitForTimeout(500);

  await check('a new player starts straight in battle 1-1 with the tutorial pointer', async () => {
    assert(await S(p, () => __aw.mode) === 'battle', 'mode');
    assert(await S(p, () => __aw.battle.def.key) === '0-0-0', 'stage');
    assert(await p.isVisible('#tut'), 'tutorial pointer');
    assert(/Pip/.test(await p.textContent('#tut-text')));
    await shot(p, 'first-battle');
  });

  await check('deploying a hero spends acorns and the pointer moves on', async () => {
    await S(p, () => { __aw.battle.pouch.acorns = 200; });
    await p.click('#cards .card >> nth=0');
    const st = await S(p, () => ({ a: __aw.battle.pouch.acorns, n: __aw.battle.ents.filter((e) => e.side === 0).length }));
    assert(st.n === 1, 'one hero on the field, got ' + st.n);
    assert(st.a < 200, 'acorns spent');
    await p.waitForTimeout(100);
    assert(await p.isHidden('#tut'), 'pointer hidden after deploying');
  });

  await check('keys deploy, speed and pause; pausing stops the clock', async () => {
    await S(p, () => { __aw.battle.pouch.acorns = 500; __aw.battle.slots[1].cd = 0; });
    await p.keyboard.press('2');
    assert(await S(p, () => __aw.battle.ents.filter((e) => e.side === 0).length) === 2, 'key 2 deploys Shelly');
    await p.keyboard.press('f');
    assert(await S(p, () => __aw.state.settings.speed) === 2, 'speed ×2');
    await p.keyboard.press('f');
    await p.keyboard.press('p');
    assert(await p.isVisible('#modal'), 'pause menu');
    const t0 = await S(p, () => __aw.battle.t);
    await p.waitForTimeout(400);
    assert(await S(p, () => __aw.battle.t) === t0, 'clock stopped');
    await p.click('#modal-actions .btn:has-text("Resume")');
    await p.waitForTimeout(300);
    assert(await S(p, () => __aw.battle.t) > t0, 'clock resumed');
  });

  await check('winning shows Victory with stars and saves progress', async () => {
    await S(p, () => { __aw.battle.enemy.hp = 0; });
    await p.waitForSelector('.result-title', { timeout: 4000 });
    assert(/Victory/.test(await p.textContent('.result-title')));
    assert((await p.locator('.rstars img').count()) === 3, 'three star slots');
    const st = await S(p, () => ({ c: __aw.state.clear[0][0], gems: __aw.state.gems, saved: !!localStorage.getItem('animal-wars-save-v1') }));
    assert(st.c === 1 && st.gems >= 20 && st.saved, JSON.stringify(st));
    await shot(p, 'victory');
  });

  await check('Next opens stage 1-2, and home shows the next stage', async () => {
    await p.click('#modal-actions .btn:has-text("Next")');
    await p.waitForTimeout(400);
    assert(/1-2/.test(await p.textContent('#modal-title')), 'stage 1-2 card');
    await p.click('#modal-x');
    await S(p, () => __aw.enterHome());
    await p.waitForTimeout(300);
    if (await p.isVisible('#modal')) await p.click('#modal-actions .btn >> nth=0');
    assert(/1-2/.test(await p.textContent('#next-stage')));
    await shot(p, 'home');
  });

  await check('progress survives a reload', async () => {
    await S(p, () => __aw.save());
    await p.reload();
    await p.waitForTimeout(900);
    // The daily login card pops up on arrival; claim it.
    if (await p.isVisible('#modal')) await p.click('#modal-actions .btn >> nth=-1');
    assert(await S(p, () => __aw.mode) === 'home', 'returning players land at home');
    assert(await S(p, () => __aw.state.clear[0][0]) === 1);
  });

  await check('every menu panel opens without errors', async () => {
    await S(p, () => { const s = __aw.state; s.clear[0][0] = 12; s.clear[0][1] = 2; s.gems = 5000; s.coins = 1e6; s.tickets.silver = 2; __aw.AW.unlockStoryHeroes(s); });
    for (const name of ['map', 'hatch', 'army', 'lab', 'rewards', 'events', 'tower', 'medals', 'book']) {
      await S(p, (n) => __aw.openPanel(n), name);
      await p.waitForTimeout(80);
      assert(await p.isVisible('#panel'), name);
      assert((await p.textContent('#panel-body')).length > 20, name + ' has content');
    }
    await shot(p, 'book');
  });

  await check('hatching ×10 spends 900 gems, shows the eggs and adds heroes', async () => {
    await S(p, () => __aw.openPanel('hatch'));
    const before = await S(p, () => ({ g: __aw.state.gems, n: Object.keys(__aw.state.heroes).length, pulls: __aw.state.gacha.pulls }));
    await p.click('[data-hatch="royal"][data-n="10"]');
    await p.waitForSelector('#hatchery:not([hidden])');
    await p.click('#h-next');
    await p.waitForTimeout(600);
    await shot(p, 'hatch-reveal');
    await p.click('#h-skip');
    await p.waitForTimeout(100);
    assert((await p.locator('.sum .hero').count()) === 10, 'summary of 10');
    await p.click('#h-next');
    const after = await S(p, () => ({ g: __aw.state.gems, n: Object.keys(__aw.state.heroes).length, pulls: __aw.state.gacha.pulls }));
    assert(before.g - after.g === 900, 'spent ' + (before.g - after.g));
    assert(after.pulls - before.pulls === 10 && after.n > before.n, JSON.stringify(after));
    assert(await p.isHidden('#hatchery'));
  });

  await check('levelling a hero and buying a Lab upgrade spend the quoted coins', async () => {
    await S(p, () => __aw.openPanel('army'));
    await S(p, () => __aw.openHero('pip'));
    const c0 = await S(p, () => ({ c: __aw.state.coins, cost: __aw.AW.levelCost('pip', __aw.state.heroes.pip.lvl), l: __aw.state.heroes.pip.lvl }));
    await p.click('#modal-actions .btn:has-text("Level up")');
    const c1 = await S(p, () => ({ c: __aw.state.coins, l: __aw.state.heroes.pip.lvl }));
    assert(c1.l === c0.l + 1 && c0.c - c1.c === c0.cost, JSON.stringify([c0, c1]));
    await p.click('#modal-x');
    await S(p, () => __aw.openPanel('lab'));
    const l0 = await S(p, () => ({ c: __aw.state.coins, cost: __aw.AW.labCost('train', __aw.state.lab.train) }));
    await p.click('[data-lab="train"]');
    const l1 = await S(p, () => ({ c: __aw.state.coins, lv: __aw.state.lab.train }));
    assert(l1.lv === 1 && l0.c - l1.c === l0.cost);
  });

  await check('a story battle with a boss runs to a result', async () => {
    await S(p, () => { __aw.startBattle(__aw.AW.stageDef(0, 0, 11), {}); });
    await S(p, () => { __aw.battle.enemy.hp = __aw.battle.enemy.max * 0.9; });
    await p.waitForTimeout(800);
    await S(p, () => { __aw.battle.enemy.hp = 0; });
    await p.waitForSelector('.result-title', { timeout: 4000 });
    assert(await S(p, () => __aw.state.clear[0][0]) === 12);
  });

  await check('event and tower battles pay their rewards and use entries', async () => {
    await S(p, () => { __aw.state.clear[0][1] = 12; __aw.state.clear[0][2] = 2; __aw.AW.ensureDaily(__aw.state, Date.now()); });
    const e0 = await S(p, () => ({ left: __aw.AW.eventEntriesLeft(__aw.state, 'coins'), coins: __aw.state.coins }));
    await S(p, () => __aw.startBattle(__aw.AW.eventDef('coins', 0), {}));
    await S(p, () => { __aw.battle.enemy.hp = 0; });
    await p.waitForSelector('.result-title', { timeout: 4000 });
    const e1 = await S(p, () => ({ left: __aw.AW.eventEntriesLeft(__aw.state, 'coins'), coins: __aw.state.coins }));
    assert(e1.left === e0.left - 1 && e1.coins > e0.coins, JSON.stringify([e0, e1]));
    await p.click('#modal-actions .btn:has-text("Home")');
    await S(p, () => __aw.startBattle(__aw.AW.towerDef(__aw.state.tower + 1), {}));
    await S(p, () => { __aw.battle.enemy.hp = 0; });
    await p.waitForSelector('.result-title', { timeout: 4000 });
    assert(await S(p, () => __aw.state.tower) === 1, 'tower floor 1 cleared');
  });

  await p.close();

  for (const vp of [{ name: 'phone portrait', w: 390, h: 844 }, { name: 'phone landscape', w: 844, h: 390 }, { name: '1920x1080', w: 1920, h: 1080 }]) {
    await check(vp.name + ': battle dock and cards fit and work', async () => {
      const q = await page({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.w < 1000 });
      await q.goto(URL);
      await q.waitForTimeout(500);
      const box = await q.locator('#dock').boundingBox();
      assert(box && box.y >= 0 && box.y + box.height <= vp.h + 1, 'dock on screen');
      const card = await q.locator('#cards .card >> nth=0').boundingBox();
      assert(card.width >= 40 && card.height >= 30, 'card big enough to tap');
      await S(q, () => { __aw.battle.pouch.acorns = 200; });
      if (vp.w < 1000) await q.tap('#cards .card >> nth=0'); else await q.click('#cards .card >> nth=0');
      assert(await S(q, () => __aw.battle.ents.filter((e) => e.side === 0).length) === 1, 'deploy by tap');
      const cv = await q.locator('#cv').boundingBox();
      assert(cv.width >= vp.w - 8, 'canvas fills the width');
      await shot(q, 'vp-' + vp.w + 'x' + vp.h);
      await q.close();
    });
  }

  await check('no console or page errors', async () => { assert(errors.length === 0, errors.slice(0, 5).join(' | ')); });

  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r[0]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
