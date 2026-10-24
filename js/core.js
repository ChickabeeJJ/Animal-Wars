/* Animal Wars — rules and balance.
 * Saves, hero stats, the stage generator, the lane battle simulation, the hatchery and daily systems.
 * No DOM: runs in Node (tests, tools/sim.js) and in the browser.
 */
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports;
  const CT = NODE ? require('./content.js') : root.AW_CONTENT;
  // Per-stage multipliers written by tools/tune.js (enemy strength and tower health). Missing = 1.
  let TUNE = null;
  try { TUNE = NODE ? require('./tune.js') : root.AW_TUNE; } catch (e) { TUNE = null; }
  function tuned(kind, d, r, i) { return (TUNE && TUNE[kind] && TUNE[kind][d] && TUNE[kind][d][r] && TUNE[kind][d][r][i]) || 1; }

  const CONFIG = {
    tick: 1 / 30,
    saveVersion: 1,
    maxLevel: 30,
    maxPlus: 20,
    levelBase: [80, 120, 200, 320, 500],      // coins for level 1 -> 2, by rarity
    levelGrowth: 1.18,
    formMult: [1, 1.12, 1.3],
    evolve: [                                  // [coins, seeds, fruit] for form 2 and form 3, by rarity
      [[1500, 0, 0], [15000, 5, 0]],
      [[3000, 0, 0], [30000, 8, 0]],
      [[6000, 0, 0], [60000, 12, 0]],
      [[12000, 0, 0], [120000, 0, 5]],
      [[25000, 0, 0], [250000, 0, 8]]
    ],
    dupeCoins: [0, 2000, 6000, 20000, 60000],
    pouch: { rate: 12, ratePer: 6, max: 450, maxPer: 330, levels: 8, cost: 40 },
    baseHp: 1500,
    // Battle Cry: every hero on the field glows and fights harder for a few seconds.
    roar: { charge: 30, minCharge: 12, time: 8, atk: 0.5, speed: 0.3, guard: 0.3 },
    kbDist: 28, kbTime: 0.35, bossKbDist: 10,
    allyCap: 30, enemyCap: 40,
    wave: { speed: 340, base: 40, per: 55 },
    poison: 0.02,
    freeEggHours: 4,
    farmHours: 8,
    lossCoinShare: 0.3,
    welcomeAt: 3                               // story stages cleared before the welcome hatch
  };

  const HERO = {}; CT.HEROES.forEach((h) => { HERO[h.id] = h; });
  const ENEMY = {}; CT.ENEMIES.forEach((e) => { ENEMY[e.id] = e; });
  const LABS = {}; CT.LAB.forEach((l) => { LABS[l.id] = l; });
  const BANNER = {}; CT.BANNERS.forEach((b) => { BANNER[b.id] = b; });
  const EVENT = {}; CT.EVENTS.forEach((e) => { EVENT[e.id] = e; });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, fallback) { return (typeof v === 'number' && isFinite(v)) ? v : fallback; }
  function int(v, lo, hi) { return clamp(Math.floor(num(v, lo)), lo, hi); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 10000) return String(Math.floor(n));
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) return n.toExponential(2).replace('+', '');
    const scaled = n / Math.pow(1000, tier);
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    const p = Math.pow(10, digits);
    return (Math.floor(scaled * p) / p).toFixed(digits) + SUFFIX[tier];
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Local calendar day number (days since 1970 in the player's time zone).
  function dayNumber(ms) {
    const d = new Date(ms);
    return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
  }

  // ---------------------------------------------------------------------------
  // State and saves
  // ---------------------------------------------------------------------------
  const STAT_KEYS = ['battles', 'wins', 'kills', 'deploys', 'roars', 'hatches', 'levelups', 'pouches', 'events', 'bosses', 'towerWins', 'perfects', 'logins', 'coinsEarned', 'playSeconds'];

  function createState(now) {
    now = now || 0;
    const s = {
      v: CONFIG.saveVersion,
      created: now, lastSeen: now,
      coins: 0, gems: 0,
      tickets: { silver: 0, gold: 0 },
      seeds: 0, fruit: 0,
      items: { rush: 0, armor: 0, roar: 0, charm: 0 },
      heroes: { pip: { lvl: 1, plus: 0, form: 0 }, shelly: { lvl: 1, plus: 0, form: 0 } },
      lineup: ['pip', 'shelly', null, null, null, null, null, null, null, null],
      clear: [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
      stars: {},
      lab: {},
      gacha: { pulls: 0, sinceMythic: 0, sinceLegend: 0, freeAt: 0, welcome: false },
      daily: { day: -1, missions: [], snap: {}, bonus: false, events: {} },
      login: { last: -1, count: 0 },
      farm: { since: now },
      tower: 0,
      medals: {},
      seen: {},
      stats: {},
      flags: {},
      settings: { music: true, sfx: true, autoCam: true, speed: 1, muted: false },
      name: ''
    };
    CT.LAB.forEach((l) => { s.lab[l.id] = 0; });
    STAT_KEYS.forEach((k) => { s.stats[k] = 0; });
    return s;
  }

  function sanitize(raw, now) {
    const s = createState(now);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: s, fixed: true };
    s.created = num(raw.created, now);
    s.lastSeen = clamp(num(raw.lastSeen, now), 0, Math.max(now, 1));
    s.coins = Math.max(0, num(raw.coins, 0));
    s.gems = Math.max(0, num(raw.gems, 0));
    if (raw.tickets) { s.tickets.silver = int(raw.tickets.silver, 0, 1e6); s.tickets.gold = int(raw.tickets.gold, 0, 1e6); }
    s.seeds = int(raw.seeds, 0, 1e6); s.fruit = int(raw.fruit, 0, 1e6);
    if (raw.items) for (const k in s.items) s.items[k] = int(raw.items[k], 0, 1e4);
    if (raw.heroes && typeof raw.heroes === 'object') {
      for (const id in raw.heroes) {
        if (!HERO[id]) continue;
        const h = raw.heroes[id] || {};
        s.heroes[id] = { lvl: int(h.lvl, 1, CONFIG.maxLevel), plus: int(h.plus, 0, CONFIG.maxPlus), form: int(h.form, 0, 2) };
      }
    }
    if (Array.isArray(raw.lineup)) {
      const used = {};
      s.lineup = [];
      for (let i = 0; i < 10; i++) {
        const id = raw.lineup[i];
        if (id && s.heroes[id] && !used[id]) { s.lineup.push(id); used[id] = true; } else s.lineup.push(null);
      }
      if (!s.lineup.some(Boolean)) s.lineup[0] = 'pip';
    }
    if (Array.isArray(raw.clear)) for (let d = 0; d < 3; d++) for (let r = 0; r < CT.REGIONS.length; r++) s.clear[d][r] = int(raw.clear[d] && raw.clear[d][r], 0, 12);
    // A region can only be cleared in order.
    for (let d = 0; d < 3; d++) for (let r = 1; r < CT.REGIONS.length; r++) if (s.clear[d][r - 1] < 12) s.clear[d][r] = d === 0 ? Math.min(s.clear[d][r], 0) : s.clear[d][r];
    for (let d = 1; d < 3; d++) for (let r = 0; r < CT.REGIONS.length; r++) if (s.clear[d - 1][r] < 12) s.clear[d][r] = 0;
    if (raw.stars && typeof raw.stars === 'object') for (const k in raw.stars) if (/^\d-\d-\d+$/.test(k)) s.stars[k] = int(raw.stars[k], 0, 7);
    if (raw.lab) CT.LAB.forEach((l) => { s.lab[l.id] = int(raw.lab[l.id], 0, l.max); });
    if (raw.gacha) {
      s.gacha.pulls = int(raw.gacha.pulls, 0, 1e7);
      s.gacha.sinceMythic = int(raw.gacha.sinceMythic, 0, 1000);
      s.gacha.sinceLegend = int(raw.gacha.sinceLegend, 0, 1000);
      s.gacha.freeAt = num(raw.gacha.freeAt, 0);
      s.gacha.welcome = !!raw.gacha.welcome;
    }
    if (raw.daily && typeof raw.daily === 'object') {
      s.daily.day = int(raw.daily.day, -1, 1e6);
      s.daily.bonus = !!raw.daily.bonus;
      if (Array.isArray(raw.daily.missions)) s.daily.missions = raw.daily.missions.filter((m) => m && CT.MISSIONS.some((x) => x.id === m.id)).slice(0, 6).map((m) => ({ id: m.id, claimed: !!m.claimed }));
      if (raw.daily.snap) for (const k of STAT_KEYS) s.daily.snap[k] = Math.max(0, num(raw.daily.snap[k], 0));
      if (raw.daily.events) for (const e of CT.EVENTS) s.daily.events[e.id] = int(raw.daily.events[e.id], 0, 99);
    }
    if (raw.login) { s.login.last = int(raw.login.last, -1, 1e6); s.login.count = int(raw.login.count, 0, 1e6); }
    if (raw.farm) s.farm.since = clamp(num(raw.farm.since, now), 0, Math.max(now, 1));
    s.tower = int(raw.tower, 0, 999);
    if (raw.medals) for (const k in raw.medals) s.medals[k] = int(raw.medals[k], 0, 10);
    if (raw.seen) for (const k in raw.seen) if (ENEMY[k]) s.seen[k] = 1;
    if (raw.stats) for (const k of STAT_KEYS) s.stats[k] = Math.max(0, num(raw.stats[k], 0));
    if (raw.flags && typeof raw.flags === 'object') for (const k in raw.flags) if (/^\w{1,24}$/.test(k)) s.flags[k] = !!raw.flags[k];
    if (raw.settings) {
      s.settings.music = raw.settings.music !== false;
      s.settings.sfx = raw.settings.sfx !== false;
      s.settings.autoCam = raw.settings.autoCam !== false;
      s.settings.speed = raw.settings.speed === 2 ? 2 : 1;
      s.settings.muted = raw.settings.muted === true;
    }
    if (typeof raw.name === 'string') s.name = cleanName(raw.name);
    // Starters unlocked by story progress (repairs older or edited saves).
    unlockStoryHeroes(s);
    return { state: s, fixed: false };
  }

  function cleanName(n) { return String(n || '').replace(/[^\w .'!-]/g, '').trim().slice(0, 14); }

  function serialize(s) { return JSON.stringify(s); }
  function parseSave(text, now) {
    if (!text) return null;
    try { const r = sanitize(JSON.parse(text), now); return { ok: true, state: r.state }; } catch (e) { return { broken: true }; }
  }

  // ---------------------------------------------------------------------------
  // Heroes
  // ---------------------------------------------------------------------------
  function levelMult(L) { return L <= 20 ? 1 + 0.2 * (L - 1) : 4.8 + 0.12 * (L - 20); }
  function labVal(s, id) { return (s.lab[id] || 0) * LABS[id].per; }

  // Effective battle stats of an owned hero (or of a hero at a given level/plus/form for previews).
  function heroStats(s, id, override) {
    const def = HERO[id];
    const own = override || s.heroes[id] || { lvl: 1, plus: 0, form: 0 };
    const L = own.lvl + own.plus;
    const m = levelMult(L) * CONFIG.formMult[own.form] * (1 + labVal(s, 'train'));
    const ab = Object.assign({}, def.ab);
    // Third forms sharpen their signature ability.
    if (own.form === 2) {
      if (ab.kb) ab.kb = Math.min(1, ab.kb + 0.1);
      if (ab.crit) ab.crit = Math.min(1, ab.crit + 0.1);
      if (ab.freeze) ab.freeze = [Math.min(1, ab.freeze[0] + 0.1), ab.freeze[1] + 0.5];
      if (ab.slow) ab.slow = [Math.min(1, ab.slow[0] + 0.1), ab.slow[1] + 0.5];
      if (ab.weaken) ab.weaken = [Math.min(1, ab.weaken[0] + 0.1), ab.weaken[1] + 0.5];
      if (ab.wave) ab.wave = [Math.min(1, ab.wave[0] + 0.1), ab.wave[1] + 1];
    }
    return {
      id: id, name: def.names[own.form], rarity: def.rarity, form: own.form, level: L,
      hp: Math.round(def.hp * m), atk: Math.round(def.atk * m), rng: def.rng, spd: def.spd,
      rate: Math.max(def.rate, def.fore + 0.25), fore: def.fore, kb: def.kb, area: !!def.area, ab: ab, traits: [],
      cost: def.cost, cd: def.cd * (1 - Math.min(0.4, labVal(s, 'cd'))), size: def.look.s
    };
  }

  function levelCost(id, lvl) {
    const r = HERO[id].rarity;
    return Math.round(CONFIG.levelBase[r] * Math.pow(CONFIG.levelGrowth, lvl - 1) / 10) * 10;
  }
  function canLevel(s, id) { const h = s.heroes[id]; return !!h && h.lvl < CONFIG.maxLevel && s.coins >= levelCost(id, h.lvl); }
  function levelUp(s, id) {
    if (!canLevel(s, id)) return false;
    s.coins -= levelCost(id, s.heroes[id].lvl);
    s.heroes[id].lvl++;
    s.stats.levelups++;
    return true;
  }

  function evolveNeed(id, form) {
    const r = HERO[id].rarity;
    const e = CONFIG.evolve[r][form];
    return { level: form === 0 ? 10 : 20, coins: e[0], seeds: e[1], fruit: e[2] };
  }
  function canEvolve(s, id) {
    const h = s.heroes[id];
    if (!h || h.form >= 2) return false;
    const n = evolveNeed(id, h.form);
    return h.lvl >= n.level && s.coins >= n.coins && s.seeds >= n.seeds && s.fruit >= n.fruit;
  }
  function evolve(s, id) {
    if (!canEvolve(s, id)) return false;
    const h = s.heroes[id], n = evolveNeed(id, h.form);
    s.coins -= n.coins; s.seeds -= n.seeds; s.fruit -= n.fruit;
    h.form++;
    return true;
  }

  function ownedCount(s) { return Object.keys(s.heroes).length; }

  // Basic heroes unlocked by story stages: content stores [region, stage index].
  function unlockStoryHeroes(s) {
    const got = [];
    for (const h of CT.HEROES) {
      if (h.rarity !== 0 || !h.unlock || s.heroes[h.id]) continue;
      if (s.clear[0][h.unlock[0]] > h.unlock[1]) {
        s.heroes[h.id] = { lvl: 1, plus: 0, form: 0 };
        got.push(h.id);
        const free = s.lineup.indexOf(null);
        if (free >= 0) s.lineup[free] = h.id;
      }
    }
    return got;
  }

  function labCost(id, lvl) { return Math.round(LABS[id].base * Math.pow(1.38, lvl) / 10) * 10; }
  function buyLab(s, id) {
    const l = LABS[id];
    if (!l || s.lab[id] >= l.max) return false;
    const c = labCost(id, s.lab[id]);
    if (s.coins < c) return false;
    s.coins -= c; s.lab[id]++;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Stages
  // ---------------------------------------------------------------------------
  function stageKey(d, r, i) { return d + '-' + r + '-' + i; }
  function starCount(mask) { return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1); }
  function totalStars(s) { let n = 0; for (const k in s.stars) n += starCount(s.stars[k]); return n; }
  function regionStars(s, d, r) { let n = 0; for (let i = 0; i < 12; i++) n += starCount(s.stars[stageKey(d, r, i)] || 0); return n; }
  function storyCleared(s) { let n = 0; for (const c of s.clear[0]) n += c; return n; }
  function clearedAll(s, d) { let n = 0; for (const c of s.clear[d]) n += c; return n; }

  function regionOpen(s, d, r) {
    if (d === 0) return r === 0 || s.clear[0][r - 1] >= 12;
    return s.clear[d - 1][r] >= 12;
  }
  function stageOpen(s, d, r, i) { return regionOpen(s, d, r) && s.clear[d][r] >= i; }

  // Builds a stage from its region's enemy pools. Deterministic: the same stage always plays the same way.
  function stageDef(d, r, i) {
    const R = CT.REGIONS[r], D = CT.DIFFICULTIES[d];
    const k = i / 11;
    const mag = Math.round(lerp(R.mag[0], R.mag[1], k) * D.mag * tuned('mag', d, r, i));
    const A = R.pool.a, B = R.pool.b, C = R.pool.c;
    const tempo = 1 / D.rate;
    const lines = [];
    const add = (o) => lines.push(Object.assign({ mag: mag, start: 0, every: [10, 10], max: 0, n: 1 }, o));
    const ev = (lo, hi) => [lo * tempo, hi * tempo];
    // The trickle that never stops.
    add({ e: A[i % A.length], start: 2, every: ev(7 - 2.6 * k, 9.5 - 3.2 * k) });
    if (A.length > 1 && i >= 2) add({ e: A[(i + 1) % A.length], start: 16, every: ev(13, 19) });
    // Support enemies.
    if (i >= 1) add({ e: B[(i - 1) % B.length], start: Math.max(8, 14 - i), every: ev(15 - 4 * k, 21 - 5 * k) });
    if (i >= 4) add({ e: B[(i + 1) % B.length], start: 32, every: ev(21, 29) });
    // Heavies.
    if (i >= 3) add({ e: C[i % C.length], mag: Math.round(mag * 0.9), start: 48, every: ev(42, 56), max: 1 + Math.floor(i / 3), trig: i >= 7 ? 0.85 : undefined });
    // Flavour by slot.
    if (i === 2) add({ e: B[2 % B.length], start: 20, every: ev(9, 12), max: 6 });
    if (i === 5) add({ e: C[0], mag: Math.round(mag * 1.8), boss: true, trig: 0.97, max: 1 });
    if (i === 7) add({ e: A[0], start: 0, every: ev(1.2, 1.6), max: 12, trig: 0.5 });
    if (i === 9) add({ e: B[B.length - 1], start: 5, every: ev(8, 11), max: 10 });
    if (i === 11) {
      add({ e: R.boss, mag: Math.round(100 * D.mag * tuned('mag', d, r, i)), boss: true, trig: 0.995, fallback: 40, max: 1 });
      add({ e: C[0], mag: Math.round(mag * 0.8), start: 6, every: ev(30, 40), max: 3, trig: 0.995 });
    }
    // Every stage after the first few rallies once the tower is in trouble.
    if (i >= 3 && i !== 7) add({ e: B[i % B.length], start: 0, every: ev(2.5, 3.5), max: 3 + Math.floor(i / 4), trig: 0.4 });
    const baseHp = Math.round(lerp(R.baseHp[0], R.baseHp[1], k) * (d === 0 ? 1 : D.mag * 0.7) * tuned('hp', d, r, i) / 10) * 10;
    return {
      kind: 'story', d: d, r: r, i: i, key: stageKey(d, r, i),
      name: R.names[i], region: R.name, theme: R.theme,
      lane: R.lane + (i % 3) * 20, baseHp: baseHp, lines: lines,
      coins: Math.round(lerp(R.coins[0], R.coins[1], k) * D.coins / 10) * 10,
      gems: Math.round((i === 11 ? 100 : i === 5 ? 40 : 20) * D.gems),
      par: Math.round(80 + 6 * i + r * 8),
      boss: i === 11 ? R.boss : null, seed: hashString('stage' + stageKey(d, r, i))
    };
  }

  // Gloom Tower: endless climb, mixing every region's Gloom.
  function towerDef(f) {
    const r = Math.min(CT.REGIONS.length - 1, Math.floor((f - 1) / 6));
    const R = CT.REGIONS[r];
    const k = ((f - 1) % 6) / 5;
    const over = Math.max(0, f - 48);
    const mag = Math.round(lerp(R.mag[0], R.mag[1], k) * 1.6 * Math.pow(1.07, over));
    const rng = mulberry32(hashString('tower' + f));
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const lines = [
      { e: pick(R.pool.a), mag: mag, start: 1, every: [5, 7], max: 0, n: 1 },
      { e: pick(R.pool.b), mag: mag, start: 8, every: [11, 15], max: 0, n: 1 },
      { e: pick(R.pool.b), mag: mag, start: 20, every: [16, 22], max: 0, n: 1 },
      { e: pick(R.pool.c), mag: mag, start: 35, every: [35, 45], max: 3, n: 1 }
    ];
    if (f % 10 === 0) lines.push({ e: R.boss, mag: Math.round(100 * 1.6 * Math.pow(1.07, over)), start: 0, every: [99, 99], max: 1, n: 1, boss: true, trig: 0.995, fallback: 30 });
    return {
      kind: 'tower', floor: f, key: 'tower-' + f, name: 'Floor ' + f, region: 'Gloom Tower', theme: (f - 1) % 8,
      lane: 620, baseHp: Math.round(lerp(R.baseHp[0], R.baseHp[1], k) * 1.4 * Math.pow(1.06, over)), lines: lines,
      coins: Math.round(lerp(R.coins[0], R.coins[1], k) * 1.5 / 10) * 10, gems: f % 5 === 0 ? 100 : 0, gold: f % 10 === 0 ? 1 : 0,
      par: 9999, boss: f % 10 === 0 ? R.boss : null, seed: hashString('tower' + f)
    };
  }

  // Daily events: five levels each, unlocked by story progress.
  const EVENT_LEVELS = [
    { need: 0, region: 0, k: 0.5 }, { need: 12, region: 1, k: 0.5 }, { need: 24, region: 2, k: 0.7 }, { need: 48, region: 4, k: 0.7 }, { need: 72, region: 6, k: 1 }
  ];
  function eventDef(id, lvl) {
    const E = EVENT[id], L = EVENT_LEVELS[lvl];
    const R = CT.REGIONS[L.region];
    const mag = Math.round(lerp(R.mag[0], R.mag[1], L.k) * 1.3);
    const lines = [
      { e: E.foes[0], mag: mag, start: 2, every: [4, 6], max: 0, n: 1 },
      { e: E.foes[1], mag: mag, start: 10, every: [10, 14], max: 0, n: 1 },
      { e: E.foes[2], mag: mag, start: 30, every: [28, 36], max: 3, n: 1 }
    ];
    const rewards = {
      coins: { coins: [3000, 9000, 24000, 60000, 140000][lvl] },
      seeds: { seeds: [2, 3, 4, 5, 6][lvl], fruit: [0, 0, 1, 1, 2][lvl] },
      tickets: { silver: [1, 2, 2, 3, 4][lvl], gold: lvl === 4 ? 1 : 0 }
    }[E.reward];
    return {
      kind: 'event', event: id, lvl: lvl, key: 'event-' + id + '-' + lvl, name: E.name + ' ' + (lvl + 1), region: E.name, theme: E.theme,
      lane: 560, baseHp: Math.round(lerp(R.baseHp[0], R.baseHp[1], L.k)), lines: lines,
      coins: 0, gems: 0, rewards: rewards, par: 9999, boss: null, seed: hashString('ev' + id + lvl)
    };
  }
  function eventOpen(s, id, lvl) { return storyCleared(s) >= Math.max(EVENT[id].unlock, EVENT_LEVELS[lvl].need); }

  // ---------------------------------------------------------------------------
  // Battle simulation
  // ---------------------------------------------------------------------------
  function pouchRate(s, lvl) { return (CONFIG.pouch.rate + CONFIG.pouch.ratePer * (lvl - 1)) * (1 + labVal(s, 'wrate')); }
  function pouchMax(s, lvl) { return (CONFIG.pouch.max + CONFIG.pouch.maxPer * (lvl - 1)) * (1 + labVal(s, 'wcap')); }
  function pouchCost(lvl) { return CONFIG.pouch.cost * (lvl + 1); }
  function roarCharge(s) { return Math.max(CONFIG.roar.minCharge, CONFIG.roar.charge - labVal(s, 'rchg')); }
  function cryBoost(s) { return CONFIG.roar.atk + labVal(s, 'rpow'); }
  function burrowHp(s) { return Math.round(CONFIG.baseHp * (1 + labVal(s, 'base')) * (1 + 0.25 * storyCleared(s) / 12)); }

  function enemyStats(id, mag) {
    const e = ENEMY[id], m = mag / 100;
    return {
      id: id, name: e.name, hp: Math.round(e.hp * m), atk: Math.round(e.atk * m), rng: e.rng, spd: e.spd,
      rate: Math.max(e.rate, e.fore + 0.25), fore: e.fore, kb: e.kb, area: !!e.area, ab: e.ab || {}, traits: e.traits, drop: e.drop, size: e.look.s
    };
  }

  // opts: { items: {rush, armor, roar, charm}, lineup }
  function createBattle(s, def, opts) {
    opts = opts || {};
    const items = opts.items || {};
    const rng = mulberry32((def.seed ^ (opts.seed || 0)) >>> 0);
    const lineup = (opts.lineup || s.lineup).slice(0, 10);
    const b = {
      def: def, L: def.lane, t: 0, rng: rng, state: 'play', items: items,
      pouch: { lvl: items.rush ? 3 : 1, acorns: CONFIG.pouch.max * 0 + labVal(s, 'start') + (items.rush ? 600 : 0) },
      ally: { hp: 0, max: 0, hitT: 0 }, enemy: { hp: def.baseHp, max: def.baseHp, hitT: 0 },
      roar: { charge: items.roar ? 1 : 0, time: roarCharge(s) * (items.roar ? 0.7 : 1), atk: cryBoost(s), dur: CONFIG.roar.time, left: 0 },
      slots: [], ents: [], waves: [], lines: def.lines.map((l) => ({ l: l, active: l.trig === undefined, next: l.start, count: 0, fired: false })),
      nextId: 1, seen: {}, stats: { deploys: 0, kills: 0, roars: 0, pouches: 0, bosses: 0, dmg: 0 }, bossOut: false, bossesLeft: 0
    };
    b.ally.max = b.ally.hp = Math.round(burrowHp(s) * (items.armor ? 1.6 : 1));
    b.pouch.max = pouchMax(s, b.pouch.lvl);
    b.pouch.rate = pouchRate(s, b.pouch.lvl);
    b.pouch.acorns = Math.min(b.pouch.max, b.pouch.acorns);
    b.labState = { wrate: s.lab.wrate, wcap: s.lab.wcap };
    b.sref = s;
    for (const id of lineup) {
      if (!id || !s.heroes[id]) { b.slots.push(null); continue; }
      const st = heroStats(s, id);
      b.slots.push({ id: id, st: st, cd: 0, cdMax: st.cd });
    }
    return b;
  }

  function canDeploy(b, i) {
    const sl = b.slots[i];
    if (!sl || b.state !== 'play') return false;
    if (sl.cd > 0 || b.pouch.acorns < sl.st.cost) return false;
    let n = 0; for (const e of b.ents) if (e.side === 0 && e.state !== 'dead') n++;
    return n < CONFIG.allyCap;
  }
  function deploy(b, i, ev) {
    if (!canDeploy(b, i)) return false;
    const sl = b.slots[i];
    b.pouch.acorns -= sl.st.cost;
    sl.cd = sl.cdMax;
    spawn(b, 0, sl.st, 6 + b.rng() * 4, false);
    b.stats.deploys++;
    if (ev) ev.push({ t: 'deploy', id: sl.id });
    return true;
  }

  function canPouch(b) { return b.state === 'play' && b.pouch.lvl < CONFIG.pouch.levels && b.pouch.acorns >= pouchCost(b.pouch.lvl); }
  function upgradePouch(b, ev) {
    if (!canPouch(b)) return false;
    b.pouch.acorns -= pouchCost(b.pouch.lvl);
    b.pouch.lvl++;
    b.pouch.max = pouchMax(b.sref, b.pouch.lvl);
    b.pouch.rate = pouchRate(b.sref, b.pouch.lvl);
    b.stats.pouches++;
    if (ev) ev.push({ t: 'pouch', lvl: b.pouch.lvl });
    return true;
  }

  function canRoar(b) { return b.state === 'play' && b.roar.charge >= 1; }
  function roar(b, ev) {
    if (!canRoar(b)) return false;
    b.roar.charge = 0;
    b.stats.roars++;
    b.roar.left = b.roar.dur;
    let n = 0;
    for (const e of b.ents) if (e.side === 0 && e.state !== 'dead' && e.state !== 'down') { e.buff = b.roar.dur; n++; }
    if (ev) ev.push({ t: 'roar', n: n });
    return true;
  }

  function spawn(b, side, st, x, boss) {
    const e = {
      id: b.nextId++, side: side, st: st, x: x, y: Math.floor(b.rng() * 7), hp: st.hp, max: st.hp,
      state: 'walk', t: 0, at: 0, cool: 0, hits: 0, kbi: 0, kbFrom: 0, kbTo: 0, kbT: 0,
      freeze: 0, slow: 0, weaken: 0, poison: 0, buff: 0, walkT: b.rng() * 2, boss: !!boss, revived: false, survived: false, burrowed: false, burrowLeft: 0, flash: 0
    };
    b.ents.push(e);
    return e;
  }

  function matches(list, traits) {
    if (!list || !traits || !traits.length) return false;
    for (const t of list) if (t === 'all' || traits.indexOf(t) >= 0) return true;
    return false;
  }

  function targetable(e) { return e.state !== 'dead' && e.state !== 'down' && e.state !== 'burrow'; }

  // Enemies in front of `a` within its reach (plus the tower if it is in reach).
  function findTargets(b, a, all) {
    const out = [];
    const dir = a.side === 0 ? 1 : -1;
    let best = null, bestD = 1e9;
    for (const e of b.ents) {
      if (e.side === a.side || !targetable(e)) continue;
      const d = (e.x - a.x) * dir;
      if (d < -6 || d > a.st.rng) continue;
      if (all) out.push(e);
      else if (d < bestD) { bestD = d; best = e; }
    }
    const towerD = a.side === 0 ? b.L - a.x : a.x;
    const towerIn = towerD <= a.st.rng;
    if (all) { if (towerIn) out.push('tower'); return out; }
    if (best) return [best];
    return towerIn ? ['tower'] : [];
  }

  function knock(b, e, dist, ev) {
    if (e.state === 'dead' || e.state === 'down') return;
    e.state = 'kb'; e.kbT = 0; e.kbFrom = e.x;
    const d = e.boss ? CONFIG.bossKbDist : dist;
    e.kbTo = e.side === 0 ? Math.max(2, e.x - d) : Math.min(b.L - 2, e.x + d);
    e.at = 0; e.hits = 0;
    if (ev) ev.push({ t: 'kb', id: e.id, side: e.side, x: e.x });
  }

  function damageTower(b, side, dmg, ev) {
    const tw = side === 0 ? b.enemy : b.ally;
    tw.hp = Math.max(0, tw.hp - dmg);
    tw.hitT = 0.25;
    if (side === 0) b.stats.dmg += dmg;
    if (ev) ev.push({ t: 'towerHit', side: side, dmg: dmg });
  }

  // One hit from attacker stats `ast` (side `aside`) on entity `e`. Returns true if it connected.
  function strike(b, aside, ast, e, base, ev, att) {
    if (e === 'tower') {
      const mult = aside === 0 ? (ast.ab.base || 1) : 1;
      damageTower(b, aside, Math.round(base * mult), ev);
      return true;
    }
    if (!targetable(e)) return false;
    let dmg = base;
    let crit = false;
    if (aside === 0) {
      const tr = e.st.traits;
      const strong = matches(ast.ab.strong, tr), massive = matches(ast.ab.massive, tr);
      if (tr.indexOf('spooky') >= 0 && !strong && !massive && b.rng() < 0.25) { if (ev) ev.push({ t: 'miss', x: e.x, y: e.y }); return false; }
      if (ast.ab.crit && b.rng() < ast.ab.crit) { crit = true; dmg *= 2; }
      const vs = (t) => matches(ast.ab.strong, [t]) || matches(ast.ab.massive, [t]);
      if (tr.indexOf('armored') >= 0 && !crit && !vs('armored')) dmg *= 0.1;
      if (tr.indexOf('cosmic') >= 0 && !vs('cosmic')) dmg *= 0.5;
      if (massive) dmg *= 3; else if (strong) dmg *= 1.5;
    } else {
      const tr = ast.traits || [];
      if (matches(e.st.ab.resist, tr)) dmg *= 0.25;
      else if (matches(e.st.ab.strong, tr)) dmg *= 0.5;
      if (tr.indexOf('toxic') >= 0) e.poison = 3;
      if (e.buff > 0) dmg *= 1 - CONFIG.roar.guard;
    }
    if (att && att.weaken > 0) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    applyDamage(b, e, dmg, ev, ast, crit);
    // Status effects from heroes.
    if (aside === 0 && e.state !== 'dead' && e.state !== 'down') {
      const ab = ast.ab, dur = e.boss ? 0.5 : 1;
      if (ab.freeze && b.rng() < ab.freeze[0]) { e.freeze = Math.max(e.freeze, ab.freeze[1] * dur); if (ev) ev.push({ t: 'status', k: 'freeze', id: e.id }); }
      if (ab.slow && b.rng() < ab.slow[0]) { e.slow = Math.max(e.slow, ab.slow[1] * dur); if (ev) ev.push({ t: 'status', k: 'slow', id: e.id }); }
      if (ab.weaken && b.rng() < ab.weaken[0]) { e.weaken = Math.max(e.weaken, ab.weaken[1] * dur); if (ev) ev.push({ t: 'status', k: 'weaken', id: e.id }); }
      if (ab.kb && e.state !== 'kb' && b.rng() < ab.kb) knock(b, e, CONFIG.kbDist, ev);
    }
    if (ev) ev.push({ t: 'hit', x: e.x, y: e.y, side: aside, crit: crit, big: dmg >= e.max * 0.25, id: e.id });
    return true;
  }

  function applyDamage(b, e, dmg, ev, ast, crit) {
    const before = e.hp;
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp <= 0) {
      if (e.side === 0 && e.st.ab.survive && !e.survived && b.rng() < e.st.ab.survive) {
        e.survived = true; e.hp = 1;
        if (ev) ev.push({ t: 'survive', id: e.id, x: e.x });
        knock(b, e, CONFIG.kbDist * 1.5, ev);
        return;
      }
      kill(b, e, ev, ast);
      return;
    }
    // Health-bar knockbacks.
    const n = e.st.kb;
    if (n > 1) {
      let crossed = 0;
      for (let k = e.kbi + 1; k < n; k++) if (e.hp <= e.max * (1 - k / n) && before > e.max * (1 - k / n)) crossed = k;
      if (crossed > e.kbi) { e.kbi = crossed; knock(b, e, CONFIG.kbDist, ev); }
    }
  }

  function kill(b, e, ev, ast) {
    if (e.side === 1 && e.st.traits.indexOf('undead') >= 0 && !e.revived && !(ast && ast.ab && ast.ab.zkill)) {
      e.state = 'down'; e.t = 0; e.hp = 0;
      if (ev) ev.push({ t: 'down', id: e.id, x: e.x });
      return;
    }
    e.state = 'dead'; e.t = 0; e.hp = 0;
    if (e.side === 1) {
      b.stats.kills++;
      if (e.boss) { b.stats.bosses++; b.bossesLeft = Math.max(0, b.bossesLeft - 1); }
      const drop = e.st.drop;
      b.pouch.acorns = Math.min(b.pouch.max, b.pouch.acorns + drop);
      b.coinBonus = (b.coinBonus || 0) + (e.st.ab.coins ? drop * 4 : 0);
      if (ev) ev.push({ t: 'die', side: 1, id: e.id, x: e.x, y: e.y, drop: drop, boss: e.boss, enemy: e.st.id });
    } else if (ev) ev.push({ t: 'die', side: 0, id: e.id, x: e.x, y: e.y });
  }

  function step(b, dt, ev) {
    if (b.state !== 'play') return;
    b.t += dt;
    const L = b.L;
    // Pouch, roar, cooldowns.
    b.pouch.acorns = Math.min(b.pouch.max, b.pouch.acorns + b.pouch.rate * dt);
    b.roar.charge = Math.min(1, b.roar.charge + dt / b.roar.time);
    b.roar.left = Math.max(0, b.roar.left - dt);
    for (const sl of b.slots) if (sl && sl.cd > 0) sl.cd = Math.max(0, sl.cd - dt);
    b.ally.hitT = Math.max(0, b.ally.hitT - dt);
    b.enemy.hitT = Math.max(0, b.enemy.hitT - dt);

    // Enemy spawns.
    const frac = b.enemy.hp / b.enemy.max;
    let enemies = 0;
    for (const e of b.ents) if (e.side === 1 && e.state !== 'dead') enemies++;
    for (const ln of b.lines) {
      const l = ln.l;
      if (!ln.active) {
        if ((l.trig !== undefined && frac <= l.trig) || (l.fallback !== undefined && b.t >= l.fallback)) { ln.active = true; ln.next = b.t + l.start; }
        else continue;
      } else if (ln.next > 1e8) continue;
      if (l.max && ln.count >= l.max) continue;
      if (b.t < ln.next) continue;
      if (enemies >= CONFIG.enemyCap && !l.boss) { ln.next = b.t + 1; continue; }
      for (let n = 0; n < (l.n || 1); n++) {
        const st = enemyStats(l.e, l.mag);
        const e = spawn(b, 1, st, L - 8 - b.rng() * 4, !!l.boss);
        enemies++;
        b.seen[l.e] = 1;
        if (l.boss) {
          b.bossesLeft++;
          if (ev) ev.push({ t: 'boss', id: e.id, enemy: l.e });
          for (const a of b.ents) if (a.side === 0 && a.state !== 'dead' && !(a.st.ab.immune && a.st.ab.immune.indexOf('kb') >= 0)) knock(b, a, CONFIG.kbDist * 2.2, null);
        } else if (ev) ev.push({ t: 'spawn', id: e.id, enemy: l.e });
      }
      ln.count++;
      ln.next = b.t + l.every[0] + b.rng() * (l.every[1] - l.every[0]);
    }

    // Entities.
    for (const e of b.ents) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.state === 'dead') { e.t += dt; continue; }
      if (e.state === 'down') {
        e.t += dt;
        if (e.t >= 2) { e.state = 'walk'; e.revived = true; e.hp = Math.round(e.max * 0.5); e.kbi = Math.floor(e.st.kb / 2); if (ev) ev.push({ t: 'revive', id: e.id, x: e.x }); }
        continue;
      }
      if (e.poison > 0) {
        e.poison -= dt;
        e.hp -= e.max * CONFIG.poison * dt;
        if (e.hp <= 0) { kill(b, e, ev, null); continue; }
      }
      if (e.weaken > 0) e.weaken -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.buff > 0) e.buff -= dt;
      if (e.freeze > 0) { e.freeze -= dt; continue; }
      e.cool -= dt;
      const dir = e.side === 0 ? 1 : -1;
      if (e.state === 'kb') {
        e.kbT += dt;
        const k = Math.min(1, e.kbT / CONFIG.kbTime);
        e.x = e.kbFrom + (e.kbTo - e.kbFrom) * (1 - (1 - k) * (1 - k));
        if (k >= 1) { e.state = 'walk'; }
        continue;
      }
      if (e.state === 'burrow') {
        const mv = e.st.spd * 2 * dt;
        e.x += dir * mv; e.burrowLeft -= mv;
        if (e.burrowLeft <= 0 || e.x >= L - 30) { e.state = 'walk'; if (ev) ev.push({ t: 'surface', id: e.id, x: e.x }); }
        continue;
      }
      if (e.state === 'atk') {
        e.at += dt;
        const multi = e.st.ab.multi || 1;
        while (e.hits < multi && e.at >= e.st.fore + e.hits * 0.15) {
          const dmg = e.st.atk / multi * (e.weaken > 0 ? 0.5 : 1) * (e.buff > 0 ? 1 + b.roar.atk : 1);
          const tg = findTargets(b, e, e.st.area);
          let landed = false;
          for (const t of tg) if (strike(b, e.side, e.st, t, dmg, ev, null)) landed = true;
          if (landed && e.st.ab.wave && b.rng() < e.st.ab.wave[0]) {
            const lv = e.st.ab.wave[1];
            b.waves.push({ side: e.side, x: e.x + dir * 12, dir: dir, end: e.x + dir * (CONFIG.wave.base + CONFIG.wave.per * lv), speed: CONFIG.wave.speed, dmg: dmg, st: e.st, hit: {} });
            if (ev) ev.push({ t: 'wave', side: e.side, x: e.x });
          }
          if (ev) ev.push({ t: 'swing', id: e.id, side: e.side, x: e.x, landed: landed });
          e.hits++;
        }
        if (e.at >= e.st.fore + (multi - 1) * 0.15 + 0.25) e.state = 'walk';
        continue;
      }
      // Walking or waiting.
      const tg = findTargets(b, e, false);
      if (tg.length) {
        if (e.side === 0 && e.st.ab.burrow && !e.burrowed && tg[0] !== 'tower') {
          e.burrowed = true; e.state = 'burrow'; e.burrowLeft = e.st.ab.burrow;
          if (ev) ev.push({ t: 'burrow', id: e.id, x: e.x });
          continue;
        }
        if (e.cool <= 0) { e.state = 'atk'; e.at = 0; e.hits = 0; e.cool = e.st.rate; }
        else e.state = 'idle';
      } else {
        e.state = 'walk';
        const sp = e.st.spd * (e.slow > 0 ? 0.25 : 1) * (e.buff > 0 ? 1 + CONFIG.roar.speed : 1);
        e.x += dir * sp * dt;
        e.walkT += dt * (0.6 + sp / 30);
        if (e.side === 0) e.x = Math.min(e.x, L - 4); else e.x = Math.max(e.x, 4);
      }
    }

    // Shock waves from heroes and the Gloom.
    for (const w of b.waves) {
      const x0 = w.x;
      w.x += w.dir * w.speed * dt;
      const lo = Math.min(x0, w.x), hi = Math.max(x0, w.x);
      for (const e of b.ents) {
        if (e.side === w.side || w.hit[e.id] || !targetable(e)) continue;
        if (e.x < lo || e.x > hi) continue;
        w.hit[e.id] = 1;
        strike(b, w.side, w.st, e, w.dmg, ev, null);
      }
      if ((w.end - w.x) * w.dir <= 0) w.done = true;
    }
    b.waves = b.waves.filter((w) => !w.done);
    b.ents = b.ents.filter((e) => !(e.state === 'dead' && e.t > 0.9));

    if (b.enemy.hp <= 0) {
      b.state = 'won';
      for (const e of b.ents) if (e.side === 1 && e.state !== 'dead') { e.state = 'dead'; e.t = 0; if (ev) ev.push({ t: 'die', side: 1, id: e.id, x: e.x, y: e.y, drop: 0 }); }
      if (ev) ev.push({ t: 'win' });
    } else if (b.ally.hp <= 0) {
      b.state = 'lost';
      if (ev) ev.push({ t: 'lose' });
    }
  }

  // Second Wind (rewarded): restores the burrow and blows every enemy back.
  function revive(b) {
    if (b.state !== 'lost' || b.revived) return false;
    b.revived = true;
    b.state = 'play';
    b.ally.hp = Math.round(b.ally.max * 0.6);
    for (const e of b.ents) if (e.side === 1 && e.state !== 'dead') knock(b, e, 120, null);
    b.roar.charge = 1;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function starsFor(b) {
    if (b.state !== 'won') return 0;
    let m = 1;
    if (b.ally.hp >= b.ally.max * 0.5) m |= 2;
    if (b.t <= b.def.par) m |= 4;
    return m;
  }

  // Applies a finished battle to the save. Returns what the player earned.
  function finishBattle(s, b, rng) {
    rng = rng || Math.random;
    const def = b.def, won = b.state === 'won';
    const out = { won: won, coins: 0, gems: 0, silver: 0, gold: 0, seeds: 0, fruit: 0, items: [], stars: 0, newStars: 0, first: false, unlocked: [], regionClear: false, time: b.t };
    s.stats.battles++;
    s.stats.kills += b.stats.kills; s.stats.deploys += b.stats.deploys; s.stats.roars += b.stats.roars;
    s.stats.pouches += b.stats.pouches; s.stats.bosses += b.stats.bosses;
    s.stats.playSeconds += b.t;
    for (const k in b.seen) s.seen[k] = 1;
    const coinMult = (1 + labVal(s, 'coin')) * (b.items.charm ? 2 : 1);
    if (!won) {
      const share = Math.min(1, b.stats.dmg / def.baseHp);
      out.coins = Math.round((def.coins || 300) * CONFIG.lossCoinShare * share * coinMult / 10) * 10;
      s.coins += out.coins; s.stats.coinsEarned += out.coins;
      return out;
    }
    s.stats.wins++;
    out.coins = Math.round(((def.coins || 0) * coinMult + (b.coinBonus || 0)) / 10) * 10;
    if (def.kind === 'story') {
      const key = def.key, prev = s.stars[key] || 0, mask = starsFor(b);
      s.stars[key] = prev | mask;
      out.stars = mask; out.newStars = starCount(prev | mask) - starCount(prev);
      if (mask === 7) s.stats.perfects++;
      if (s.clear[def.d][def.r] === def.i) {
        out.first = true;
        s.clear[def.d][def.r] = def.i + 1;
        out.gems += def.gems;
        if (def.i === 11) out.regionClear = true;
        if (def.d === 0) out.unlocked = unlockStoryHeroes(s);
      }
      // Random drops on every win.
      const roll = rng();
      if (roll < 0.08) out.silver += 1;
      else if (roll < 0.13) out.items.push(CT.ITEMS[Math.floor(rng() * CT.ITEMS.length)].id);
      else if (roll < 0.17 && def.r >= 2) out.seeds += 1;
    } else if (def.kind === 'tower') {
      if (s.tower === def.floor - 1) { s.tower = def.floor; out.first = true; out.gems += def.gems; out.gold += def.gold; }
      else out.coins = Math.round(out.coins * 0.3 / 10) * 10;
      s.stats.towerWins++;
    } else if (def.kind === 'event') {
      const r = def.rewards;
      out.coins += Math.round((r.coins || 0) * coinMult);
      out.seeds += r.seeds || 0; out.fruit += r.fruit || 0; out.silver += r.silver || 0; out.gold += r.gold || 0;
      s.stats.events++;
    }
    s.coins += out.coins; s.stats.coinsEarned += out.coins;
    s.gems += out.gems; s.tickets.silver += out.silver; s.tickets.gold += out.gold;
    s.seeds += out.seeds; s.fruit += out.fruit;
    for (const it of out.items) s.items[it]++;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Hatchery
  // ---------------------------------------------------------------------------
  function featured(day) {
    const rng = mulberry32(hashString('feature' + day));
    const of = (r) => CT.HEROES.filter((h) => h.rarity === r);
    const ep = of(2), my = of(3), le = of(4);
    const f = { epic: ep[Math.floor(rng() * ep.length)].id, mythic: my[Math.floor(rng() * my.length)].id, legend: null };
    if (day % 3 === 0) f.legend = le[Math.floor(rng() * le.length)].id;
    return f;
  }

  function bannerCost(id, n) {
    const B = BANNER[id];
    return n >= 10 ? (B.cost10 || B.cost * 10) : B.cost * n;
  }

  // Can the player hatch n eggs? Tickets are spent first, then gems.
  function canHatch(s, id, n) {
    const B = BANNER[id];
    if (s.tickets[B.ticket] >= n) return true;
    if (!B.cost) return false;
    return s.gems >= bannerCost(id, n);
  }

  function rollRarity(B, rng) {
    let x = rng() * 100;
    for (let r = 4; r >= 1; r--) { if (x < B.rates[r]) return r; x -= B.rates[r]; }
    return 1;
  }

  function pickHero(rarity, feat, rng) {
    const pool = CT.HEROES.filter((h) => h.rarity === rarity);
    const f = rarity === 2 ? feat.epic : rarity === 3 ? feat.mythic : rarity === 4 ? feat.legend : null;
    if (f && rng() < 0.5) return f;
    return pool[Math.floor(rng() * pool.length)].id;
  }

  // Hatches n eggs. opts: { free: true } skips payment (welcome gift, free egg), { guaranteeEpic } for the welcome hatch.
  function hatch(s, id, n, rng, day, opts) {
    opts = opts || {};
    const B = BANNER[id];
    if (!opts.free) {
      if (s.tickets[B.ticket] >= n) s.tickets[B.ticket] -= n;
      else if (B.cost && s.gems >= bannerCost(id, n)) s.gems -= bannerCost(id, n);
      else return null;
    }
    const feat = id === 'royal' ? featured(day || 0) : { epic: null, mythic: null, legend: null };
    const out = [];
    for (let k = 0; k < n; k++) {
      let r = rollRarity(B, rng);
      if (B.pity) {
        if (s.gacha.sinceLegend + 1 >= B.pity.legend) r = 4;
        else if (s.gacha.sinceMythic + 1 >= B.pity.mythic && r < 3) r = 3;
      }
      if (k === n - 1 && n >= 10 && r < 2 && !out.some((o) => o.rarity >= 2)) r = 2;
      if (opts.guaranteeEpic && k === n - 1 && !out.some((o) => o.rarity >= 2) && r < 2) r = 2;
      if (B.pity) {
        s.gacha.sinceMythic = r >= 3 ? 0 : s.gacha.sinceMythic + 1;
        s.gacha.sinceLegend = r >= 4 ? 0 : s.gacha.sinceLegend + 1;
      }
      const hid = pickHero(r, feat, rng);
      out.push(grantHero(s, hid));
    }
    s.gacha.pulls += n;
    s.stats.hatches += n;
    return out;
  }

  function grantHero(s, id) {
    const def = HERO[id];
    const res = { id: id, rarity: def.rarity, isNew: false, plus: false, coins: 0 };
    const h = s.heroes[id];
    if (!h) {
      s.heroes[id] = { lvl: 1, plus: 0, form: 0 };
      res.isNew = true;
      const free = s.lineup.indexOf(null);
      if (free >= 0) s.lineup[free] = id;
    } else if (h.plus < CONFIG.maxPlus) { h.plus++; res.plus = true; }
    else { res.coins = CONFIG.dupeCoins[def.rarity]; s.coins += res.coins; }
    return res;
  }

  function freeEggReady(s, now) { return now >= s.gacha.freeAt; }
  function claimFreeEgg(s, now, rng) {
    if (!freeEggReady(s, now)) return null;
    s.gacha.freeAt = now + CONFIG.freeEggHours * 3600000;
    return hatch(s, 'silver', 1, rng, 0, { free: true });
  }

  function welcomeReady(s) { return !s.gacha.welcome && storyCleared(s) >= CONFIG.welcomeAt; }
  function claimWelcome(s, rng, day) {
    if (!welcomeReady(s)) return null;
    s.gacha.welcome = true;
    return hatch(s, 'royal', 10, rng, day, { free: true, guaranteeEpic: true });
  }

  // ---------------------------------------------------------------------------
  // Daily systems: login calendar, missions, events, coin farm
  // ---------------------------------------------------------------------------
  function ensureDaily(s, now) {
    const day = dayNumber(now);
    if (s.daily.day === day) return false;
    s.daily.day = day;
    s.daily.bonus = false;
    s.daily.events = {};
    for (const k of STAT_KEYS) s.daily.snap[k] = s.stats[k];
    const cleared = storyCleared(s);
    const pool = CT.MISSIONS.filter((m) => !m.needs || cleared >= m.needs);
    const rng = mulberry32(hashString('missions' + day));
    const pick = [];
    while (pick.length < 4 && pool.length) pick.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    s.daily.missions = pick.map((m) => ({ id: m.id, claimed: false }));
    return true;
  }

  function missionInfo(s, m) {
    const def = CT.MISSIONS.find((x) => x.id === m.id);
    const prog = Math.max(0, s.stats[def.stat] - (s.daily.snap[def.stat] || 0));
    return { def: def, text: def.text.replace('{n}', def.n), prog: Math.min(prog, def.n), n: def.n, done: prog >= def.n, claimed: m.claimed, gems: def.gems };
  }
  function claimMission(s, idx) {
    const m = s.daily.missions[idx];
    if (!m || m.claimed) return 0;
    const info = missionInfo(s, m);
    if (!info.done) return 0;
    m.claimed = true;
    s.gems += info.gems;
    return info.gems;
  }
  function missionBonusReady(s) { return !s.daily.bonus && s.daily.missions.length > 0 && s.daily.missions.every((m) => m.claimed); }
  function claimMissionBonus(s) {
    if (!missionBonusReady(s)) return null;
    s.daily.bonus = true;
    s.gems += 100; s.tickets.silver += 1;
    return { gems: 100, silver: 1 };
  }

  function loginReady(s, now) { return s.login.last !== dayNumber(now); }
  function loginReward(s) { return CT.LOGIN[s.login.count % CT.LOGIN.length]; }
  function claimLogin(s, now, rng) {
    if (!loginReady(s, now)) return null;
    const r = loginReward(s);
    s.login.last = dayNumber(now);
    s.login.count++;
    s.stats.logins++;
    const got = Object.assign({}, r);
    if (r.gems) s.gems += r.gems;
    if (r.coins) s.coins += r.coins;
    if (r.silver) s.tickets.silver += r.silver;
    if (r.gold) s.tickets.gold += r.gold;
    if (r.items) { const it = CT.ITEMS[Math.floor((rng || Math.random)() * CT.ITEMS.length)].id; s.items[it] += r.items; got.item = it; }
    return got;
  }

  function eventEntriesLeft(s, id) { return EVENT[id].entries - (s.daily.events[id] || 0); }
  function useEventEntry(s, id) { if (eventEntriesLeft(s, id) <= 0) return false; s.daily.events[id] = (s.daily.events[id] || 0) + 1; return true; }

  // Acorn Farm: coins trickle in while away, capped at 8 hours.
  function farmRate(s) { return Math.round(240 + 70 * storyCleared(s) + 120 * clearedAll(s, 1) + 200 * clearedAll(s, 2)); }
  function farmPending(s, now) {
    const hours = clamp((now - s.farm.since) / 3600000, 0, CONFIG.farmHours);
    return { coins: Math.floor(farmRate(s) * hours), hours: hours, full: hours >= CONFIG.farmHours };
  }
  function claimFarm(s, now, mult) {
    const p = farmPending(s, now);
    if (p.coins <= 0) return 0;
    const c = p.coins * (mult || 1);
    s.coins += c; s.stats.coinsEarned += c;
    s.farm.since = now;
    return c;
  }

  // Items can be bought with coins.
  function buyItem(s, id) {
    const it = CT.ITEMS.find((x) => x.id === id);
    if (!it || s.coins < it.price) return false;
    s.coins -= it.price; s.items[id]++;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Medals
  // ---------------------------------------------------------------------------
  function medalValue(s, stat) {
    switch (stat) {
      case 'clears0': return clearedAll(s, 0);
      case 'clears1': return clearedAll(s, 1);
      case 'clears2': return clearedAll(s, 2);
      case 'stars': return totalStars(s);
      case 'owned': return ownedCount(s);
      case 'maxLevel': { let m = 0; for (const id in s.heroes) m = Math.max(m, s.heroes[id].lvl + s.heroes[id].plus); return m; }
      case 'form3': { let n = 0; for (const id in s.heroes) if (s.heroes[id].form === 2) n++; return n; }
      case 'tower': return s.tower;
      default: return s.stats[stat] || 0;
    }
  }
  function medalList(s) {
    return CT.MEDALS.map((m) => {
      const got = s.medals[m.stat] || 0;
      const v = medalValue(s, m.stat);
      const tier = Math.min(got, m.tiers.length - 1);
      const done = got >= m.tiers.length;
      const target = done ? m.tiers[m.tiers.length - 1] : m.tiers[got];
      return { m: m, claimed: got, value: v, target: target, ready: !done && v >= target, done: done, gems: done ? 0 : m.gems[got], text: m.text.replace('{n}', target), tier: tier };
    });
  }
  function claimMedal(s, stat) {
    const it = medalList(s).find((x) => x.m.stat === stat);
    if (!it || !it.ready) return 0;
    s.medals[stat] = (s.medals[stat] || 0) + 1;
    s.gems += it.gems;
    return it.gems;
  }

  const AW = {
    CONFIG, CT, HERO, ENEMY, LABS, BANNER, EVENT, EVENT_LEVELS, STAT_KEYS,
    clamp, fmt, mulberry32, hashString, dayNumber, cleanName,
    createState, sanitize, serialize, parseSave,
    levelMult, heroStats, levelCost, canLevel, levelUp, evolveNeed, canEvolve, evolve, ownedCount, unlockStoryHeroes,
    labCost, buyLab, labVal,
    stageKey, starCount, totalStars, regionStars, storyCleared, clearedAll, regionOpen, stageOpen, stageDef, towerDef, eventDef, eventOpen,
    pouchRate, pouchMax, pouchCost, roarCharge, cryBoost, burrowHp, enemyStats,
    createBattle, canDeploy, deploy, canPouch, upgradePouch, canRoar, roar, step, revive, starsFor, finishBattle,
    featured, bannerCost, canHatch, hatch, grantHero, freeEggReady, claimFreeEgg, welcomeReady, claimWelcome,
    ensureDaily, missionInfo, claimMission, missionBonusReady, claimMissionBonus, loginReady, loginReward, claimLogin,
    eventEntriesLeft, useEventEntry, farmRate, farmPending, claimFarm, buyItem,
    medalValue, medalList, claimMedal,
    setTune: function (t) { TUNE = t; }, getTune: function () { return TUNE; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AW;
  root.AW = AW;
})(typeof globalThis !== 'undefined' ? globalThis : this);
