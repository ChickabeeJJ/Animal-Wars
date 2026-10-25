'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AW = require('../js/core.js');
const CT = AW.CT;
require('../js/sprites.js');
const SPR = globalThis.AWSprites;

const T = AW.CONFIG.tick;
// Most rule tests check exact numbers, so elements are neutral unless a test turns them on.
const EL = Object.assign({}, AW.CONFIG.element);
AW.CONFIG.element.strong = 1; AW.CONFIG.element.weak = 1;
function run(b, seconds, ev) { for (let t = 0; t < seconds; t += T) AW.step(b, T, ev || null); }
function emptyStage(extra) {
  return Object.assign({ kind: 'story', d: 0, r: 0, i: 0, key: '0-0-0', name: 'Test', region: 'Test', theme: 0, lane: 400, baseHp: 1e9, lines: [], coins: 100, gems: 20, par: 100, seed: 1 }, extra || {});
}
function spawnEnemy(b, id, x, mag) {
  const st = AW.enemyStats(id, mag || 100);
  const e = { id: b.nextId++, side: 1, st: st, x: x, y: 0, hp: st.hp, max: st.hp, state: 'walk', t: 0, at: 0, cool: 0, hits: 0, kbi: 0, kbFrom: 0, kbTo: 0, kbT: 0, freeze: 0, slow: 0, weaken: 0, poison: 0, walkT: 0, boss: false, revived: false, survived: false, burrowed: false, burrowLeft: 0, flash: 0 };
  b.ents.push(e);
  return e;
}

test('content: 150 heroes and 73 Gloom, unique ids, every species has a painter, every element is valid', () => {
  assert.equal(CT.HEROES.length, 150);
  assert.equal(CT.ENEMIES.length, 73);
  const ids = new Set(CT.HEROES.map((h) => h.id).concat(CT.ENEMIES.map((e) => e.id)));
  assert.equal(ids.size, 223);
  for (const h of CT.HEROES) {
    assert.ok(SPR.HERO_ART[h.look.sp], 'painter for ' + h.look.sp);
    assert.equal(h.names.length, 3);
    assert.ok(CT.ELEMENTS[h.el], 'element for ' + h.id);
    assert.ok(h.cost > 0 && h.cd > 0 && h.hp > 0 && h.rate >= h.fore, h.id);
    for (const k of ['strong', 'massive', 'resist']) for (const t of (h.ab[k] || [])) assert.ok(t === 'all' || CT.TRAITS[t], h.id + ' ' + t);
    if (h.unlock) assert.ok(h.unlock[0] < CT.REGIONS.length && h.unlock[1] < 12, h.id);
  }
  for (const e of CT.ENEMIES) { assert.ok(SPR.ENEMY_ART[e.look.sp], 'painter for ' + e.look.sp); assert.ok(CT.ELEMENTS[e.el], e.id); for (const t of e.traits) assert.ok(CT.TRAITS[t]); }
  for (const R of CT.REGIONS) for (const k of ['a', 'b', 'c']) for (const id of R.pool[k]) assert.ok(AW.ENEMY[id], R.id + ' ' + id);
  const byR = [0, 1, 2, 3, 4].map((r) => CT.HEROES.filter((h) => h.rarity === r).length);
  assert.deepEqual(byR, [25, 46, 38, 26, 15]);
  // Every element beats exactly two and loses to exactly two.
  for (const k in CT.ELEMENTS) {
    assert.equal(CT.ELEMENTS[k].strong.length, 2);
    assert.equal(Object.keys(CT.ELEMENTS).filter((o) => CT.ELEMENTS[o].strong.indexOf(k) >= 0).length, 2, k);
  }
});

test('elements: strong hits deal 1.5×, weak hits 0.75×, and 3+ heroes of one element get a synergy bonus', () => {
  Object.assign(AW.CONFIG.element, EL);
  assert.equal(AW.affinity('ember', 'thorn'), 1.5);
  assert.equal(AW.affinity('thorn', 'ember'), 0.75);
  assert.equal(AW.affinity('ember', 'moon'), 1);
  const s = AW.createState(0);
  const thorns = CT.HEROES.filter((h) => h.el === 'thorn').slice(0, 3).map((h) => h.id);
  thorns.forEach((id) => { s.heroes[id] = { lvl: 1, plus: 0, form: 0 }; });
  s.lineup = thorns.concat([null, null, null, null, null, null, null]);
  const b = AW.createBattle(s, emptyStage(), {});
  assert.equal(b.synergy.thorn.count, 3);
  assert.equal(b.slots[0].st.hp, Math.round(AW.heroStats(s, thorns[0]).hp * 1.1));
  AW.CONFIG.element.strong = 1; AW.CONFIG.element.weak = 1;
});

test('every one of the 864 story stages is valid and gets harder within a region', () => {
  for (let d = 0; d < 3; d++) for (let r = 0; r < CT.REGIONS.length; r++) for (let i = 0; i < 12; i++) {
    const s = AW.stageDef(d, r, i);
    assert.ok(s.baseHp > 0 && s.lane > 300 && s.coins > 0 && s.lines.length >= 1, s.key);
    for (const l of s.lines) { assert.ok(AW.ENEMY[l.e], s.key + ' ' + l.e); assert.ok(l.mag >= 1 && l.every[0] > 0, s.key); }
    if (i === 11) assert.ok(s.lines.some((l) => l.boss && l.e === CT.REGIONS[r].boss), 'boss in ' + s.key);
  }
  for (let r = 0; r < 8; r++) assert.ok(AW.stageDef(0, r, 11).coins > AW.stageDef(0, r, 0).coins);
  assert.ok(AW.stageDef(1, 0, 0).coins > AW.stageDef(0, 0, 0).coins);
  for (const f of [1, 10, 50, 120]) assert.ok(AW.towerDef(f).lines.length >= 4);
  for (const e of CT.EVENTS) for (let l = 0; l < 5; l++) assert.ok(AW.eventDef(e.id, l).rewards);
});

test('a battle replays identically from the same seed', () => {
  function play() {
    const s = AW.createState(0);
    const b = AW.createBattle(s, AW.stageDef(0, 0, 2), { seed: 7 });
    for (let t = 0; t < 90 && b.state === 'play'; t += T) { AW.step(b, T, null); AW.deploy(b, 0, null); AW.deploy(b, 1, null); }
    return [b.state, Math.round(b.t * 30), b.stats.kills, Math.round(b.enemy.hp), Math.round(b.ally.hp)].join();
  }
  assert.equal(play(), play());
});

test('deploying costs acorns and starts the cooldown; the pouch levels up', () => {
  const s = AW.createState(0);
  const b = AW.createBattle(s, emptyStage(), {});
  assert.equal(AW.deploy(b, 0), false, 'no acorns yet');
  b.pouch.acorns = 200;
  assert.equal(AW.deploy(b, 0), true);
  assert.equal(b.pouch.acorns, 200 - AW.HERO.pip.cost);
  assert.equal(AW.deploy(b, 0), false, 'cooling down');
  run(b, AW.HERO.pip.cd + 0.1);
  assert.equal(AW.canDeploy(b, 0), true);
  b.pouch.acorns = AW.pouchCost(1);
  const r1 = b.pouch.rate, m1 = b.pouch.max;
  assert.equal(AW.upgradePouch(b), true);
  assert.equal(b.pouch.lvl, 2);
  assert.ok(b.pouch.rate > r1 && b.pouch.max > m1);
  assert.equal(AW.roar(b), false, 'roar needs charge');
  b.roar.charge = 1;
  assert.equal(AW.roar(b), true);
});

test('Battle Cry buffs every hero on the field: more damage, faster, tougher, then wears off', () => {
  const s = AW.createState(0);
  function duel(cry) {
    const b = AW.createBattle(s, emptyStage(), {});
    b.pouch.acorns = 1000;
    AW.deploy(b, 0);
    const hero = b.ents[0];
    run(b, 1);
    const x1 = hero.x;
    const foe = spawnEnemy(b, 'gloop', hero.x + 30, 100000);
    foe.st.atk = 3; foe.st.kb = 1;
    if (cry) { b.roar.charge = 1; assert.equal(AW.roar(b), true); assert.ok(hero.buff > 0, 'hero glows'); }
    run(b, 4);
    return { hero, foe, b, x1 };
  }
  const plain = duel(false), cried = duel(true);
  assert.ok(plain.foe.max - plain.foe.hp < cried.foe.max - cried.foe.hp, 'buffed hero deals more damage');
  assert.ok(cried.hero.max - cried.hero.hp < plain.hero.max - plain.hero.hp, 'buffed hero takes less damage');
  run(cried.b, AW.CONFIG.roar.time);
  assert.ok(cried.hero.buff <= 0 && cried.b.roar.left === 0, 'the cry wears off');
  // Heroes deployed after the cry are not buffed.
  const b = AW.createBattle(s, emptyStage(), {});
  b.roar.charge = 1; AW.roar(b);
  b.pouch.acorns = 1000; AW.deploy(b, 0);
  assert.ok(!(b.ents[0].buff > 0));
});

test('Armored takes 10% unless the hit is critical or the hero is strong against it', () => {
  const s = AW.createState(0);
  s.heroes.ronin = { lvl: 1, plus: 0, form: 0 };
  const b = AW.createBattle(s, emptyStage(), {});
  const pip = AW.heroStats(s, 'pip');
  const e = spawnEnemy(b, 'ironslab', 100, 1000);
  const hp0 = e.hp;
  pip.ab = {};
  const strike = (st) => { const before = e.hp; e.state = 'walk'; b.rng = () => 0.99; strikeVia(b, st, e, []); return before - e.hp; };
  const d1 = strike(pip);
  assert.equal(d1, Math.max(1, Math.round(pip.atk * 0.1)));
  const ronin = AW.heroStats(s, 'ronin');
  const d2 = strike(Object.assign({}, ronin, { ab: { massive: ['armored'] } }));
  assert.equal(d2, ronin.atk * 3);
  assert.ok(hp0 > e.hp);
});
// Drives a single hero attack through the real simulation: a hero standing next to the target attacks once.
function strikeVia(b, st, target, ev) {
  const a = { id: b.nextId++, side: 0, st: Object.assign({}, st, { fore: 0.01, rate: 99, rng: 50, area: false }), x: target.x - 10, y: 0, hp: 1e9, max: 1e9, state: 'atk', t: 0, at: 0, cool: 99, hits: 0, kbi: 0, freeze: 0, slow: 0, weaken: 0, poison: 0, walkT: 0, flash: 0 };
  b.ents.push(a);
  const saved = target.st.atk; target.st.atk = 0; target.freeze = 1;
  AW.step(b, T, ev);
  target.st.atk = saved; target.freeze = 0;
  b.ents.splice(b.ents.indexOf(a), 1);
}

test('Cosmic takes half damage, Spooky dodges, Undead get back up unless slain by a Zombie Slayer', () => {
  const s = AW.createState(0);
  const b = AW.createBattle(s, emptyStage(), {});
  const pip = Object.assign(AW.heroStats(s, 'pip'), { atk: 100, ab: {} });
  const z = spawnEnemy(b, 'zorp', 100, 100);
  let before = z.hp; strikeVia(b, pip, z, []); assert.equal(before - z.hp, 50);
  const boo = spawnEnemy(b, 'boo', 200, 100);
  b.rng = () => 0.1; before = boo.hp; const ev = []; strikeVia(b, pip, boo, ev);
  assert.equal(boo.hp, before, 'dodged'); assert.ok(ev.some((e) => e.t === 'miss'));
  const bones = spawnEnemy(b, 'cinder', 300, 1);
  b.rng = () => 0.9;
  strikeVia(b, Object.assign({}, pip, { atk: 1e6 }), bones, []);
  assert.equal(bones.state, 'down');
  bones.freeze = 0;
  run(b, 2.2);
  assert.ok(bones.state !== 'dead' && bones.hp > 0 && bones.revived, 'got back up');
  const bones2 = spawnEnemy(b, 'cinder', 360, 1);
  strikeVia(b, Object.assign({}, pip, { atk: 1e6, ab: { zkill: true } }), bones2, []);
  assert.equal(bones2.state, 'dead');
});

test('health-bar knockbacks fire at each threshold', () => {
  const s = AW.createState(0);
  const b = AW.createBattle(s, emptyStage(), {});
  const g = spawnEnemy(b, 'grumbo', 200, 100);   // kb 2: one knockback at half health
  const pip = Object.assign(AW.heroStats(s, 'pip'), { ab: {} });
  b.rng = () => 0.9;
  strikeVia(b, Object.assign({}, pip, { atk: g.max * 0.4 }), g, []);
  assert.notEqual(g.state, 'kb');
  const ev = [];
  strikeVia(b, Object.assign({}, pip, { atk: g.max * 0.2 }), g, ev);
  assert.ok(ev.some((e) => e.t === 'kb'), 'knocked back at 50%');
});

test('winning a story stage: first clear gems once, stars accumulate, starters unlock, regions open', () => {
  const s = AW.createState(0);
  const def = AW.stageDef(0, 0, 1);
  s.clear[0][0] = 1;
  const b = AW.createBattle(s, def, {});
  b.state = 'won'; b.t = 10; b.ally.hp = b.ally.max;
  const res = AW.finishBattle(s, b, () => 0.99);
  assert.equal(res.first, true);
  assert.equal(res.gems, def.gems);
  assert.equal(s.clear[0][0], 2);
  assert.deepEqual(res.unlocked, ['spike']);
  assert.ok(s.lineup.indexOf('spike') >= 0);
  assert.equal(s.stars[def.key], 7);
  const b2 = AW.createBattle(s, def, {});
  b2.state = 'won'; b2.t = 9999; b2.ally.hp = 1;
  const res2 = AW.finishBattle(s, b2, () => 0.99);
  assert.equal(res2.first, false); assert.equal(res2.gems, 0);
  assert.equal(s.stars[def.key], 7, 'stars never go down');
  s.clear[0][0] = 12;
  assert.ok(AW.regionOpen(s, 0, 1) && AW.regionOpen(s, 1, 0) && !AW.regionOpen(s, 2, 0));
});

test('losing pays a share of coins for tower damage only', () => {
  const s = AW.createState(0);
  const def = AW.stageDef(0, 0, 0);
  const b = AW.createBattle(s, def, {});
  b.state = 'lost'; b.stats.dmg = def.baseHp / 2;
  const res = AW.finishBattle(s, b);
  assert.equal(res.won, false);
  assert.ok(res.coins > 0 && res.coins < def.coins);
  assert.equal(s.clear[0][0], 0);
});

test('hatchery: tickets before gems, ×10 always has an Epic, pity guarantees a Mythic', () => {
  const s = AW.createState(0);
  assert.equal(AW.hatch(s, 'royal', 1, Math.random, 0), null, 'cannot afford');
  s.gems = 900;
  let res = AW.hatch(s, 'royal', 10, () => 0.5, 0);
  assert.equal(res.length, 10);
  assert.equal(s.gems, 0);
  assert.ok(res.some((r) => r.rarity >= 2));
  s.tickets.gold = 1; s.gems = 100;
  AW.hatch(s, 'royal', 1, Math.random, 0);
  assert.equal(s.tickets.gold, 0); assert.equal(s.gems, 100);
  // Pity: never roll a Mythic naturally.
  const p = AW.createState(0);
  p.gems = 1e9;
  let mythicAt = -1;
  for (let k = 0; k < 60 && mythicAt < 0; k++) { const r = AW.hatch(p, 'royal', 1, () => 0.999, 0); if (r[0].rarity >= 3) mythicAt = k + 1; }
  assert.equal(mythicAt, AW.BANNER.royal.pity.mythic);
  // Duplicates add plus levels.
  const d = AW.createState(0);
  AW.grantHero(d, 'pip');
  assert.equal(d.heroes.pip.plus, 1);
});

test('hatch rates match the published odds', () => {
  const s = AW.createState(0);
  s.gacha.sinceMythic = -1e9; s.gacha.sinceLegend = -1e9;  // switch pity off for the count
  s.tickets.silver = 0; s.gems = 1e12;
  const rng = AW.mulberry32(42);
  const n = 20000, count = [0, 0, 0, 0, 0];
  for (let k = 0; k < n; k++) { s.gacha.sinceMythic = 0; s.gacha.sinceLegend = 0; count[AW.hatch(s, 'royal', 1, rng, 3)[0].rarity]++; }
  const rates = AW.BANNER.royal.rates;
  for (let r = 1; r <= 4; r++) assert.ok(Math.abs(count[r] / n * 100 - rates[r]) < 1.2, 'rarity ' + r + ' ' + count[r] / n);
});

test('welcome hatch is free once after stage 3, with an Epic', () => {
  const s = AW.createState(0);
  assert.equal(AW.claimWelcome(s, Math.random, 0), null);
  s.clear[0][0] = 3;
  const res = AW.claimWelcome(s, () => 0.1, 0);
  assert.equal(res.length, 10); assert.ok(res.some((r) => r.rarity >= 2));
  assert.equal(AW.claimWelcome(s, Math.random, 0), null);
});

test('levels, evolution and the lab spend exactly what they quote', () => {
  const s = AW.createState(0);
  s.coins = 1e7;
  const c = AW.levelCost('pip', 1);
  assert.equal(AW.levelUp(s, 'pip'), true);
  assert.equal(s.coins, 1e7 - c);
  assert.equal(AW.evolve(s, 'pip'), false, 'needs level 10');
  s.heroes.pip.lvl = 10;
  const st0 = AW.heroStats(s, 'pip');
  assert.equal(AW.evolve(s, 'pip'), true);
  assert.ok(AW.heroStats(s, 'pip').hp > st0.hp);
  s.heroes.pip.lvl = 20;
  assert.equal(AW.evolve(s, 'pip'), false, 'needs seeds');
  s.seeds = 5;
  assert.equal(AW.evolve(s, 'pip'), true);
  assert.equal(s.heroes.pip.form, 2);
  const lc = AW.labCost('train', 0), before = s.coins;
  assert.equal(AW.buyLab(s, 'train'), true);
  assert.equal(before - s.coins, lc);
  s.coins = 1e15;
  for (let i = 0; i < 40; i++) AW.buyLab(s, 'train');
  assert.equal(s.lab.train, AW.LABS.train.max);
});

test('dailies: one login a day, missions track progress from the morning, the farm caps at 8 hours', () => {
  const s = AW.createState(0);
  const day = new Date(2026, 9, 24, 10).getTime();
  AW.ensureDaily(s, day);
  assert.equal(s.daily.missions.length, 4);
  assert.ok(AW.claimLogin(s, day, Math.random));
  assert.equal(AW.claimLogin(s, day + 3600000, Math.random), null);
  assert.ok(AW.claimLogin(s, day + 86400000, Math.random));
  const m = s.daily.missions[0], def = CT.MISSIONS.find((x) => x.id === m.id);
  assert.equal(AW.claimMission(s, 0), 0);
  s.stats[def.stat] += def.n;
  assert.equal(AW.claimMission(s, 0), def.gems);
  assert.equal(AW.claimMission(s, 0), 0);
  s.farm.since = day;
  const p = AW.farmPending(s, day + 20 * 3600000);
  assert.equal(p.hours, 8);
  assert.equal(AW.claimFarm(s, day + 20 * 3600000), Math.floor(AW.farmRate(s) * 8));
});

test('saves survive garbage and keep progress in order', () => {
  for (const junk of [null, 1, 'x', [], { coins: 'lots' }, { coins: -5, heroes: { pip: { lvl: 999 } }, lineup: ['nope', 'pip', 'pip'] }]) {
    const { state } = AW.sanitize(junk, 1000);
    assert.ok(Number.isFinite(state.coins) && state.coins >= 0);
    assert.ok(state.heroes.pip.lvl <= AW.CONFIG.maxLevel);
    assert.ok(state.lineup.filter(Boolean).length >= 1);
    assert.equal(new Set(state.lineup.filter(Boolean)).size, state.lineup.filter(Boolean).length);
  }
  const { state } = AW.sanitize({ clear: [[4, 5, 0, 0, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0, 0, 0]] }, 0);
  assert.equal(state.clear[0][1], 0, 'region 2 needs region 1');
  assert.equal(state.clear[1][0], 0, 'hard needs normal');
  assert.ok(state.heroes.spike && state.heroes.stretch, 'starters repaired from progress');
  const s = AW.createState(5); s.coins = 42; s.heroes.bamboo = { lvl: 7, plus: 2, form: 0 };
  const back = AW.parseSave(AW.serialize(s), 0);
  assert.equal(back.state.coins, 42); assert.equal(back.state.heroes.bamboo.plus, 2);
  assert.equal(AW.parseSave('{oops', 0).broken, true);
});

test('medals pay once per tier', () => {
  const s = AW.createState(0);
  s.stats.kills = 150;
  const g = AW.claimMedal(s, 'kills');
  assert.equal(g, 20);
  assert.equal(AW.claimMedal(s, 'kills'), 0);
});

test('the scripted player clears Clover Meadow without getting stuck', () => {
  const { run } = require('../tools/sim.js');
  const res = run({ regions: 1, seed: 3 });
  assert.ok(!res.stuck, res.log.join('\n'));
  assert.equal(res.state.clear[0][0], 12);
});

test('the Elemental Nest hatches the day\'s element and rotates daily', () => {
  const els = new Set();
  for (let d = 0; d < 10; d++) els.add(AW.dayElement(d));
  assert.equal(els.size, 10, 'every element gets a day');
  const day = 3, el = AW.dayElement(day);
  const s = AW.createState(0); s.gems = 100000;
  let rng = 0.123;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280 / 233280; return rng; };
  const out = [];
  for (let k = 0; k < 10; k++) out.push(...AW.hatch(s, 'element', 10, rand, day));
  for (const r of out) {
    const has = AW.CT.HEROES.some((h) => h.rarity === r.rarity && h.el === el);
    if (has) assert.equal(AW.HERO[r.id].el, el, r.id + ' is not ' + el);
  }
  assert.ok(out.length === 100 && s.gems === 100000 - 720 * 10);
  const pool = AW.bannerPool('element', day);
  assert.ok(pool.every((id) => AW.HERO[id].rarity >= 1));
});

test('every hero and Gloom has its own attack style (motion + effect), ranged ones a projectile', () => {
  const FX = require('../js/fx.js');
  const S = FX.build(AW.CT);
  const all = Object.keys(S.hero).map((k) => S.hero[k]).concat(Object.keys(S.enemy).map((k) => S.enemy[k]));
  assert.equal(all.length, AW.CT.HEROES.length + AW.CT.ENEMIES.length);
  assert.equal(new Set(all.map((s) => s.motion + '+' + s.fx)).size, all.length, 'no two units share an attack');
  for (const h of AW.CT.HEROES) if (h.rng >= 50) assert.ok(S.hero[h.id].proj, h.id + ' fires something');
});

test('hero value per acorn is even within a rarity (no outliers), with a small premium for rarer heroes', () => {
  const V = (h) => h.hp * h.atk / h.rate / (h.cost * h.cost) * (h.area ? 1.4 : 1) * (1 + h.rng / 120);
  for (let r = 1; r <= 4; r++) {
    const vs = AW.CT.HEROES.filter((h) => h.rarity === r).map(V);
    assert.ok(Math.max.apply(null, vs) / Math.min.apply(null, vs) < 1.35, 'rarity ' + r + ' spread');
  }
});
