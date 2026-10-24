/* Animal Wars — UI, input, the battle loop, saving and platform hooks. */
(function () {
  'use strict';

  const AW = window.AW, CT = AW.CT, SPR = window.AWSprites, AU = window.AWAudio, PF = window.AWPlatform, R = window.AWRender;
  SPR.setContent(CT);
  const fmt = AW.fmt;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'animal-wars-save-v1';
  const DEBUG = /[?&]debug\b/.test(location.search);
  const COVER = /[?&]cover\b/.test(location.search);

  let state = null;
  let mode = 'home';
  let battle = null, battleOpts = null, paused = false, acc = 0, ended = false, endT = 0;
  let panelName = null, lastPanelArgs = null;
  let swapPick = null;          // hero waiting for a lineup slot
  let dirty = false, lastSave = 0;
  const ui = { mapRegion: 0, mapDiff: 0, armyFilter: -1, bookTab: 'heroes', items: {} };
  const tutorial = { step: null };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function now() { return Date.now(); }
  function icon(k, cls) { return SPR.img('icon_' + k, 1, cls); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function fillIcons(root) { (root || document).querySelectorAll('[data-icon]').forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute('data-icon')); }); }
  function heroName(id) { const h = state.heroes[id]; return AW.HERO[id].names[h ? h.form : 0]; }
  function rarityName(r) { return CT.RARITIES[r].name; }
  function stageLabel(def) { return def.kind === 'story' ? (def.r + 1) + '-' + (def.i + 1) : def.name; }
  function markDirty() { dirty = true; }

  function toast(html, cls, ms) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = html;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms || 2200);
  }
  function flashCur(id) { const el = $(id); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------
  function save() {
    if (!state || COVER) return;
    state.lastSeen = now();
    PF.set(SAVE_KEY, AW.serialize(state));
    dirty = false; lastSave = now();
  }
  function progressScore(s) { return AW.storyCleared(s) * 1000 + AW.clearedAll(s, 1) * 1000 + AW.clearedAll(s, 2) * 1000 + s.stats.battles + s.gacha.pulls; }
  function load() {
    const res = AW.parseSave(PF.get(SAVE_KEY), now());
    if (res && res.ok) return { state: res.state, fresh: false };
    return { state: AW.createState(now()), fresh: true };
  }
  // Adopt the cloud save when it is further along (e.g. the player switched devices).
  function adoptCloud() {
    const raw = PF.getCloud(SAVE_KEY);
    if (!raw) return;
    const res = AW.parseSave(raw, now());
    if (res && res.ok && progressScore(res.state) > progressScore(state)) {
      state = res.state;
      toast('Progress synced from your CrazyGames account', 'green');
      if (mode === 'home') enterHome();
    }
  }

  // ---------------------------------------------------------------------------
  // Modes: home, battle, menu panel
  // ---------------------------------------------------------------------------
  function setAppClass(m) {
    const app = $('app');
    app.classList.toggle('home', m === 'home');
    app.classList.toggle('battle', m === 'battle');
    app.classList.toggle('menu', m === 'menu');
    $('bhud').hidden = m !== 'battle';
    $('dock').hidden = m !== 'battle';
    $('panel').hidden = m !== 'menu';
    requestAnimationFrame(() => { R.resize(); });
  }

  function enterHome() {
    mode = 'home'; battle = null; panelName = null;
    setAppClass('home');
    R.resize();
    R.setHome(state, homeTheme());
    AU.play('home');
    PF.gameplayStop();
    refreshHome();
    setTimeout(homePopups, 300);
  }
  function homeTheme() { let r = 0; for (let i = 0; i < 8; i++) if (AW.regionOpen(state, 0, i)) r = i; return r; }

  function nextStory() {
    for (let r = 0; r < CT.REGIONS.length; r++) if (state.clear[0][r] < 12) return AW.stageDef(0, r, state.clear[0][r]);
    return null;
  }

  function refreshHome() {
    renderCurrencies();
    const n = nextStory();
    $('next-stage').textContent = n ? stageLabel(n) + ' · ' + n.name : 'Hard mode is open!';
    const name = (PF.user && PF.user.username) || '';
    $('greet').textContent = name ? 'Welcome back, ' + name + '!' : AW.storyCleared(state) ? 'The Gloom is spreading. Rally the animals!' : '';
    $('btn-battle').classList.toggle('pulse', AW.storyCleared(state) < 4);
    updateBadges();
  }

  function renderCurrencies() {
    $('cur-coins').querySelector('b').textContent = fmt(state.coins);
    $('cur-gems').querySelector('b').textContent = fmt(state.gems);
    $('cur-silver').querySelector('b').textContent = state.tickets.silver;
    $('cur-gold').querySelector('b').textContent = state.tickets.gold;
    const pc = $('panel-cur');
    if (pc && !$('panel').hidden) pc.innerHTML = curChip('coin', fmt(state.coins)) + curChip('gem', fmt(state.gems)) + curChip('silver', state.tickets.silver) + curChip('gold', state.tickets.gold);
  }
  function curChip(k, v) { return '<div class="cur">' + icon(k) + '<b class="num">' + v + '</b></div>'; }

  function badgeCounts() {
    const t = now();
    const c = {};
    c.hatch = (AW.welcomeReady(state) ? 1 : 0) + (AW.freeEggReady(state, t) && AW.storyCleared(state) >= 3 ? 1 : 0) + (state.gems >= 100 || state.tickets.gold > 0 ? 1 : 0) + (state.tickets.silver > 0 ? 1 : 0);
    let lv = 0;
    for (const id of state.lineup) if (id && (AW.canLevel(state, id) || AW.canEvolve(state, id))) lv++;
    c.army = lv;
    c.lab = CT.LAB.filter((l) => state.lab[l.id] < l.max && state.coins >= AW.labCost(l.id, state.lab[l.id])).length ? 1 : 0;
    let rw = AW.loginReady(state, t) ? 1 : 0;
    state.daily.missions.forEach((m) => { const i = AW.missionInfo(state, m); if (i.done && !i.claimed) rw++; });
    if (AW.missionBonusReady(state)) rw++;
    if (AW.farmPending(state, t).hours >= 2) rw++;
    c.rewards = rw;
    c.events = CT.EVENTS.filter((e) => AW.eventOpen(state, e.id, 0) && AW.eventEntriesLeft(state, e.id) > 0).length;
    c.tower = 0;
    c.medals = AW.medalList(state).filter((m) => m.ready).length;
    c.book = 0;
    return c;
  }
  function updateBadges() {
    const c = badgeCounts();
    document.querySelectorAll('#nav button').forEach((b) => {
      const k = b.getAttribute('data-go'), n = c[k] || 0, el = b.querySelector('.badge');
      el.hidden = !n; el.textContent = n > 9 ? '9+' : n;
      // Locked features stay hidden until they matter.
      const need = { hatch: 3, army: 1, lab: 2, rewards: 1, events: 6, tower: 12, medals: 2, book: 1 }[k] || 0;
      b.hidden = AW.storyCleared(state) < need && !DEBUG;
    });
  }

  // First things when arriving home: welcome-back coins, daily login, welcome hatch.
  function homePopups() {
    if (mode !== 'home' || !$('modal').hidden) return;
    if (AW.welcomeReady(state)) { welcomeHatchPrompt(); return; }
    if (AW.storyCleared(state) >= 1 && AW.loginReady(state, now())) { loginPrompt(); return; }
  }

  // ---------------------------------------------------------------------------
  // Battle
  // ---------------------------------------------------------------------------
  function startBattle(def, opts) {
    opts = opts || {};
    closeModal();
    const items = {};
    for (const k in (opts.items || {})) if (opts.items[k] && state.items[k] > 0) { state.items[k]--; items[k] = true; }
    if (def.kind === 'event' && !AW.useEventEntry(state, def.event)) { toast('No entries left today', 'pink'); return; }
    battleOpts = { def: def, items: items };
    battle = AW.createBattle(state, def, { items: items, seed: Math.floor(Math.random() * 1e9) });
    paused = false; acc = 0; ended = false; endT = 0;
    mode = 'battle';
    setAppClass('battle');
    R.resize();
    R.setBattle(battle);
    buildCards();
    $('bh-name').textContent = (def.kind === 'story' ? stageLabel(def) + ' ' : '') + def.name;
    $('btn-speed').textContent = '×' + state.settings.speed;
    $('btn-cam').classList.toggle('on', state.settings.autoCam);
    $('bossbar').hidden = true;
    AU.play('battle');
    callout(def.name, def.kind === 'story' ? CT.DIFFICULTIES[def.d].name + ' · ' + def.region : def.region);
    PF.gameplayStart();
    tutorial.step = (def.kind === 'story' && def.d === 0 && def.r === 0 && def.i === 0 && !state.flags.tutDone) ? 'deploy' : null;
    if (!tutorial.step && AW.storyCleared(state) === 1 && !state.flags.tutRoar) tutorial.step = 'watchRoar';
    markDirty();
  }

  function buildCards() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    $('cards').innerHTML = battle.slots.map((sl, i) => {
      if (!sl) return '<div class="card empty"></div>';
      const h = state.heroes[sl.id];
      return '<button type="button" class="card r' + sl.st.rarity + '" data-slot="' + i + '" title="' + esc(sl.st.name) + '">' + SPR.heroImg(sl.id, h.form, 2) +
        '<span class="key">' + keys[i] + '</span><span class="cost num">' + sl.st.cost + '</span><i class="cdv"></i></button>';
    }).join('');
    $('cards').querySelectorAll('.card[data-slot]').forEach((el) => { el._last = ''; });
  }

  function tryDeploy(i) {
    if (!battle || paused || battle.state !== 'play') return;
    const ev = [];
    if (AW.deploy(battle, i, ev)) { handleEvents(ev); if (tutorial.step === 'deploy') tutorial.step = 'pouchWait'; }
    else if (battle.slots[i]) AU.deny();
  }
  function tryPouch() {
    if (!battle || paused) return;
    const ev = [];
    if (AW.upgradePouch(battle, ev)) { handleEvents(ev); if (tutorial.step === 'pouch') tutorial.step = 'roarWait'; } else AU.deny();
  }
  function tryRoar() {
    if (!battle || paused) return;
    const ev = [];
    if (AW.roar(battle, ev)) { handleEvents(ev); if (tutorial.step === 'roar') { tutorial.step = null; state.flags.tutRoar = true; } } else AU.deny();
  }

  function handleEvents(ev) {
    for (const e of ev) {
      R.event(e);
      switch (e.t) {
        case 'deploy': AU.deploy(); break;
        case 'hit': if (e.crit) AU.crit(); else AU.hit(e.big); break;
        case 'kb': AU.kb(); break;
        case 'die': if (e.side === 1) { AU.pop(); if (e.drop) AU.acorn(); } else AU.heroDown(); break;
        case 'pouch': AU.pouch(); break;
        case 'roar': AU.roar(); break;
        case 'wave': AU.wave(); break;
        case 'towerHit': AU.tower(); break;
        case 'status': if (e.k === 'freeze') AU.freeze(); break;
        case 'boss': AU.boss(); AU.play('boss'); callout(CT.ENEMIES.find((x) => x.id === e.enemy).name, 'A boss appears!', true); break;
        case 'win': AU.win(); break;
        case 'lose': AU.lose(); break;
        default: break;
      }
    }
  }

  let calloutTimer = 0;
  function callout(title, sub, boss) {
    const el = $('callout');
    el.innerHTML = esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    el.classList.remove('show'); void el.offsetWidth;
    el.classList.add('show'); el.classList.toggle('boss', !!boss);
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function battleTick(dt) {
    if (!battle) return;
    if (!paused && battle.state === 'play') {
      acc += Math.min(0.1, dt) * state.settings.speed;
      const ev = [];
      const T = AW.CONFIG.tick;
      let n = 0;
      while (acc >= T && n < 12) { AW.step(battle, T, ev); acc -= T; n++; if (battle.state !== 'play') break; }
      if (ev.length) handleEvents(ev);
    }
    if (battle.state !== 'play' && !ended) {
      ended = true; endT = 0;
      PF.gameplayStop();
    }
    if (ended && !paused) {
      endT += dt;
      if (endT > 1.4 && endT - dt <= 1.4) { showResult(); if (!battle) return; }
    }
    updateBattleHud();
    updateTutorial();
  }

  function updateBattleHud() {
    const b = battle;
    const ac = Math.floor(b.pouch.acorns);
    $('bh-acorns').textContent = ac;
    $('bh-max').textContent = '/' + Math.floor(b.pouch.max);
    $('bh-acorns').parentNode.classList.toggle('full', ac >= Math.floor(b.pouch.max));
    $('bh-ally').style.width = (100 * b.ally.hp / b.ally.max) + '%';
    $('bh-ally-t').textContent = fmt(b.ally.hp) + '/' + fmt(b.ally.max);
    $('bh-enemy').style.width = (100 * b.enemy.hp / b.enemy.max) + '%';
    $('bh-enemy-t').textContent = fmt(b.enemy.hp) + '/' + fmt(b.enemy.max);
    // Pouch.
    const pmax = b.pouch.lvl >= AW.CONFIG.pouch.levels;
    $('pouch-lv').textContent = pmax ? 'MAX' : b.pouch.lvl;
    $('pouch-cost').textContent = pmax ? '—' : AW.pouchCost(b.pouch.lvl);
    $('btn-pouch').classList.toggle('can', AW.canPouch(b));
    $('btn-pouch').classList.toggle('max', pmax);
    $('pouch-fill').style.height = pmax ? '0' : Math.min(100, 100 * b.pouch.acorns / AW.pouchCost(b.pouch.lvl)) + '%';
    // Roar.
    $('roar-fill').style.height = (100 * b.roar.charge) + '%';
    $('btn-roar').classList.toggle('ready', b.roar.charge >= 1 && b.state === 'play');
    // Cards.
    const cards = $('cards').children;
    for (let i = 0; i < cards.length; i++) {
      const sl = b.slots[i], el = cards[i];
      if (!sl) continue;
      const cool = sl.cd > 0, poor = b.pouch.acorns < sl.st.cost;
      const key = (cool ? 'c' : poor ? 'p' : 'o') + Math.round(sl.cd * 10);
      if (el._last === key) continue;
      el._last = key;
      el.classList.toggle('cool', cool); el.classList.toggle('poor', !cool && poor); el.classList.toggle('ok', !cool && !poor);
      el.querySelector('.cdv').style.height = cool ? (100 * sl.cd / sl.cdMax) + '%' : '0';
    }
    // Boss bar.
    let boss = null;
    for (const e of b.ents) if (e.boss && e.side === 1 && e.state !== 'dead') { boss = e; break; }
    $('bossbar').hidden = !boss;
    if (boss) { $('boss-name').textContent = boss.st.name; $('boss-fill').style.width = (100 * Math.max(0, boss.hp) / boss.max) + '%'; }
  }

  // Tutorial pointer for the very first battles.
  function pointAt(el, text) {
    const tut = $('tut');
    if (!el) { tut.hidden = true; return; }
    tut.hidden = false;
    $('tut-text').textContent = text;
    const vr = $('view').getBoundingClientRect(), r = el.getBoundingClientRect();
    const w = tut.offsetWidth, h = tut.offsetHeight;
    const x = Math.max(6, Math.min(vr.width - w - 6, r.left + r.width / 2 - vr.left - w / 2));
    tut.style.left = x + 'px';
    tut.style.top = Math.max(6, Math.min(r.top - vr.top, vr.height) - h - 16) + 'px';
    tut.querySelector('.tut-arrow').style.left = Math.max(8, Math.min(w - 8, r.left + r.width / 2 - vr.left - x)) + 'px';
  }
  function updateTutorial() {
    const s = tutorial.step, b = battle;
    if (!s || !b || b.state !== 'play') { $('tut').hidden = true; return; }
    if (s === 'deploy') pointAt($('cards').children[0], 'Tap Pip to send him into battle!');
    else if (s === 'pouchWait') { $('tut').hidden = true; if (b.t > 10 && AW.canPouch(b)) tutorial.step = 'pouch'; }
    else if (s === 'pouch') pointAt($('btn-pouch'), 'Upgrade your pouch to earn acorns faster!');
    else if (s === 'roarWait' || s === 'watchRoar') { $('tut').hidden = true; if (b.roar.charge >= 1 && b.ents.some((e) => e.side === 1 && e.state !== 'dead' && e.x < 260)) tutorial.step = 'roar'; }
    else if (s === 'roar') pointAt($('btn-roar'), 'Mega Roar is ready! Blast the Gloom back!');
  }

  function pause(on) {
    if (!battle || ended) return;
    paused = on;
    if (on) {
      PF.gameplayStop();
      openModal('Paused', '<div class="toggle"><span>Music</span>' + toggleBtn('music') + '</div><div class="toggle"><span>Sound effects</span>' + toggleBtn('sfx') + '</div>' +
        '<p class="small">Tip: drag the battlefield to look around. Keys 1-0 deploy, E pouch, R roar, F speed.</p>',
        [['Quit', 'red', () => { closeModal(); quitBattle(); }], ['Retry', '', () => { closeModal(); const o = battleOpts; startBattle(o.def, {}); }], ['Resume', 'gold', () => { closeModal(); }]],
        () => { paused = false; PF.gameplayStart(); });
      bindToggles();
    }
  }
  function quitBattle() {
    // Leaving counts as a defeat (rewards for damage dealt are still paid).
    battle.state = 'lost';
    AW.finishBattle(state, battle);
    battle = null; save();
    enterHome();
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function showResult() {
    const b = battle;
    if (!b) return;
    if (b.state === 'lost' && !b.revived && PF.canRewarded()) { defeatPrompt(); return; }
    finishAndShow();
  }

  function defeatPrompt() {
    AU.play('home');
    openModal('', '<p class="result-title lose">Defeat</p><p style="text-align:center">Your burrow fell. Watch an ad for a <b class="warn">Second Wind</b>: the burrow is restored to 60%, every enemy is blown back and Mega Roar is charged.</p>',
      [['No thanks', '', () => { closeModal(); finishAndShow(); }], ['Second Wind', 'gold ad', () => {
        PF.rewarded((ok) => {
          if (ok && AW.revive(battle)) { closeModal(); ended = false; endT = 0; AU.play('battle'); PF.gameplayStart(); toast('<b>Second Wind!</b> Back into the fight', 'green'); }
          else { toast('The ad did not finish', 'pink'); }
        });
      }]], null, true);
  }

  function finishAndShow() {
    const b = battle, def = b.def;
    const res = AW.finishBattle(state, b);
    save();
    if (def.kind === 'tower' && res.won) PF.submitScore(state.tower);
    if (res.won && (res.regionClear || def.boss)) PF.happytime();
    AU.play('home');
    const won = res.won;
    let html = '<p class="result-title' + (won ? '' : ' lose') + '">' + (won ? 'Victory!' : 'Defeat') + '</p>';
    if (def.kind === 'story' && won) {
      html += '<div class="rstars">' + [1, 2, 4].map((m, i) => '<img class="px' + ((res.stars & m) ? ' pop' : '') + '" style="animation-delay:' + (i * 0.25) + 's" src="' + SPR.url((res.stars & m) ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</div>';
      html += '<div class="goals" style="align-items:center">' + starGoals(def, res.stars, true) + '</div>';
      [1, 2, 4].forEach((m, i) => { if (res.stars & m) setTimeout(() => AU.star(i), 300 + i * 250); });
    }
    const loot = [];
    if (res.coins) loot.push('<span>' + icon('coin') + '+' + fmt(res.coins) + '</span>');
    if (res.gems) loot.push('<span class="new">' + icon('gem') + '+' + res.gems + '</span>');
    if (res.silver) loot.push('<span class="new">' + icon('silver') + '+' + res.silver + '</span>');
    if (res.gold) loot.push('<span class="new">' + icon('gold') + '+' + res.gold + '</span>');
    if (res.seeds) loot.push('<span class="new">' + icon('seed') + '+' + res.seeds + '</span>');
    if (res.fruit) loot.push('<span class="new">' + icon('fruit') + '+' + res.fruit + '</span>');
    res.items.forEach((it) => loot.push('<span class="new">' + icon(it) + CT.ITEMS.find((x) => x.id === it).name + '</span>'));
    if (loot.length) html += '<div class="loot">' + loot.join('') + '</div>';
    res.unlocked.forEach((id) => { html += '<div class="loot"><span class="new">' + SPR.heroImg(id, 0, 1) + ' ' + esc(AW.HERO[id].names[0]) + ' joined your army!</span></div>'; });
    if (res.regionClear) html += '<p class="tip-line">' + esc(CT.REGIONS[def.r].name) + ' is free! ' + (def.d === 0 && def.r < 7 ? esc(CT.REGIONS[def.r + 1].name) + ' and Hard mode are open.' : 'The next difficulty is open.') + '</p>';
    if (!won) html += '<p class="tip-line">' + defeatTip() + '</p>';
    const acts = [];
    if (won && res.coins >= 100 && PF.canRewarded()) acts.push(['×2 coins', 'gold ad', (btn) => {
      PF.rewarded((ok) => { if (ok) { state.coins += res.coins; state.stats.coinsEarned += res.coins; save(); toast('+' + fmt(res.coins) + ' coins', 'green'); btn.disabled = true; renderCurrencies(); } });
    }, true]);
    acts.push(['Home', '', () => leaveResult(() => enterHome())]);
    if (!won) acts.push(['Upgrade', 'blue', () => leaveResult(() => { enterHome(); openPanel('army'); })]);
    acts.push(['Retry', won ? '' : 'gold', () => leaveResult(() => startBattle(def, {}))]);
    if (won) {
      const next = nextAfter(def);
      if (next) acts.push(['Next', 'gold', () => leaveResult(() => openStage(next))]);
    }
    if (res.unlocked.length) toast(res.unlocked.map((id) => '<b>' + esc(AW.HERO[id].names[0]) + '</b> joined!').join(' '), 'green', 3500);
    openModal('', html, acts, null, true);
    battle = null;
  }

  function defeatTip() {
    const tips = ['Level up your heroes in the Army.', 'Upgrade the Lab: Training Grounds makes every hero stronger.', 'Hatch eggs for stronger heroes.', 'Keep cheap walls like Pip and Shelly coming while saving for big hitters.', 'Upgrade your pouch early to earn acorns faster.', 'Save Mega Roar for when the Gloom reaches your burrow.'];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  function nextAfter(def) {
    if (def.kind === 'story') {
      if (def.i < 11) return AW.stageOpen(state, def.d, def.r, def.i + 1) ? AW.stageDef(def.d, def.r, def.i + 1) : null;
      if (def.d === 0 && def.r < 7) return AW.stageDef(0, def.r + 1, 0);
      return null;
    }
    if (def.kind === 'tower') return AW.towerDef(state.tower + 1);
    return null;
  }

  // A break ad between battles (respecting the platform's own frequency rules), then carry on.
  function leaveResult(next) {
    closeModal();
    if (AW.storyCleared(state) >= 3) PF.midgame(() => next()); else next();
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  let modalOnClose = null;
  function openModal(title, html, actions, onClose, noX) {
    $('modal-title').textContent = title || '';
    $('modal-title').hidden = !title;
    $('modal-body').innerHTML = html;
    const box = $('modal-actions');
    box.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a[1] || '');
      b.innerHTML = a[0];
      b.addEventListener('click', () => { AU.click(); a[2](b); });
      box.appendChild(b);
    });
    $('modal-x').hidden = !!noX;
    modalOnClose = onClose || null;
    $('modal').hidden = false;
    fillIcons($('modal'));
  }
  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    const f = modalOnClose; modalOnClose = null;
    if (f) f();
  }

  function toggleBtn(k) { const on = k === 'music' ? state.settings.music : k === 'sfx' ? state.settings.sfx : state.settings.autoCam; return '<button type="button" data-toggle="' + k + '" class="' + (on ? 'on' : '') + '">' + (on ? 'On' : 'Off') + '</button>'; }
  function bindToggles() {
    document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const k = b.getAttribute('data-toggle');
      if (k === 'music') { state.settings.music = !state.settings.music; AU.setMusic(state.settings.music); }
      if (k === 'sfx') { state.settings.sfx = !state.settings.sfx; AU.setSfx(state.settings.sfx); }
      if (k === 'cam') { state.settings.autoCam = !state.settings.autoCam; }
      const on = k === 'music' ? state.settings.music : k === 'sfx' ? state.settings.sfx : state.settings.autoCam;
      b.classList.toggle('on', on); b.textContent = on ? 'On' : 'Off';
      AU.click(); markDirty();
    }));
  }

  // ---------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------
  const PANELS = {
    map: { title: 'World Map', render: renderMap },
    hatch: { title: 'Hatchery', render: renderHatch },
    army: { title: 'Army', render: renderArmy },
    lab: { title: 'Lab', render: renderLab },
    rewards: { title: 'Rewards', render: renderRewards },
    events: { title: 'Daily Events', render: renderEvents },
    tower: { title: 'Gloom Tower', render: renderTower },
    medals: { title: 'Medals', render: renderMedals },
    book: { title: 'Book', render: renderBook }
  };
  function openPanel(name) {
    if (!PANELS[name]) return;
    panelName = name; mode = 'menu';
    setAppClass('menu');
    $('panel-title').textContent = PANELS[name].title;
    rerender();
    $('panel-body').scrollTop = 0;
  }
  function rerender() {
    if (!panelName) return;
    const top = $('panel-body').scrollTop;
    PANELS[panelName].render($('panel-body'));
    fillIcons($('panel-body'));
    renderCurrencies();
    $('panel-body').scrollTop = top;
  }
  function closePanel() { swapPick = null; enterHome(); }
  function on(root, sel, fn) { root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { AU.click(); fn(el, e); })); }

  // --- Map --------------------------------------------------------------------
  const CHEST_TIERS = [12, 24, 36];
  function chestReward(d, r, k) {
    if (k === 0) return { gems: 100 * (d + 1) };
    if (k === 1) return { silver: 2 + d, coins: 3000 * (r + 1) * (d + 1) };
    return { gold: 1, gems: 200 * (d + 1) };
  }
  function rewardText(o) {
    const out = [];
    if (o.gems) out.push(icon('gem') + o.gems);
    if (o.coins) out.push(icon('coin') + fmt(o.coins));
    if (o.silver) out.push(icon('silver') + o.silver);
    if (o.gold) out.push(icon('gold') + o.gold);
    if (o.seeds) out.push(icon('seed') + o.seeds);
    if (o.fruit) out.push(icon('fruit') + o.fruit);
    return out.join(' ');
  }
  function rewardChips(o) {
    const out = [];
    const add = (k, v) => out.push('<span>' + icon(k) + v + '</span>');
    if (o.coins) add('coin', fmt(o.coins));
    if (o.gems) add('gem', o.gems);
    if (o.silver) add('silver', o.silver);
    if (o.gold) add('gold', o.gold);
    if (o.seeds) add('seed', o.seeds);
    if (o.fruit) add('fruit', o.fruit);
    return out.join('');
  }
  function grant(o) {
    if (o.gems) { state.gems += o.gems; flashCur('cur-gems'); }
    if (o.coins) { state.coins += o.coins; state.stats.coinsEarned += o.coins; }
    if (o.silver) state.tickets.silver += o.silver;
    if (o.gold) state.tickets.gold += o.gold;
    if (o.seeds) state.seeds += o.seeds;
    if (o.fruit) state.fruit += o.fruit;
  }

  function renderMap(el) {
    const d = ui.mapDiff;
    let r = ui.mapRegion;
    if (!AW.regionOpen(state, d, r)) { r = 0; for (let i = 0; i < 8; i++) if (AW.regionOpen(state, d, i)) r = i; ui.mapRegion = r; }
    const R0 = CT.REGIONS[r], th = window.AWRender.THEMES[R0.theme];
    let h = '<div class="tabs">' + CT.DIFFICULTIES.map((D) => {
      const open = AW.regionOpen(state, D.id, 0);
      return '<button type="button" data-diff="' + D.id + '" class="' + (D.id === d ? 'on' : '') + (open ? '' : ' locked') + '">' + (open ? '' : icon('lock') + ' ') + D.name + '</button>';
    }).join('') + '</div>';
    h += '<div class="tabs">' + CT.REGIONS.map((Rg, i) => {
      const open = AW.regionOpen(state, d, i);
      return '<button type="button" data-region="' + i + '" class="' + (i === r ? 'on' : '') + (open ? '' : ' locked') + '">' + (open ? (i + 1) + ' ' + esc(Rg.name) : icon('lock') + ' ' + (i + 1)) + '<span class="tb-s">' + (open ? AW.regionStars(state, d, i) + '★' : '') + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="region-art" style="background:linear-gradient(180deg,' + th.sky[0] + ',' + th.sky[1] + ' 55%,' + th.far + ' 56%,' + th.mid + ' 78%,' + th.ground + ' 79%)">' +
      '<h3>' + esc(R0.name) + '</h3><div class="ra-stars">' + icon('star') + AW.regionStars(state, d, r) + ' / 36</div></div>';
    const stars = AW.regionStars(state, d, r);
    h += '<div class="chests">' + CHEST_TIERS.map((need, k) => {
      const done = !!state.flags['chest' + d + r + k];
      const ready = !done && stars >= need;
      return '<div class="chest ' + (done ? 'done' : ready ? 'ready' : '') + '" data-chest="' + k + '">' + icon('gift') + '<span>' + need + '★: ' + rewardText(chestReward(d, r, k)) + (done ? ' ✓' : '') + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="stages">';
    for (let i = 0; i < 12; i++) {
      const open = AW.stageOpen(state, d, r, i), mask = state.stars[AW.stageKey(d, r, i)] || 0;
      const next = open && state.clear[d][r] === i;
      h += '<button type="button" class="stage' + (open ? '' : ' locked') + (next ? ' next' : '') + '" data-stage="' + i + '">' +
        '<span class="sn">' + (r + 1) + '-' + (i + 1) + '</span><span class="st">' + esc(R0.names[i]) + '</span>' +
        (i === 11 ? '<span class="boss-tag">BOSS</span>' : i === 5 ? '<span class="boss-tag" style="color:var(--peach)">BRUTE</span>' : '') +
        '<span class="ss">' + [1, 2, 4].map((m) => '<img class="px" src="' + SPR.url((mask & m) ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</span></button>';
    }
    h += '</div>';
    el.innerHTML = h;
    on(el, '[data-diff]', (b) => { const v = Number(b.getAttribute('data-diff')); if (!AW.regionOpen(state, v, 0)) { toast('Clear ' + CT.REGIONS[0].name + ' on ' + CT.DIFFICULTIES[v - 1].name + ' first', 'pink'); return; } ui.mapDiff = v; rerender(); });
    on(el, '[data-region]', (b) => { const v = Number(b.getAttribute('data-region')); if (!AW.regionOpen(state, d, v)) { toast('Beat the boss of ' + CT.REGIONS[Math.max(0, v - 1)].name + (d ? ' on ' + CT.DIFFICULTIES[d - 1].name : '') + ' first', 'pink'); return; } ui.mapRegion = v; rerender(); });
    on(el, '[data-stage]', (b) => { const i = Number(b.getAttribute('data-stage')); if (!AW.stageOpen(state, d, r, i)) { AU.deny(); return; } openStage(AW.stageDef(d, r, i)); });
    on(el, '.chest.ready', (b) => {
      const k = Number(b.getAttribute('data-chest'));
      const rw = chestReward(d, r, k);
      state.flags['chest' + d + r + k] = true; grant(rw); AU.claim(); save();
      toast('Star chest: ' + rewardText(rw), 'green'); rerender();
    });
  }

  function starGoals(def, mask, result) {
    const g = [['Win the battle', 1], ['Keep your burrow above 50%', 2], ['Win within ' + Math.floor(def.par / 60) + ':' + String(def.par % 60).padStart(2, '0'), 4]];
    return g.map((x) => '<div>' + '<img class="px" src="' + SPR.url((mask & x[1]) ? 'icon_star' : 'icon_starOff') + '" alt=""> <span class="' + ((mask & x[1]) ? '' : 'small') + '">' + x[0] + '</span></div>').join('');
  }

  function foesOf(def) {
    const seen = {}, out = [];
    for (const l of def.lines) if (!seen[l.e]) { seen[l.e] = 1; out.push({ id: l.e, boss: !!l.boss }); } else if (l.boss) out.find((o) => o.id === l.e).boss = true;
    return out;
  }
  function foesHtml(def) {
    return '<div class="foes">' + foesOf(def).map((f) => {
      const e = AW.ENEMY[f.id], known = state.seen[f.id];
      return '<div class="foe' + (f.boss ? ' boss' : '') + '">' + SPR.enemyImg(f.id, 1, known ? '' : 'unk') + '<span>' + (known ? esc(e.name) : '???') + '</span></div>';
    }).join('') + '</div>';
  }

  function itemsHtml() {
    return '<div class="items">' + CT.ITEMS.map((it) => '<button type="button" class="item' + (ui.items[it.id] ? ' on' : '') + (state.items[it.id] ? '' : ' none') + '" data-item="' + it.id + '" title="' + esc(it.desc) + '">' + icon(it.id) + '<span>' + esc(it.name) + ' <b>×' + state.items[it.id] + '</b></span></button>').join('') + '</div>';
  }
  function lineupMini() {
    return '<div class="lineup-mini">' + state.lineup.map((id) => id ? '<span>' + SPR.heroImg(id, state.heroes[id].form, 1) + '</span>' : '<span class="empty"></span>').join('') + '</div>';
  }

  function openStage(def) {
    if (mode !== 'menu' && mode !== 'home') enterHome();
    const D = CT.DIFFICULTIES[def.d || 0];
    const mask = def.kind === 'story' ? (state.stars[def.key] || 0) : 0;
    const first = def.kind === 'story' && state.clear[def.d][def.r] === def.i;
    for (const k in ui.items) if (!state.items[k]) ui.items[k] = false;
    let h = '';
    if (def.kind === 'story') h += '<p class="small">' + esc(def.region) + ' · <span style="color:' + D.color + '">' + D.name + '</span></p>';
    h += '<div class="sec"><h3>Gloom</h3></div>' + foesHtml(def);
    if (def.kind === 'story') h += '<div class="sec"><h3>Stars</h3></div><div class="goals">' + starGoals(def, mask) + '</div>';
    const rw = { coins: def.coins };
    if (first) rw.gems = def.gems;
    if (def.kind === 'tower' && state.tower === def.floor - 1) { rw.gems = def.gems; rw.gold = def.gold; }
    if (def.kind === 'event') Object.assign(rw, def.rewards);
    h += '<div class="sec"><h3>Rewards</h3><span class="sub">' + (first ? 'First clear bonus included' : '') + '</span></div><div class="loot" style="justify-content:flex-start">' + rewardChips(rw) + '</div>';
    h += '<div class="sec"><h3>Boosts</h3><span class="sub">Tap to use one</span></div>' + itemsHtml();
    h += '<div class="sec"><h3>Lineup</h3><button type="button" class="btn sm" id="edit-lineup">Edit</button></div>' + lineupMini();
    const label = def.kind === 'story' ? stageLabel(def) + ' · ' + def.name : def.name;
    openModal(label, h, [['Battle!', 'gold', () => startBattle(def, { items: Object.assign({}, ui.items) })]]);
    const body = $('modal-body');
    on(body, '[data-item]', (b) => {
      const k = b.getAttribute('data-item');
      if (!state.items[k]) { toast('Buy boosts in Rewards, or find them in battle', 'pink'); return; }
      ui.items[k] = !ui.items[k]; b.classList.toggle('on', ui.items[k]);
    });
    $('edit-lineup').addEventListener('click', () => { closeModal(); openPanel('army'); });
  }

  // --- Hatchery -------------------------------------------------------------
  function renderHatch(el) {
    const day = AW.dayNumber(now());
    const f = AW.featured(day);
    const t = now();
    let h = '';
    if (AW.welcomeReady(state)) h += '<div class="box hot row"><div class="grow"><b class="warn">Welcome gift!</b><div class="small">A free ×10 Royal hatch with at least one Epic hero.</div></div><button type="button" class="btn gold pulse" id="welcome">Hatch ×10 free</button></div>';
    const royal = AW.BANNER.royal;
    h += '<div class="banner royal"><div class="bn-eggs">' + SPR.img('egg_3', 3) + '</div><div class="bn-info"><h3>Royal Nest</h3><p>' + esc(royal.desc) + '</p>' +
      '<div class="feat">' + [f.legend, f.mythic, f.epic].filter(Boolean).map((id) => '<span>' + SPR.heroImg(id, 0, 1) + '<b class="rc' + AW.HERO[id].rarity + '">' + esc(AW.HERO[id].names[0]) + '</b> rate up</span>').join('') + '</div>' +
      '<div class="pity">Mythic or better guaranteed within ' + (royal.pity.mythic - state.gacha.sinceMythic) + ' hatches · Legend within ' + (royal.pity.legend - state.gacha.sinceLegend) + '</div>' +
      '<div class="bn-btns"><button type="button" class="btn pink" data-hatch="royal" data-n="1">×1 ' + (state.tickets.gold > 0 ? icon('gold') + '1' : icon('gem') + royal.cost) + '</button>' +
      '<button type="button" class="btn gold" data-hatch="royal" data-n="10">×10 ' + (state.tickets.gold >= 10 ? icon('gold') + '10' : icon('gem') + royal.cost10) + '</button></div></div></div>';
    const silverFree = AW.freeEggReady(state, t);
    h += '<div class="banner silver"><div class="bn-eggs">' + SPR.img('egg_1', 3) + '</div><div class="bn-info"><h3>Meadow Nest</h3><p>' + esc(AW.BANNER.silver.desc) + ' You have <b>' + state.tickets.silver + '</b> Silver Eggs.</p>' +
      '<div class="bn-btns"><button type="button" class="btn green' + (silverFree ? ' pulse' : '') + '" id="free-egg"' + (silverFree ? '' : ' disabled') + '>' + (silverFree ? 'Free egg!' : 'Free egg in ' + timeLeft(state.gacha.freeAt - t)) + '</button>' +
      '<button type="button" class="btn blue" data-hatch="silver" data-n="1">×1 ' + icon('silver') + '1</button>' +
      '<button type="button" class="btn blue" data-hatch="silver" data-n="10">×10 ' + icon('silver') + '10</button></div></div></div>';
    h += '<div class="box rates"><b class="warn">Odds</b><br>' + CT.BANNERS.map((B) => esc(B.name) + ': ' + [1, 2, 3, 4].filter((r) => B.rates[r]).map((r) => '<b class="rc' + r + '">' + rarityName(r) + ' ' + B.rates[r] + '%</b>').join(' · ')).join('<br>') +
      '<br>Rate up: a featured hero gets half of its rarity\'s chance. A ×10 Royal hatch always includes an Epic or better. Duplicates give +1 level (up to +20), then coins.<br>Gems and eggs are only ever earned by playing. Featured heroes change every day.</div>';
    el.innerHTML = h;
    on(el, '[data-hatch]', (b) => doHatch(b.getAttribute('data-hatch'), Number(b.getAttribute('data-n'))));
    const w = el.querySelector('#welcome'); if (w) w.addEventListener('click', () => { const res = AW.claimWelcome(state, Math.random, AW.dayNumber(now())); if (res) { save(); showHatch(res); } });
    const fe = el.querySelector('#free-egg'); if (fe) fe.addEventListener('click', () => { const res = AW.claimFreeEgg(state, now(), Math.random); if (res) { save(); showHatch(res); } });
  }
  function timeLeft(ms) { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000); return h ? h + 'h ' + m + 'm' : m + 'm'; }

  function doHatch(banner, n) {
    if (!AW.canHatch(state, banner, n)) {
      AU.deny();
      toast(banner === 'royal' ? 'Not enough gems: earn them by clearing stages, missions and medals' : 'Not enough Silver Eggs', 'pink');
      return;
    }
    const res = AW.hatch(state, banner, n, Math.random, AW.dayNumber(now()));
    if (!res) return;
    save();
    showHatch(res);
  }

  // The hatch show: each egg wobbles, cracks and reveals its hero. Skip jumps to the summary.
  let hatchQ = null;
  function showHatch(results) {
    hatchQ = { list: results, i: 0, phase: 'egg' };
    $('hatchery').hidden = false;
    AU.play('home');
    hatchStep();
  }
  function hatchStep() {
    const q = hatchQ;
    if (!q) return;
    const st = $('h-stage'), info = $('h-info'), rays = $('h-rays');
    if (q.i >= q.list.length) { hatchSummary(); return; }
    const r = q.list[q.i];
    if (q.phase === 'egg') {
      rays.classList.remove('on');
      st.innerHTML = '<div class="egg wob">' + SPR.img('egg_' + Math.max(1, r.rarity), 6) + '</div>';
      info.innerHTML = '<div class="small">Egg ' + (q.i + 1) + ' of ' + q.list.length + '</div>';
      $('h-next').textContent = 'Crack!';
      $('h-skip').hidden = q.list.length < 2;
      AU.shake();
      q.phase = 'crack';
      return;
    }
    if (q.phase === 'crack') {
      AU.crack();
      st.innerHTML = '<div class="egg">' + SPR.img('egg_' + Math.max(1, r.rarity) + '_c', 6) + '</div>';
      q.phase = 'reveal';
      setTimeout(() => { if (hatchQ === q && q.phase === 'reveal') hatchStep(); }, 380);
      return;
    }
    if (q.phase === 'reveal') {
      const def = AW.HERO[r.id];
      rays.style.setProperty('--rc', SPR.RARITY_HEX[r.rarity]);
      rays.classList.toggle('on', r.rarity >= 2);
      st.innerHTML = '<div class="got">' + SPR.heroImg(r.id, 0, def.look.s >= 36 ? 4 : 5) + '</div>';
      info.innerHTML = '<div class="hr rc' + r.rarity + '">' + rarityName(r.rarity) + '</div><div class="hn">' + esc(def.names[0]) + '</div><div class="hx">' + (r.isNew ? 'NEW HERO!' : r.plus ? 'Duplicate: +1 level' : '+' + fmt(r.coins) + ' coins') + '</div>';
      AU.reveal(r.rarity);
      if (r.rarity >= 3) PF.happytime();
      $('h-next').textContent = q.i + 1 < q.list.length ? 'Next' : 'OK';
      q.phase = 'next';
      return;
    }
    if (q.phase === 'next') { q.i++; q.phase = 'egg'; hatchStep(); }
  }
  function hatchSummary() {
    const q = hatchQ;
    if (q.list.length === 1) { endHatch(); return; }
    $('h-rays').classList.remove('on');
    $('h-stage').innerHTML = '<div class="sum">' + q.list.map((r) => '<div class="hero r' + r.rarity + '"><div class="hi">' + SPR.heroImg(r.id, 0, 1) + '</div><div class="hn">' + esc(AW.HERO[r.id].names[0]) + '</div>' + (r.isNew ? '<span class="new-tag">NEW</span>' : '') + '</div>').join('') + '</div>';
    const best = Math.max.apply(null, q.list.map((r) => r.rarity));
    $('h-info').innerHTML = '<div class="hr rc' + best + '">Best: ' + rarityName(best) + '</div>';
    $('h-next').textContent = 'OK'; $('h-skip').hidden = true;
    q.phase = 'done';
  }
  function endHatch() { hatchQ = null; $('hatchery').hidden = true; if (panelName) rerender(); else refreshHome(); }

  // --- Army -----------------------------------------------------------------
  function renderArmy(el) {
    let h = '<div class="sec"><h3>Lineup</h3><span class="sub">' + (swapPick ? 'Tap a slot for <b class="warn">' + esc(heroName(swapPick)) + '</b>' : 'Tap a slot to remove a hero') + '</span><button type="button" class="btn sm" id="autofill">Auto-fill</button></div>';
    h += '<div class="lineup">' + state.lineup.map((id, i) => id ? '<button type="button" class="slot' + (swapPick ? ' pick' : '') + '" data-slot="' + i + '">' + SPR.heroImg(id, state.heroes[id].form, 1) + '<span class="lv">' + (state.heroes[id].lvl + state.heroes[id].plus) + '</span></button>' : '<button type="button" class="slot empty' + (swapPick ? ' pick' : '') + '" data-slot="' + i + '">+</button>').join('') + '</div>';
    h += '<div class="sec"><h3>Heroes <span class="sub">' + AW.ownedCount(state) + ' / ' + CT.HEROES.length + '</span></h3><div class="tabs">' + [-1, 0, 1, 2, 3, 4].map((r) => '<button type="button" data-filter="' + r + '" class="' + (ui.armyFilter === r ? 'on' : '') + '">' + (r < 0 ? 'All' : rarityName(r)) + '</button>').join('') + '</div></div>';
    const list = CT.HEROES.filter((d) => ui.armyFilter < 0 || d.rarity === ui.armyFilter).slice().sort((a, b) => {
      const oa = state.heroes[a.id] ? 1 : 0, ob = state.heroes[b.id] ? 1 : 0;
      return ob - oa || b.rarity - a.rarity;
    });
    h += '<div class="roster">' + list.map(heroTile).join('') + '</div>';
    h += '<p class="small">Heroes level up with coins. Evolve at level 10, and again at level 20 with Growth Seeds or Star Fruit from the Seed Grove event. Duplicates add bonus levels.</p>';
    el.innerHTML = h;
    on(el, '[data-slot]', (b) => {
      const i = Number(b.getAttribute('data-slot'));
      if (swapPick) {
        const old = state.lineup.indexOf(swapPick);
        if (old >= 0) state.lineup[old] = state.lineup[i];
        state.lineup[i] = swapPick; swapPick = null;
      } else if (state.lineup[i]) {
        if (state.lineup.filter(Boolean).length <= 1) { toast('Keep at least one hero', 'pink'); return; }
        state.lineup[i] = null;
      } else return;
      markDirty(); rerender();
    });
    on(el, '[data-filter]', (b) => { ui.armyFilter = Number(b.getAttribute('data-filter')); rerender(); });
    on(el, '[data-hero]', (b) => openHero(b.getAttribute('data-hero')));
    el.querySelector('#autofill').addEventListener('click', () => { autoFill(); markDirty(); rerender(); });
  }
  function heroTile(d) {
    const h = state.heroes[d.id];
    if (!h) return '<button type="button" class="hero locked" data-hero="' + d.id + '"><div class="hi">' + SPR.heroImg(d.id, 0, 1) + '</div><div class="hn">???</div><div class="hl rc' + d.rarity + '">' + rarityName(d.rarity) + '</div></button>';
    const inl = state.lineup.indexOf(d.id) >= 0;
    const up = AW.canLevel(state, d.id) || AW.canEvolve(state, d.id);
    return '<button type="button" class="hero r' + d.rarity + '" data-hero="' + d.id + '">' + (inl ? '<span class="inl">IN</span>' : '') + (up ? '<span class="up"></span>' : '') +
      '<div class="hi">' + SPR.heroImg(d.id, h.form, 1) + '</div><div class="hn">' + esc(d.names[h.form]) + '</div><div class="hl">Lv ' + h.lvl + (h.plus ? '<span class="good">+' + h.plus + '</span>' : '') + '</div></button>';
  }
  function autoFill() {
    const ids = Object.keys(state.heroes);
    const power = (id) => { const s = AW.heroStats(state, id); return s.hp * s.atk / s.rate / Math.max(60, s.cost); };
    const walls = ids.slice().sort((a, b) => AW.HERO[a].cost - AW.HERO[b].cost || power(b) - power(a)).slice(0, 2);
    const rest = ids.filter((id) => walls.indexOf(id) < 0).sort((a, b) => power(b) - power(a)).slice(0, 8).sort((a, b) => AW.HERO[a].cost - AW.HERO[b].cost);
    const line = walls.concat(rest);
    while (line.length < 10) line.push(null);
    state.lineup = line;
  }

  function abilityLines(st) {
    const ab = st.ab, T = (l) => l.map((t) => t === 'all' ? 'every trait' : CT.TRAITS[t].name).join(', ');
    const out = [st.area ? 'Area attack: hits everything in reach' : 'Single target'];
    if (ab.strong) out.push('Strong against ' + T(ab.strong) + ' (1.5× damage, takes half)');
    if (ab.massive) out.push('Massive damage to ' + T(ab.massive) + ' (3×)');
    if (ab.resist) out.push('Resists ' + T(ab.resist) + ' (takes ¼ damage)');
    if (ab.crit) out.push(Math.round(ab.crit * 100) + '% critical hit (2×, pierces armor)');
    if (ab.kb) out.push(Math.round(ab.kb * 100) + '% chance to knock back');
    if (ab.freeze) out.push(Math.round(ab.freeze[0] * 100) + '% chance to freeze for ' + ab.freeze[1] + 's');
    if (ab.slow) out.push(Math.round(ab.slow[0] * 100) + '% chance to slow for ' + ab.slow[1] + 's');
    if (ab.weaken) out.push(Math.round(ab.weaken[0] * 100) + '% chance to halve attack for ' + ab.weaken[1] + 's');
    if (ab.wave) out.push(Math.round(ab.wave[0] * 100) + '% chance of a level ' + ab.wave[1] + ' wave');
    if (ab.multi) out.push('Hits ' + ab.multi + ' times per attack');
    if (ab.base) out.push(ab.base + '× damage to Gloom towers');
    if (ab.survive) out.push('Survives a fatal hit once');
    if (ab.burrow) out.push('Burrows past the first enemy it meets');
    if (ab.zkill) out.push('Zombie Slayer: Undead stay down');
    if (ab.immune) out.push('Immune to ' + ab.immune.map((x) => ({ kb: 'knockback', freeze: 'freeze', slow: 'slow', weaken: 'weaken' })[x]).join(', '));
    return out;
  }

  function openHero(id) {
    const def = AW.HERO[id], own = state.heroes[id];
    const form = own ? own.form : 0;
    const st = AW.heroStats(state, id);
    let h = '<div class="hd"><div class="hd-art r' + def.rarity + '">' + SPR.heroImg(id, form, def.look.s >= 36 ? 3 : 4) + '</div><div class="hd-info">';
    h += '<div class="hd-r rc' + def.rarity + '">' + rarityName(def.rarity) + '</div>';
    if (own) {
      h += '<div>Level <b class="warn">' + own.lvl + '</b>' + (own.plus ? ' <b class="good">+' + own.plus + '</b>' : '') + ' / ' + AW.CONFIG.maxLevel + '</div>';
      h += '<div class="forms">' + [0, 1, 2].map((f) => '<span class="' + (f === form ? 'on' : '') + (f > form ? ' lock' : '') + '" title="' + esc(def.names[f]) + '">' + SPR.heroImg(id, f, 1) + '</span>').join('') + '</div>';
    } else {
      h += '<div class="small">' + (def.rarity === 0 && def.unlock ? 'Joins after you clear stage ' + (def.unlock[0] + 1) + '-' + (def.unlock[1] + 1) + '.' : 'Hatch it in the ' + (def.rarity === 4 ? 'Royal Nest' : 'Royal or Meadow Nest') + '.') + '</div>';
    }
    h += '<p class="small" style="margin:0">' + esc(def.desc) + '</p></div></div>';
    const nxt = own && own.lvl < AW.CONFIG.maxLevel ? AW.heroStats(state, id, { lvl: own.lvl + 1, plus: own.plus, form: own.form }) : null;
    const d = (k) => nxt ? '<em>+' + fmt(nxt[k] - st[k]) + '</em>' : '';
    h += '<div class="stats">' +
      '<div><span>Health</span><b>' + fmt(st.hp) + d('hp') + '</b></div><div><span>Attack</span><b>' + fmt(st.atk) + d('atk') + '</b></div>' +
      '<div><span>DPS</span><b>' + fmt(Math.round(st.atk / st.rate)) + '</b></div><div><span>Reach</span><b>' + st.rng + '</b></div>' +
      '<div><span>Speed</span><b>' + st.spd + '</b></div><div><span>Cost</span><b>' + st.cost + '</b></div>' +
      '<div><span>Cooldown</span><b>' + st.cd.toFixed(1) + 's</b></div><div><span>Knockbacks</span><b>' + st.kb + '</b></div></div>';
    h += '<div class="abil">' + abilityLines(st).map((t) => '<div>' + esc(t) + '</div>').join('') + '</div>';
    const acts = [];
    if (own) {
      if (own.form < 2) {
        const n = AW.evolveNeed(id, own.form);
        const can = AW.canEvolve(state, id);
        const need = 'Lv ' + n.level + ' · ' + icon('coin') + fmt(n.coins) + (n.seeds ? ' · ' + icon('seed') + n.seeds : '') + (n.fruit ? ' · ' + icon('fruit') + n.fruit : '');
        h += '<div class="box row"><div class="grow"><b>Evolve to ' + esc(def.names[own.form + 1]) + '</b><div class="small">' + need + ' · ' + (own.form === 0 ? '+12% stats' : '+16% stats, stronger ability') + '</div></div></div>';
        acts.push(['Evolve', can ? 'violet' : 'violet', (b) => {
          if (!AW.evolve(state, id)) { AU.deny(); toast('Need level ' + n.level + (n.seeds ? ', ' + n.seeds + ' Growth Seeds' : '') + (n.fruit ? ', ' + n.fruit + ' Star Fruit' : '') + ' and ' + fmt(n.coins) + ' coins', 'pink'); return; }
          AU.reveal(Math.max(2, def.rarity)); PF.happytime(); save(); openHero(id); if (panelName) rerender(); toast('<b>' + esc(def.names[own.form]) + '</b> evolved!', 'violet');
        }]);
      }
      const inl = state.lineup.indexOf(id) >= 0;
      acts.push([inl ? 'Remove' : 'Add to lineup', '', () => {
        if (inl) { if (state.lineup.filter(Boolean).length <= 1) { toast('Keep at least one hero', 'pink'); return; } state.lineup[state.lineup.indexOf(id)] = null; }
        else { const free = state.lineup.indexOf(null); if (free >= 0) state.lineup[free] = id; else { swapPick = id; toast('Lineup full: tap a slot to swap', 'violet'); } }
        markDirty(); closeModal(); if (panelName) rerender();
      }]);
      if (own.lvl < AW.CONFIG.maxLevel) acts.push(['Level up ' + icon('coin') + fmt(AW.levelCost(id, own.lvl)), 'gold', () => {
        if (!AW.levelUp(state, id)) { AU.deny(); toast('Not enough coins', 'pink'); return; }
        AU.level(); markDirty(); openHero(id); if (panelName) rerender();
      }]);
    }
    openModal(def.names[form], h, acts);
  }

  // --- Lab ------------------------------------------------------------------
  function renderLab(el) {
    let h = '<p class="small">Permanent upgrades for your whole army, paid with coins.</p><div class="lab">';
    for (const l of CT.LAB) {
      const lv = state.lab[l.id], max = lv >= l.max, cost = max ? 0 : AW.labCost(l.id, lv);
      const val = l.id === 'start' ? '+' + lv * l.per + ' acorns' : l.id === 'rchg' ? '-' + (lv * l.per).toFixed(1) + 's' : '+' + Math.round(lv * l.per * 100) + '%';
      h += '<div class="lr"><span class="li">' + icon(l.icon) + '</span><span class="ln">' + esc(l.name) + '<small>' + lv + '/' + l.max + '</small></span><span class="lx">' + esc(l.desc) + ' · now <em>' + val + '</em></span>' +
        '<button type="button" class="btn sm ' + (max ? '' : state.coins >= cost ? 'gold' : '') + '" data-lab="' + l.id + '"' + (max ? ' disabled' : '') + '>' + (max ? 'MAX' : icon('coin') + fmt(cost)) + '</button></div>';
    }
    h += '</div>';
    el.innerHTML = h;
    on(el, '[data-lab]', (b) => { if (AW.buyLab(state, b.getAttribute('data-lab'))) { AU.level(); markDirty(); rerender(); } else { AU.deny(); toast('Not enough coins', 'pink'); } });
  }

  // --- Rewards --------------------------------------------------------------
  function loginPrompt() {
    openModal('Daily Login', calendarHtml(), [['Claim', 'gold', () => { claimLoginNow(); closeModal(); }]]);
  }
  function calendarHtml() {
    const ready = AW.loginReady(state, now());
    const idx = state.login.count % 7;
    return '<div class="cal">' + CT.LOGIN.map((r, i) => {
      const cls = i < idx ? 'got' : (i === idx && ready ? 'today' : '');
      const ic = r.gold ? 'gold' : r.gems ? 'gem' : r.silver ? 'silver' : r.coins ? 'coin' : 'gift';
      const v = r.gold ? '1 + ' + r.gems : r.gems || r.silver || (r.coins ? fmt(r.coins) : 'Boost');
      return '<div class="day ' + cls + '">Day ' + (i + 1) + icon(ic) + '<b>' + v + '</b></div>';
    }).join('') + '</div><p class="small">Come back every day: day 7 gives a Gold Egg.</p>';
  }
  function claimLoginNow() {
    const got = AW.claimLogin(state, now(), Math.random);
    if (!got) return;
    AU.claim(); save();
    toast('Day ' + state.login.count + ': ' + rewardText(got) + (got.item ? ' ' + icon(got.item) : ''), 'green');
    refreshHome();
  }
  function welcomeHatchPrompt() {
    openModal('A gift for you!', '<p>The Hatchery is open! Here is a free <b class="warn">×10 Royal hatch</b> with at least one <b class="rc2">Epic</b> hero.</p><div style="text-align:center">' + SPR.img('egg_3', 5) + '</div>',
      [['Hatch!', 'gold pulse', () => { closeModal(); const res = AW.claimWelcome(state, Math.random, AW.dayNumber(now())); if (res) { save(); showHatch(res); } }]]);
  }

  function renderRewards(el) {
    const t = now();
    let h = '<div class="box' + (AW.loginReady(state, t) ? ' hot' : '') + '"><div class="sec"><h3>Daily Login</h3>' + (AW.loginReady(state, t) ? '<button type="button" class="btn sm gold" id="login">Claim</button>' : '<span class="sub">Next in ' + timeLeft(nextMidnight() - t) + '</span>') + '</div>' + calendarHtml() + '</div>';
    h += '<div class="box"><div class="sec"><h3>Daily Missions</h3><span class="sub">New in ' + timeLeft(nextMidnight() - t) + '</span></div>';
    state.daily.missions.forEach((m, i) => {
      const info = AW.missionInfo(state, m);
      h += '<div class="mis' + (info.claimed ? ' claimed' : info.done ? ' done' : '') + '"><span class="grow">' + esc(info.text) + '</span><span class="mb"><i style="width:' + (100 * info.prog / info.n) + '%"></i></span><span class="num small">' + info.prog + '/' + info.n + '</span>' +
        (info.claimed ? '<span class="mr">✓</span>' : info.done ? '<button type="button" class="btn sm gold" data-mis="' + i + '">' + icon('gem') + info.gems + '</button>' : '<span class="mr">' + icon('gem') + info.gems + '</span>') + '</div>';
    });
    const bonus = AW.missionBonusReady(state);
    h += '<div class="mis' + (state.daily.bonus ? ' claimed' : bonus ? ' done' : '') + '"><span class="grow">All missions done</span>' + (bonus ? '<button type="button" class="btn sm gold" id="mbonus">' + icon('gem') + '100 ' + icon('silver') + '1</button>' : '<span class="mr">' + icon('gem') + '100 ' + icon('silver') + '1' + (state.daily.bonus ? ' ✓' : '') + '</span>') + '</div></div>';
    const fp = AW.farmPending(state, t);
    h += '<div class="box' + (fp.hours >= 2 ? ' hot' : '') + '"><div class="sec"><h3>Acorn Farm</h3><span class="sub">' + fmt(AW.farmRate(state)) + ' coins/hour · holds 8 hours</span></div>' +
      '<div class="row"><span class="grow">' + icon('coin') + ' <b class="warn">' + fmt(fp.coins) + '</b> coins ready' + (fp.full ? ' <b class="bad">(full!)</b>' : '') + '</span>' +
      '<button type="button" class="btn sm green" id="farm"' + (fp.coins > 0 ? '' : ' disabled') + '>Collect</button>' + (PF.canRewarded() && fp.coins > 0 ? '<button type="button" class="btn sm gold ad" id="farm2">×2</button>' : '') + '</div></div>';
    h += '<div class="box"><div class="sec"><h3>Boost Shop</h3><span class="sub">Use boosts before a battle</span></div><div class="items">' + CT.ITEMS.map((it) => '<button type="button" class="item" data-buy="' + it.id + '" title="' + esc(it.desc) + '">' + icon(it.id) + '<span>' + esc(it.name) + ' <b>×' + state.items[it.id] + '</b><br><span class="small">' + esc(it.desc) + '</span><br>' + icon('coin') + fmt(it.price) + '</span></button>').join('') + '</div></div>';
    el.innerHTML = h;
    const lg = el.querySelector('#login'); if (lg) lg.addEventListener('click', () => { claimLoginNow(); rerender(); });
    on(el, '[data-mis]', (b) => { const g = AW.claimMission(state, Number(b.getAttribute('data-mis'))); if (g) { AU.claim(); toast('+' + g + ' gems', 'green'); save(); rerender(); } });
    const mb = el.querySelector('#mbonus'); if (mb) mb.addEventListener('click', () => { if (AW.claimMissionBonus(state)) { AU.claim(); save(); rerender(); } });
    const fm = el.querySelector('#farm'); if (fm) fm.addEventListener('click', () => { const c = AW.claimFarm(state, now(), 1); if (c) { AU.claim(); toast('+' + fmt(c) + ' coins', 'green'); save(); rerender(); } });
    const f2 = el.querySelector('#farm2'); if (f2) f2.addEventListener('click', () => PF.rewarded((ok) => { if (ok) { const c = AW.claimFarm(state, now(), 2); AU.claim(); toast('+' + fmt(c) + ' coins', 'green'); save(); rerender(); } }));
    on(el, '[data-buy]', (b) => { if (AW.buyItem(state, b.getAttribute('data-buy'))) { AU.claim(); markDirty(); rerender(); } else { AU.deny(); toast('Not enough coins', 'pink'); } });
  }
  function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }

  // --- Events -----------------------------------------------------------------
  function renderEvents(el) {
    let h = '<p class="small">Entries refill every day at midnight.</p>';
    for (const E of CT.EVENTS) {
      const left = AW.eventEntriesLeft(state, E.id), open = AW.eventOpen(state, E.id, 0);
      h += '<div class="box"><div class="sec"><h3>' + esc(E.name) + '</h3><span class="sub">' + (open ? left + ' / ' + E.entries + ' entries left' : icon('lock') + ' Clear ' + E.unlock + ' story stages') + '</span></div><p class="small">' + esc(E.desc) + '</p>';
      if (open) {
        h += '<div class="stages">';
        for (let l = 0; l < 5; l++) {
          const ok = AW.eventOpen(state, E.id, l), def = AW.eventDef(E.id, l);
          h += '<button type="button" class="stage' + (ok && left > 0 ? '' : ' locked') + '" data-ev="' + E.id + '" data-lv="' + l + '"><span class="sn">Level ' + (l + 1) + '</span><span class="st">' + (ok ? rewardText(def.rewards) : icon('lock') + ' ' + AW.EVENT_LEVELS[l].need + ' stages') + '</span></button>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    el.innerHTML = h;
    on(el, '[data-ev]', (b) => {
      const id = b.getAttribute('data-ev'), l = Number(b.getAttribute('data-lv'));
      if (!AW.eventOpen(state, id, l)) { AU.deny(); return; }
      if (AW.eventEntriesLeft(state, id) <= 0) { toast('No entries left today. Come back tomorrow!', 'pink'); return; }
      openStage(AW.eventDef(id, l));
    });
  }

  // --- Tower ------------------------------------------------------------------
  function renderTower(el) {
    const f = state.tower + 1, def = AW.towerDef(f);
    let h = '<div class="box row"><span style="font-size:32px">' + icon('tower') + '</span><div class="grow"><b class="warn" style="font-size:18px">Best floor: ' + state.tower + '</b><div class="small">The tower never ends and every floor gets tougher. ' + (PF.canLeaderboard() ? 'Your best floor is posted to the CrazyGames leaderboard.' : 'Climb as high as you can!') + '</div></div></div>';
    h += '<div class="box"><div class="sec"><h3>Floor ' + f + (def.boss ? ' · BOSS' : '') + '</h3><span class="sub">' + rewardText({ coins: def.coins, gems: def.gems, gold: def.gold }) + '</span></div>' + foesHtml(def) + '<p class="small">Every 5th floor gives 100 gems and every 10th a Gold Egg.</p><button type="button" class="btn gold wide" id="climb">Climb floor ' + f + '</button></div>';
    el.innerHTML = h;
    el.querySelector('#climb').addEventListener('click', () => openStage(def));
  }

  // --- Medals -----------------------------------------------------------------
  function renderMedals(el) {
    const list = AW.medalList(state);
    let h = '';
    for (const it of list) {
      h += '<div class="medal' + (it.ready ? ' ready' : it.done ? ' done' : '') + '"><span style="width:24px">' + icon('medal') + '</span><div class="grow"><div class="mt">' + esc(it.m.name) + '<small class="tier">' + it.m.tiers.map((_, i) => '<i class="' + (i < it.claimed ? 'on' : '') + '"></i>').join('') + '</small></div><div class="md">' + (it.done ? 'Complete!' : esc(it.text) + ' · ' + fmt(Math.min(it.value, it.target)) + '/' + fmt(it.target)) + '</div></div>' +
        (it.ready ? '<button type="button" class="btn sm gold" data-medal="' + it.m.stat + '">' + icon('gem') + it.gems + '</button>' : it.done ? '' : '<span class="mr small">' + icon('gem') + it.gems + '</span>') + '</div>';
    }
    el.innerHTML = h;
    on(el, '[data-medal]', (b) => { const g = AW.claimMedal(state, b.getAttribute('data-medal')); if (g) { AU.claim(); toast('+' + g + ' gems', 'green'); save(); rerender(); } });
  }

  // --- Book -------------------------------------------------------------------
  function renderBook(el) {
    let h = '<div class="tabs"><button type="button" data-tab="heroes" class="' + (ui.bookTab === 'heroes' ? 'on' : '') + '">Heroes ' + AW.ownedCount(state) + '/' + CT.HEROES.length + '</button><button type="button" data-tab="gloom" class="' + (ui.bookTab === 'gloom' ? 'on' : '') + '">Gloom ' + Object.keys(state.seen).length + '/' + CT.ENEMIES.length + '</button></div>';
    if (ui.bookTab === 'heroes') h += '<div class="roster">' + CT.HEROES.map(heroTile).join('') + '</div>';
    else {
      h += '<div class="roster">' + CT.ENEMIES.map((e) => {
        const k = state.seen[e.id];
        return '<button type="button" class="hero' + (k ? '' : ' locked') + '" data-enemy="' + e.id + '"><div class="hi">' + SPR.enemyImg(e.id, 1) + '</div><div class="hn">' + (k ? esc(e.name) : '???') + '</div><div class="hl">' + (k ? e.traits.map((t) => '<span class="trait" style="background:' + CT.TRAITS[t].color + '">' + CT.TRAITS[t].name + '</span>').join('') : '') + '</div></button>';
      }).join('') + '</div>';
      h += '<div class="box small">' + Object.keys(CT.TRAITS).map((t) => '<span class="trait" style="background:' + CT.TRAITS[t].color + '">' + CT.TRAITS[t].name + '</span> ' + esc(CT.TRAITS[t].desc)).join('<br>') + '</div>';
    }
    el.innerHTML = h;
    on(el, '[data-tab]', (b) => { ui.bookTab = b.getAttribute('data-tab'); rerender(); });
    on(el, '[data-hero]', (b) => openHero(b.getAttribute('data-hero')));
    on(el, '[data-enemy]', (b) => {
      const e = AW.ENEMY[b.getAttribute('data-enemy')];
      if (!state.seen[e.id]) { AU.deny(); return; }
      openModal(e.name, '<div class="hd"><div class="hd-art">' + SPR.enemyImg(e.id, e.look.s >= 40 ? 3 : 4) + '</div><div class="hd-info"><div>' + (e.traits.length ? e.traits.map((t) => '<span class="trait" style="background:' + CT.TRAITS[t].color + '">' + CT.TRAITS[t].name + '</span>').join('') : '<span class="small">No trait</span>') + '</div><p class="small">' + esc(e.desc) + '</p>' +
        '<div class="stats"><div><span>Health</span><b>' + fmt(e.hp) + '</b></div><div><span>Attack</span><b>' + fmt(e.atk) + '</b></div><div><span>Reach</span><b>' + e.rng + '</b></div><div><span>Speed</span><b>' + e.spd + '</b></div><div><span>Acorns</span><b>' + e.drop + '</b></div></div><p class="small">Base stats; stages make the Gloom stronger.</p></div></div>', []);
    });
  }

  // --- Settings -------------------------------------------------------------
  function openSettings() {
    openModal('Settings', '<div class="toggle"><span>Music</span>' + toggleBtn('music') + '</div><div class="toggle"><span>Sound effects</span>' + toggleBtn('sfx') + '</div><div class="toggle"><span>Camera follows the front line</span>' + toggleBtn('cam') + '</div>' +
      '<p class="small">Controls: tap a hero card (or 1-0) to deploy · E upgrades the pouch · R or Space fires Mega Roar · F toggles speed · drag or scroll to look around · P or Esc pauses.</p>' +
      '<p class="small">Animal Wars v1.0 · Fonts: Pixelify Sans and Silkscreen (SIL Open Font License). Music and sound are synthesized in your browser.</p>' +
      (DEBUG ? '<p class="small">Debug: battles ' + state.stats.battles + ', play ' + Math.round(state.stats.playSeconds / 60) + ' min</p>' : ''),
      [['Reset progress', 'red', () => {
        openModal('Reset progress?', '<p>This deletes your heroes, stages and everything else. It cannot be undone.</p>', [['Cancel', '', closeModal], ['Delete everything', 'red', () => { PF.remove(SAVE_KEY); state = AW.createState(now()); AW.ensureDaily(state, now()); closeModal(); save(); startFirstBattle(); }]]);
      }], ['Done', 'gold', closeModal]]);
    bindToggles();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function bindInput() {
    $('btn-battle').addEventListener('click', () => { AU.unlock(); AU.click(); const n = nextStory(); if (n) openStage(n); else openPanel('map'); });
    $('btn-map').addEventListener('click', () => { AU.click(); const n = nextStory(); if (n) { ui.mapRegion = n.r; ui.mapDiff = 0; } openPanel('map'); });
    document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => { AU.unlock(); AU.click(); openPanel(b.getAttribute('data-go')); }));
    $('panel-back').addEventListener('click', () => { AU.click(); closePanel(); });
    $('btn-settings').addEventListener('click', () => { AU.click(); openSettings(); });
    $('btn-sound').addEventListener('click', () => { AU.unlock(); setMuted(!AU.muted); });
    $('modal-x').addEventListener('click', () => { AU.click(); closeModal(); });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && !$('modal-x').hidden) closeModal(); });
    $('cards').addEventListener('pointerdown', (e) => { const c = e.target.closest('[data-slot]'); if (c) { e.preventDefault(); AU.unlock(); tryDeploy(Number(c.getAttribute('data-slot'))); } });
    $('btn-pouch').addEventListener('pointerdown', (e) => { e.preventDefault(); tryPouch(); });
    $('btn-roar').addEventListener('pointerdown', (e) => { e.preventDefault(); tryRoar(); });
    $('btn-pause').addEventListener('click', () => { AU.click(); pause(true); });
    $('btn-speed').addEventListener('click', toggleSpeed);
    $('btn-cam').addEventListener('click', () => { state.settings.autoCam = !state.settings.autoCam; $('btn-cam').classList.toggle('on', state.settings.autoCam); if (state.settings.autoCam) R.setAuto(); markDirty(); });
    $('h-next').addEventListener('click', () => { if (hatchQ && hatchQ.phase === 'done') { endHatch(); return; } hatchStep(); });
    $('h-skip').addEventListener('click', () => { if (hatchQ) { hatchQ.list.forEach((r) => { if (r.rarity >= 3) PF.happytime(); }); AU.reveal(Math.max.apply(null, hatchQ.list.map((r) => r.rarity))); hatchSummary(); } });
    $('hatchery').addEventListener('click', (e) => { if (e.target.closest('button')) return; if (hatchQ && hatchQ.phase !== 'done') hatchStep(); });

    // Battlefield: drag or scroll to look around; tap the minimap to jump.
    const view = $('view');
    let drag = null;
    view.addEventListener('pointerdown', (e) => {
      AU.unlock();
      if (mode !== 'battle' || e.target.closest('button')) return;
      const mm = R.minimapRect(), vr = view.getBoundingClientRect();
      const x = e.clientX - vr.left, y = e.clientY - vr.top;
      if (mm && y < mm.h && x >= mm.x && x <= mm.x + mm.w) { R.jumpTo((x - mm.x) / mm.w); return; }
      drag = { x: e.clientX, moved: false };
    });
    window.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 3 || drag.moved) { drag.moved = true; R.drag(dx); drag.x = e.clientX; } });
    window.addEventListener('pointerup', () => { drag = null; });
    view.addEventListener('wheel', (e) => { if (mode === 'battle') { R.drag(-(e.deltaY || e.deltaX)); e.preventDefault(); } }, { passive: false });
    view.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.repeat) return;
      AU.unlock();
      if (e.key === 'm' || e.key === 'M') { setMuted(!AU.muted); return; }
      if (!$('hatchery').hidden) { if (e.code === 'Space' || e.key === 'Enter') { if (hatchQ && hatchQ.phase === 'done') endHatch(); else hatchStep(); } return; }
      if (!$('modal').hidden) { if (e.key === 'Escape' && !$('modal-x').hidden) closeModal(); return; }
      if (mode === 'battle' && battle) {
        const keys = '1234567890';
        const i = keys.indexOf(e.key);
        if (i >= 0) tryDeploy(i);
        else if (e.key === 'e' || e.key === 'E') tryPouch();
        else if (e.key === 'r' || e.key === 'R' || e.code === 'Space') tryRoar();
        else if (e.key === 'f' || e.key === 'F') toggleSpeed();
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') pause(true);
        else if (e.code === 'ArrowLeft') R.drag(60);
        else if (e.code === 'ArrowRight') R.drag(-60);
      } else if (mode === 'menu' && e.key === 'Escape') closePanel();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { AU.suspend(); save(); if (mode === 'battle' && battle && !ended && !paused) pause(true); PF.gameplayStop(); }
      else { AU.resume(); if (mode === 'battle' && battle && !paused && !ended) PF.gameplayStart(); }
    });
    window.addEventListener('resize', () => R.resize());
    window.addEventListener('pagehide', save);
  }

  function toggleSpeed() { state.settings.speed = state.settings.speed === 2 ? 1 : 2; $('btn-speed').textContent = '×' + state.settings.speed; $('btn-speed').classList.toggle('on', state.settings.speed === 2); AU.click(); markDirty(); }
  function setMuted(m) { AU.setMuted(m); $('btn-sound').classList.toggle('off', m); }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  let lastT = 0, slow = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000);
    lastT = t;
    try {
      if (mode === 'battle') battleTick(dt);
      R.frame(paused && mode === 'battle' ? 0 : dt);
    } catch (e) { if (DEBUG) console.error(e); }
    slow += dt;
    if (slow > 1) {
      slow = 0;
      if (AW.ensureDaily(state, now())) { markDirty(); if (mode === 'home') refreshHome(); }
      if (mode === 'home') updateBadges();
      if (dirty && now() - lastSave > 4000) save();
    }
  }

  function startFirstBattle() {
    enterHome();
    startBattle(AW.stageDef(0, 0, 0), {});
  }

  function boot() {
    PF.loadingStart();
    const L = load();
    state = L.state;
    AW.ensureDaily(state, now());
    AU.muted = false;
    AU.setSfx(state.settings.sfx); AU.setMusic(state.settings.music);
    R.init({ canvas: $('cv'), container: $('view') });
    fillIcons(document);
    bindInput();
    R.resize();
    PF.on('mute', (m) => AU.setExternalMute(m));
    PF.on('pause', (p) => { if (p) AU.suspend(); else AU.resume(); });
    PF.on('ready', () => { adoptCloud(); PF.loadingStop(); if (state.tower) PF.submitScore(state.tower); if (mode === 'home') refreshHome(); });
    PF.on('user', () => { if (mode === 'home') refreshHome(); });
    // Away for a while? The Acorn Farm kept working.
    const away = now() - state.lastSeen;
    if (COVER) { coverMode(); }
    else if (L.fresh) startFirstBattle();
    else {
      enterHome();
      const fp = AW.farmPending(state, now());
      if (away > 15 * 60000 && fp.coins > 0) {
        setTimeout(() => openModal('Welcome back!', '<p>Your Acorn Farm made <b class="warn">' + fmt(fp.coins) + ' coins</b> while you were away.</p>',
          (PF.canRewarded() ? [['Collect ×2', 'gold ad', () => PF.rewarded((ok) => { AW.claimFarm(state, now(), ok ? 2 : 1); save(); closeModal(); refreshHome(); })]] : []).concat([['Collect', 'green', () => { AW.claimFarm(state, now(), 1); save(); closeModal(); refreshHome(); }]]), () => { setTimeout(homePopups, 200); }), 400);
      }
    }
    PF.loadingStop();
    save();
    requestAnimationFrame(loop);
  }

  // Store art: a staged clash in the middle of the field, with the logo on top.
  function coverMode() {
    const ids = ['bruno', 'bamboo', 'drako', 'kitsu', 'pip', 'shelly', 'stretch', 'ronin', 'ember', 'aerion'];
    ids.forEach((id) => { state.heroes[id] = { lvl: 30, plus: 0, form: id === 'pip' || id === 'kitsu' ? 2 : 1 }; });
    state.lineup = ids;
    const region = Number((location.search.match(/region=(\d)/) || [0, 0])[1]);
    const def = AW.stageDef(0, region, 11);
    startBattle(def, {});
    const b = battle;
    const mid = b.L * 0.5;
    const ent = (side, st, x, y, frame) => {
      b.ents.push({ id: b.nextId++, side: side, st: st, x: x, y: y, hp: st.hp, max: st.hp, state: frame === 3 ? 'atk' : 'walk', t: 0, at: frame === 3 ? st.fore + 0.05 : 0,
        cool: 9, hits: 9, kbi: 0, freeze: 0, slow: 0, weaken: 0, poison: 0, walkT: frame === 1 ? 0.3 : 0, boss: false, flash: 0 });
    };
    const heroes = ['shelly', 'pip', 'ronin', 'stretch', 'bamboo', 'bruno', 'kitsu', 'ember', 'drako', 'aerion'];
    heroes.forEach((id, i) => ent(0, AW.heroStats(state, id), mid - 12 - i * 12 - (i % 2) * 4, (i * 3) % 7, i % 3 === 0 ? 3 : i % 2));
    const foes = [['gloop', 6], ['bonkle', 22], ['grumbo', 46], ['flapper', 30], ['gloop', 64], [CT.REGIONS[region].boss, 92]];
    foes.forEach((f, i) => ent(1, AW.enemyStats(f[0], 100), mid + 6 + f[1], (i * 2) % 6, i % 2 ? 3 : 0));
    paused = true;
    $('callout').classList.remove('show');
    $('dock').hidden = true; $('bhud').hidden = true;
    const logo = document.createElement('div');
    logo.className = 'logo cover-logo';
    logo.innerHTML = '<span class="l1">ANIMAL</span><span class="l2">WARS</span>';
    $('view').appendChild(logo);
    R.resize();
    R.setMinimap(false);
    R.lookAt(mid - 34);
  }

  // QA hooks (used by tests/browser.qa.js).
  window.__aw = {
    AW: AW,
    get state() { return state; }, set state(s) { state = s; },
    get battle() { return battle; },
    get mode() { return mode; },
    startBattle: startBattle, openPanel: openPanel, enterHome: enterHome, save: save, openStage: openStage, openHero: openHero,
    get paused() { return paused; }, pause: pause
  };

  boot();
})();
