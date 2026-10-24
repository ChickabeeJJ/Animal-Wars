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
  let panelName = null;
  let swapPick = null;
  let dirty = false, lastSave = 0;
  const ui = { mapRegion: 0, mapDiff: 0, armyFilter: -1, bookTab: 'heroes', items: {} };
  const tutorial = { step: null };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function now() { return Date.now(); }
  function icon(k, cls) { return SPR.img('icon_' + k, 2, cls); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function fillIcons(root) { (root || document).querySelectorAll('[data-icon]').forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute('data-icon')); }); pixelize(root || document); }
  // Button labels: every text node inside a pixel button becomes a pixel-font label (the words stay in .sr).
  function pixLabel(text, scale) {
    return '<span class="blbl">' + SPR.textImg(text.toUpperCase(), scale, { size: 8, fill: ['#ffffff', '#ffffff', '#f2e6d4'], shadow: 'rgba(26,15,18,0.5)', outline: '#1a0f12' }) + '</span><span class="sr">' + esc(text) + '</span>';
  }
  function pixelizeButton(btn) {
    const scale = btn.classList.contains('lg') ? 3 : 2;
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!n.nodeValue.trim() || p.closest('.sr, .badge, .nopix, .blbl')) continue;
      nodes.push(n);
    }
    for (const n of nodes) {
      const span = document.createElement('span');
      span.className = 'pl';
      span.innerHTML = pixLabel(n.nodeValue.trim(), scale);
      n.parentNode.replaceChild(span, n);
    }
  }
  function pixelize(root) {
    if (!root) return;
    if (root.matches && root.matches('[class*="fx-btn-"]:not(.nopix)')) pixelizeButton(root);
    root.querySelectorAll('[class*="fx-btn-"]:not(.nopix)').forEach(pixelizeButton);
  }
  function setBtnText(el, text) { el.textContent = text; pixelizeButton(el); }
  function heroName(id) { const h = state.heroes[id]; return AW.HERO[id].names[h ? h.form : 0]; }
  function rarityName(r) { return CT.RARITIES[r].name; }
  function stageLabel(def) { return def.kind === 'story' ? (def.r + 1) + '-' + (def.i + 1) : def.name; }
  function markDirty() { dirty = true; }
  // Pixel-font title as an image.
  const PALS = {
    gold: { fill: ['#fff6c8', '#ffcd4d', '#ef9a2a'], shadow: '#7a2a20' }, cream: { fill: ['#ffffff', '#fff2d8', '#e8c89a'], shadow: '#4a2e1e' },
    red: { fill: ['#ffd0c0', '#ff6a5a', '#c02a3a'], shadow: '#3a0a1a' }, blue: { fill: ['#e0f6ff', '#73c8ff', '#3b6ad9'], shadow: '#14204a' },
    green: { fill: ['#f0ffd0', '#a7f070', '#38b764'], shadow: '#103a20' }, pink: { fill: ['#ffe0f4', '#ff8fd0', '#c03a9a'], shadow: '#3a0a30' },
    purple: { fill: ['#f0e4ff', '#c9a8ff', '#8a5ae0'], shadow: '#24104a' }, gray: { fill: ['#ffffff', '#c9d2e3', '#8a94a8'], shadow: '#1a1c2c' }
  };
  const RAR_PAL = ['gray', 'blue', 'purple', 'gold', 'pink'];
  function title(text, scale, pal, size, cls) {
    const P = PALS[pal || 'gold'];
    return SPR.textImg(String(text).toUpperCase(), scale || 3, { size: size || 8, fill: P.fill, shadow: P.shadow, outline: '#1a0f12' }, cls);
  }
  function rarFrame(r) { return 'fx-rar' + r; }
  // Portraits at the largest whole-number scale that fits a box, so every art pixel stays square and even.
  // cap keeps lists even: small heroes are not blown up past the scale the others get.
  function fitImg(name, maxW, maxH, cls, cap) {
    const c = SPR.trimmed(name);
    const k = Math.max(1, Math.min(cap || 2, Math.floor(Math.min(maxW / c.width, maxH / c.height) + 0.2)));
    return '<img class="px fit ' + (cls || '') + '" src="' + SPR.url(name + '#t') + '" style="width:' + c.width * k + 'px;height:' + c.height * k + 'px" alt="">';
  }
  function heroFit(id, form, maxW, maxH, cls, cap) { return fitImg('hero_' + id + '_' + (form || 0) + '_0', maxW, maxH, cls, cap); }
  function enemyFit(id, maxW, maxH, cls, cap) { return fitImg('enemy_' + id + '_0', maxW, maxH, cls, cap); }

  function toast(html, cls, ms) {
    const t = document.createElement('div');
    t.className = 'toast fx-plaqueWood ' + (cls || '');
    t.innerHTML = html;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms || 2400);
  }

  // Locked features: a small popover anchored to what was tapped, saying what unlocks it.
  let lockTimer = 0;
  function lockTip(el, text) {
    AU.deny();
    const tip = $('locktip'), app = $('app').getBoundingClientRect(), r = el.getBoundingClientRect();
    tip.innerHTML = icon('lock') + '<span>' + text + '</span>';
    tip.hidden = false; tip.classList.remove('show', 'below');
    const tw = tip.offsetWidth, th = tip.offsetHeight, cx = r.left + r.width / 2 - app.left;
    const x = Math.max(6, Math.min(app.width - tw - 6, cx - tw / 2));
    let y = r.top - app.top - th - 12;
    if (y < 6) { y = r.bottom - app.top + 12; tip.classList.add('below'); }
    tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
    tip.style.setProperty('--ax', Math.round(Math.max(16, Math.min(tw - 16, cx - x))) + 'px');
    void tip.offsetWidth; tip.classList.add('show');
    clearTimeout(lockTimer); lockTimer = setTimeout(hideLockTip, 2600);
  }
  function hideLockTip() { $('locktip').hidden = true; }
  // "Clear stage 1-3" for a number of cleared story stages.
  function stageReq(n) { return 'Clear stage ' + (Math.floor((n - 1) / 12) + 1) + '-' + ((n - 1) % 12 + 1); }

  // Pixel labels never spill out of their button: if one is too wide it is redrawn smaller.
  function fitLabels(root) {
    (root || document).querySelectorAll('[class*="fx-btn-"] .blbl img.ptxt').forEach((img) => {
      const btn = img.closest('[class*="fx-btn-"]');
      if (!btn || !btn.offsetWidth) return;
      const cs = getComputedStyle(btn), room = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 2;
      if (img.offsetWidth <= room) return;
      const w = parseFloat(img.style.width), h = parseFloat(img.style.height);
      if (h > 9) { img.style.width = (w / 2) + 'px'; img.style.height = (h / 2) + 'px'; }
    });
  }

  // Short screen fade between modes.
  function transition(fn) {
    const f = $('fade');
    f.classList.add('on');
    setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, 170);
  }

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
  // Modes: home, battle, menu window
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
    const wasMenu = mode === 'menu';
    mode = 'home'; battle = null; panelName = null;
    setAppClass('home');
    if (!wasMenu) { R.resize(); R.setHome(state, homeTheme()); }
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
  function rank() { const st = AW.totalStars(state) + AW.clearedAll(state, 1) + AW.clearedAll(state, 2) + state.tower; return { lvl: 1 + Math.floor(st / 5), frac: (st % 5) / 5 }; }
  function leadHero() { return state.lineup.filter(Boolean).sort((a, b) => AW.HERO[b].rarity - AW.HERO[a].rarity)[0] || 'pip'; }

  function nextGoal() {
    if (AW.welcomeReady(state)) return icon('nest') + 'A free ×10 hatch is waiting!';
    const n = nextStory();
    if (!n) return icon('crown') + 'Every land is free! Try Hard mode and the Tower.';
    for (const h of CT.HEROES) {
      if (h.rarity === 0 && h.unlock && !state.heroes[h.id] && (h.unlock[0] > n.r || (h.unlock[0] === n.r && h.unlock[1] >= n.i))) {
        return heroFit(h.id, 0, 48, 28) + 'Clear ' + (h.unlock[0] + 1) + '-' + (h.unlock[1] + 1) + ' to recruit ' + esc(h.names[0]) + '!';
      }
    }
    if (AW.storyCleared(state) < 3) return icon('nest') + 'Clear 1-3 to open the Hatchery';
    return icon('skull') + 'Defeat ' + esc(AW.ENEMY[CT.REGIONS[n.r].boss].name) + ' at ' + (n.r + 1) + '-12';
  }

  function refreshHome() {
    renderCurrencies();
    const rk = rank();
    $('pname').textContent = (PF.user && PF.user.username) || state.name || 'Commander';
    $('prank').textContent = rk.lvl;
    $('prank-fill').style.width = (rk.frac * 100) + '%';
    const lead = leadHero();
    $('avatar').className = 'avatar ' + rarFrame(AW.HERO[lead].rarity);
    $('avatar').innerHTML = heroFit(lead, state.heroes[lead] ? state.heroes[lead].form : 0, 40, 36);
    if (!$('logo').firstChild) $('logo').innerHTML = title('Animal', 4, 'cream') + '<div class="paws">' + icon('paw') + icon('paw') + icon('paw') + '</div>' + title('Wars', 7, 'gold');
    $('goal').innerHTML = nextGoal();
    const n = nextStory();
    $('battle-t').innerHTML = title('Battle!', 4, 'cream');
    $('next-stage').innerHTML = n ? esc(stageLabel(n) + '  ' + n.name) : 'Hard mode is open!';
    $('btn-battle').classList.toggle('pulse', AW.storyCleared(state) < 4);
    if (!$('hatch-egg').firstChild) $('hatch-egg').innerHTML = icon('gold');
    renderQuests();
    renderSide();
    updateBadges();
    requestAnimationFrame(() => fitLabels($('home')));
  }

  function curPills(small) {
    const pill = (k, v, go, t) => '<div class="cur" title="' + t + '">' + icon(k) + '<b class="num">' + v + '</b>' + (go && !small ? '<button type="button" class="plus" data-go="' + go + '" aria-label="Get more">' + SPR.img('icon_plus', 1) + '</button>' : '') + '</div>';
    return pill('coin', fmt(state.coins), 'rewards', 'Coins: level up heroes and the Lab') + pill('gem', fmt(state.gems), 'hatch', 'Gems: hatch eggs in the Royal Nest') +
      pill('silver', state.tickets.silver, 'hatch', 'Silver Eggs: hatch in the Meadow Nest') + pill('gold', state.tickets.gold, 'hatch', 'Gold Eggs: free Royal hatches');
  }
  function renderCurrencies() {
    $('curs').innerHTML = curPills(false);
    $('curs').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { AU.click(); openPanel(b.getAttribute('data-go')); }));
    if (!$('panel').hidden) $('panel-cur').innerHTML = curPills(true);
  }

  function renderQuests() {
    const q = $('quests');
    if (AW.storyCleared(state) < 1) { q.hidden = true; return; }
    q.hidden = false;
    let h = '<div class="q-head">' + icon('quest') + 'Daily Quests<span>' + timeLeft(nextMidnight() - now()) + '</span></div>';
    state.daily.missions.forEach((m) => {
      const i = AW.missionInfo(state, m);
      h += '<div class="q' + (i.claimed ? ' claimed' : i.done ? ' done' : '') + '"><span class="qt">' + (i.done && !i.claimed ? '✔ ' : '') + esc(i.text) + '</span><span class="qr">' + icon('gem') + i.gems + '</span><span class="qb"><i style="width:' + (100 * i.prog / i.n) + '%"></i></span></div>';
    });
    q.innerHTML = h;
  }

  function renderSide() {
    const t = now(), out = [];
    const sb = (id, ic, label, sub, ready, lock) => out.push('<button type="button" class="sb' + (ready ? ' ready' : '') + (lock ? ' locked' : '') + '" data-side="' + id + '"' + (lock ? ' data-lock="' + esc(lock) + '"' : '') + '><span class="sbi fx-btn-' + (lock ? 'dark' : ready ? 'gold' : 'wood') + '">' + icon(ic) + (lock ? '<span class="nlk">' + icon('lock') + '</span>' : '') + '</span><span class="sbl">' + label + '</span><span class="sbt">' + sub + '</span></button>');
    if (AW.storyCleared(state) >= 1) {
      const lr = AW.loginReady(state, t);
      sb('login', 'gift', 'Daily Gift', lr ? 'Claim!' : timeLeft(nextMidnight() - t), lr);
      const fp = AW.farmPending(state, t);
      sb('farm', 'farm', 'Acorn Farm', fp.coins ? '+' + fmt(fp.coins) : 'Growing', fp.hours >= 1);
    }
    const sc = AW.storyCleared(state);
    if (sc >= 3) { const fe = AW.freeEggReady(state, t); sb('egg', 'silver', 'Free Egg', fe ? 'Ready!' : timeLeft(state.gacha.freeAt - t), fe); }
    else if (sc >= 1) sb('egg', 'silver', 'Free Egg', 'Locked', false, stageReq(3) + ' to unlock free eggs');
    if (sc >= 12) sb('tower', 'tower', 'Tower', 'Floor ' + (state.tower + 1), false);
    else if (sc >= 1) sb('tower', 'tower', 'Tower', 'Locked', false, stageReq(12) + ' to unlock the Gloom Tower');
    $('side').innerHTML = out.join('');
    $('side').querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
      if (!b.getAttribute('data-lock')) AU.click();
      const k = b.getAttribute('data-side');
      if (b.getAttribute('data-lock')) { lockTip(b, b.getAttribute('data-lock')); return; }
      if (k === 'login') { if (AW.loginReady(state, now())) loginPrompt(); else openPanel('rewards'); }
      else if (k === 'farm') openPanel('rewards');
      else if (k === 'egg') openPanel('hatch');
      else if (k === 'tower') openPanel('tower');
    }));
  }

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
  const NEED = { map: 1, hatch: 3, army: 1, lab: 2, rewards: 1, events: 6, tower: 12, medals: 2, book: 1 };
  function updateBadges() {
    const c = badgeCounts();
    document.querySelectorAll('.nav [data-go]').forEach((b) => {
      const k = b.getAttribute('data-go'), n = c[k] || 0, el = b.querySelector('.badge');
      el.hidden = !n; el.textContent = n > 9 ? '9+' : n;
      // Locked features show a padlock; tapping one says what unlocks it.
      const locked = AW.storyCleared(state) < NEED[k] && !DEBUG;
      if (!b.querySelector('.nlk')) b.insertAdjacentHTML('beforeend', '<span class="nlk">' + icon('lock') + '</span>');
      b.classList.toggle('locked', locked);
      b.title = locked ? stageReq(NEED[k]) + ' to unlock' : '';
      if (locked) el.hidden = true;
    });
  }

  function homePopups() {
    if (mode !== 'home' || !$('modal').hidden || !$('hatchery').hidden) return;
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
    R.setAuto();
    buildCards();
    $('bh-name').innerHTML = esc((def.kind === 'story' ? stageLabel(def) + '  ' : '') + def.name) + '<small>' + esc(def.kind === 'story' ? CT.DIFFICULTIES[def.d].name + ' · ' + def.region : def.region) + '</small>';
    $('speed-t').textContent = state.settings.speed;
    $('btn-speed').classList.toggle('on', state.settings.speed === 2);
    $('btn-cam').classList.toggle('on', state.settings.autoCam);
    $('bossbar').hidden = true;
    AU.play('battle');
    callout(def.name, def.kind === 'story' ? stageLabel(def) + ' · ' + CT.DIFFICULTIES[def.d].name : def.region, def.d === 2 ? 'pink' : def.d === 1 ? 'gold' : 'cream');
    PF.gameplayStart();
    tutorial.step = (def.kind === 'story' && def.d === 0 && def.r === 0 && def.i === 0 && !state.flags.tutDone) ? 'deploy' : null;
    if (!tutorial.step && AW.storyCleared(state) === 1 && !state.flags.tutRoar) tutorial.step = 'watchRoar';
    markDirty();
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  function buildCards() {
    $('cards').innerHTML = battle.slots.map((sl, i) => {
      if (!sl) return '<div class="card empty fx-cardDark"></div>';
      const h = state.heroes[sl.id];
      return '<button type="button" class="card r' + sl.st.rarity + ' ' + rarFrame(sl.st.rarity) + '" data-slot="' + i + '" title="' + esc(sl.st.name) + '"><i class="cbg"></i><span class="cart"></span>' +
        '<span class="key">' + KEYS[i] + '</span><span class="cost num">' + SPR.img('icon_acorn', 1) + sl.st.cost + '</span><i class="cdv"></i><b class="cds"></b></button>';
    }).join('');
    $('cards').querySelectorAll('.card[data-slot]').forEach((el) => { el._last = ''; el._ready = true; });
    fitCardArt();
  }
  // Card portraits at a whole-number scale that fits the card (re-fitted when the screen size changes).
  function fitCardArt() {
    if (!battle) return;
    $('cards').querySelectorAll('.card[data-slot]').forEach((el) => {
      const sl = battle.slots[Number(el.getAttribute('data-slot'))], art = el.querySelector('.cart');
      if (!sl || !art || !el.clientHeight) return;
      art.innerHTML = heroFit(sl.id, state.heroes[sl.id].form, el.clientWidth - 6, el.clientHeight - 16);
    });
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
        case 'roar': AU.roar(); callout('Battle Cry!', e.n ? e.n + (e.n === 1 ? ' hero' : ' heroes') + ' powered up' : 'No heroes on the field!', 'gold'); break;
        case 'wave': AU.wave(); break;
        case 'towerHit': AU.tower(); break;
        case 'status': if (e.k === 'freeze') AU.freeze(); break;
        case 'boss': AU.boss(); AU.play('boss'); callout(AW.ENEMY[e.enemy].name, 'A boss appears!', 'pink'); break;
        case 'win': AU.win(); break;
        case 'lose': AU.lose(); break;
        default: break;
      }
    }
  }

  let calloutTimer = 0;
  function callout(text, sub, pal) {
    const el = $('callout');
    el.innerHTML = title(text, text.length > 14 ? 3 : 4, pal || 'cream') + (sub ? '<small>' + esc(sub) + '</small>' : '');
    el.classList.remove('show'); void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.classList.remove('show'), 1900);
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
    if (battle.state !== 'play' && !ended) { ended = true; endT = 0; PF.gameplayStop(); }
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
    $('bh-enemy').style.width = (100 * b.enemy.hp / b.enemy.max) + '%';
    const pmax = b.pouch.lvl >= AW.CONFIG.pouch.levels;
    const pb = $('btn-pouch');
    $('pouch-lv').textContent = pmax ? 'MAX' : b.pouch.lvl;
    $('pouch-cost').textContent = pmax ? 'MAX' : AW.pouchCost(b.pouch.lvl);
    pb.classList.toggle('can', AW.canPouch(b));
    pb.classList.toggle('max', pmax);
    pb.style.setProperty('--p', pmax ? 1 : Math.min(1, b.pouch.acorns / AW.pouchCost(b.pouch.lvl)));
    const rb = $('btn-roar'), ready = b.roar.charge >= 1 && b.state === 'play';
    const active = b.roar.left > 0;
    rb.style.setProperty('--p', active ? b.roar.left / b.roar.dur : b.roar.charge);
    rb.classList.toggle('ready', ready && !active);
    rb.classList.toggle('active', active);
    $('roar-t').textContent = active ? Math.ceil(b.roar.left) + 's' : ready ? 'READY!' : Math.floor(b.roar.charge * 100) + '%';
    const cards = $('cards').children;
    for (let i = 0; i < cards.length; i++) {
      const sl = b.slots[i], el = cards[i];
      if (!sl) continue;
      const cool = sl.cd > 0, poor = b.pouch.acorns < sl.st.cost;
      const key = (cool ? 'c' : poor ? 'p' : 'o') + Math.ceil(sl.cd * 10);
      if (el._last === key) continue;
      el._last = key;
      el.classList.toggle('cool', cool); el.classList.toggle('poor', !cool && poor); el.classList.toggle('ok', !cool && !poor);
      el.querySelector('.cdv').style.setProperty('--p', cool ? sl.cd / sl.cdMax : 0);
      el.querySelector('.cds').textContent = cool ? Math.ceil(sl.cd) : '';
      const nowReady = !cool && !poor;
      if (nowReady && !el._ready) { el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); }
      el._ready = nowReady;
    }
    let boss = null;
    for (const e of b.ents) if (e.boss && e.side === 1 && e.state !== 'dead') { boss = e; break; }
    $('bossbar').hidden = !boss;
    if (boss) { $('boss-name').textContent = boss.st.name; $('boss-fill').style.width = (100 * Math.max(0, boss.hp) / boss.max) + '%'; }
  }

  function pointAt(el, text) {
    const tut = $('tut');
    if (!el) { tut.hidden = true; return; }
    tut.hidden = false;
    $('tut-text').textContent = text;
    const vr = $('view').getBoundingClientRect(), r = el.getBoundingClientRect();
    const w = tut.offsetWidth, h = tut.offsetHeight;
    const x = Math.max(6, Math.min(vr.width - w - 6, r.left + r.width / 2 - vr.left - w / 2));
    tut.style.left = x + 'px';
    tut.style.top = Math.max(6, Math.min(r.top - vr.top, vr.height) - h - 26) + 'px';
    tut.querySelector('.tut-arrow').style.left = Math.max(10, Math.min(w - 10, r.left + r.width / 2 - vr.left - x)) + 'px';
  }
  function updateTutorial() {
    const s = tutorial.step, b = battle;
    if (!s || !b || b.state !== 'play') { $('tut').hidden = true; return; }
    if (s === 'deploy') pointAt($('cards').children[0], 'Tap Pip to send him into battle!');
    else if (s === 'pouchWait') { $('tut').hidden = true; if (b.t > 10 && AW.canPouch(b)) tutorial.step = 'pouch'; }
    else if (s === 'pouch') pointAt($('btn-pouch'), 'Upgrade your pouch to earn acorns faster!');
    else if (s === 'roarWait' || s === 'watchRoar') { $('tut').hidden = true; if (b.roar.charge >= 1 && b.ents.filter((e) => e.side === 0 && e.state !== 'dead').length >= 3 && b.ents.some((e) => e.side === 1 && e.state !== 'dead')) tutorial.step = 'roar'; }
    else if (s === 'roar') pointAt($('btn-roar'), 'Battle Cry is ready! Power up every hero on the field!');
  }

  function pause(on) {
    if (!battle || ended) return;
    paused = on;
    if (on) {
      PF.gameplayStop();
      openModal('Paused', settingsToggles() +
        '<p class="tip-line">Drag the battlefield to look around · 1-0 deploy · E pouch · R Battle Cry · F speed</p>',
        [['Quit', 'red', () => { closeModal(); quitBattle(); }], ['Retry', 'wood', () => { closeModal(); const o = battleOpts; startBattle(o.def, {}); }], ['Resume', 'green', () => { closeModal(); }]],
        () => { paused = false; PF.gameplayStart(); });
      bindToggles();
    }
  }
  function quitBattle() {
    battle.state = 'lost';
    AW.finishBattle(state, battle);
    battle = null; save();
    transition(enterHome);
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
    openModal('', '<div class="res-head">' + title('Defeat', 5, 'gray', 8, 'result-title lose') + '</div><p style="text-align:center">Your burrow fell! Watch an ad for a <b>Second Wind</b>: your burrow is restored to 60%, every enemy is blown back and Battle Cry is charged.</p>',
      [['No thanks', 'gray', () => { closeModal(); finishAndShow(); }], ['Second Wind', 'gold ad', () => {
        PF.rewarded((ok) => {
          if (ok && AW.revive(battle)) { closeModal(); ended = false; endT = 0; AU.play('battle'); PF.gameplayStart(); toast('<b>Second Wind!</b> Back into the fight', 'green'); }
          else toast('The ad did not finish', 'pink');
        });
      }]], null, true, 'result');
  }

  function lootTile(ic, v, label, isNew) { return '<div class="lt fx-card' + (isNew ? ' new' : '') + '">' + icon(ic) + '<span class="num">' + v + '</span>' + (label ? '<small>' + label + '</small>' : '') + '</div>'; }

  function finishAndShow() {
    const b = battle, def = b.def;
    const res = AW.finishBattle(state, b);
    save();
    if (def.kind === 'tower' && res.won) PF.submitScore(state.tower);
    if (res.won && (res.regionClear || def.boss)) PF.happytime();
    AU.play('home');
    const won = res.won;
    let html = '<div class="res-head">' + (won ? '<div class="rays"></div>' : '') + title(won ? 'Victory!' : 'Defeat', 5, won ? 'gold' : 'gray', 8, 'result-title' + (won ? '' : ' lose'));
    if (def.kind === 'story' && won) {
      html += '<div class="rstars">' + [1, 2, 4].map((m, i) => '<img class="px' + ((res.stars & m) ? ' pop' : '') + '" style="animation-delay:' + (0.3 + i * 0.28) + 's" src="' + SPR.url((res.stars & m) ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</div>';
      [1, 2, 4].forEach((m, i) => { if (res.stars & m) setTimeout(() => AU.star(i), 350 + i * 280); });
    }
    html += '</div>';
    if (def.kind === 'story' && won) html += '<div class="goals" style="align-items:center">' + starGoals(def, res.stars) + '</div>';
    const loot = [];
    if (res.coins) loot.push(lootTile('coin', '+' + fmt(res.coins), 'coins'));
    if (res.gems) loot.push(lootTile('gem', '+' + res.gems, 'first clear', true));
    if (res.silver) loot.push(lootTile('silver', '+' + res.silver, 'silver egg', true));
    if (res.gold) loot.push(lootTile('gold', '+' + res.gold, 'gold egg', true));
    if (res.seeds) loot.push(lootTile('seed', '+' + res.seeds, 'seeds', true));
    if (res.fruit) loot.push(lootTile('fruit', '+' + res.fruit, 'star fruit', true));
    res.items.forEach((it) => loot.push(lootTile(it, '+1', CT.ITEMS.find((x) => x.id === it).name, true)));
    if (loot.length) html += '<div class="loot">' + loot.join('') + '</div>';
    res.unlocked.forEach((id) => { html += '<div class="loot"><div class="lt ' + rarFrame(0) + ' new" style="flex-direction:row;gap:10px;padding:2px 10px">' + heroFit(id, 0, 72, 48) + '<span>' + esc(AW.HERO[id].names[0]) + ' joined your army!</span></div></div>'; });
    if (res.regionClear) html += '<p class="tip-line"><b>' + esc(CT.REGIONS[def.r].name) + ' is free!</b> ' + (def.d === 0 && def.r < 7 ? esc(CT.REGIONS[def.r + 1].name) + ' and Hard mode are open.' : 'The next difficulty is open.') + '</p>';
    if (!won) html += '<p class="tip-line">' + defeatTip() + '</p>';
    const acts = [];
    if (won && res.coins >= 100 && PF.canRewarded()) acts.push(['×2 Coins', 'gold ad', (btn) => {
      PF.rewarded((ok) => { if (ok) { state.coins += res.coins; state.stats.coinsEarned += res.coins; save(); toast(icon('coin') + '<b>+' + fmt(res.coins) + '</b> coins', 'green'); btn.disabled = true; renderCurrencies(); } });
    }]);
    acts.push(['Home', 'wood', () => leaveResult(() => transition(enterHome))]);
    if (!won) acts.push(['Upgrade', 'blue', () => leaveResult(() => transition(() => { enterHome(); openPanel('army'); }))]);
    acts.push(['Retry', won ? 'wood' : 'gold', () => leaveResult(() => startBattle(def, {}))]);
    if (won) { const next = nextAfter(def); if (next) acts.push(['Next ▶', 'green', () => leaveResult(() => openStage(next))]); }
    openModal('', html, acts, null, true, 'result');
    battle = null;
  }

  function defeatTip() {
    const tips = ['Level up your heroes in the Army.', 'Upgrade the Lab: Training Grounds makes every hero stronger.', 'Hatch eggs for stronger heroes.', 'Keep cheap walls like Pip and Shelly coming while saving for big hitters.', 'Upgrade your pouch early to earn acorns faster.', 'Use Battle Cry when lots of heroes are on the field: they all hit harder, move faster and take less damage.'];
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

  function leaveResult(next) {
    closeModal();
    if (AW.storyCleared(state) >= 3) PF.midgame(() => next()); else next();
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  let modalOnClose = null;
  // actions: [label, colour (+ ' ad' / ' pulse'), handler]
  function openModal(head, html, actions, onClose, noX, kind) {
    const t = $('modal-title');
    t.innerHTML = head ? title(head, head.length > 16 ? 2 : 3, 'cream') + '<span hidden>' + esc(head) + '</span>' : '';
    $('modal-body').innerHTML = html;
    const box = $('modal-actions');
    box.innerHTML = '';
    (actions || []).forEach((a) => {
      const parts = (a[1] || 'wood').split(' ');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn bt2 fx-btn-' + parts[0] + (parts.indexOf('ad') >= 0 ? ' ad' : '') + (parts.indexOf('pulse') >= 0 ? ' pulse' : '');
      b.innerHTML = a[0];
      b.addEventListener('click', () => { AU.click(); a[2](b); });
      box.appendChild(b);
    });
    if (box.lastChild) box.lastChild.classList.add('primary');
    $('modal-x').hidden = !!noX;
    $('modal').className = 'modal' + (kind ? ' ' + kind : '');
    modalOnClose = onClose || null;
    $('modal').hidden = false;
    fillIcons($('modal'));
    fitLabels($('modal'));
  }
  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    const f = modalOnClose; modalOnClose = null;
    if (f) f();
  }

  function sw(k) { const on = k === 'music' ? state.settings.music : k === 'sfx' ? state.settings.sfx : state.settings.autoCam; return '<button type="button" data-toggle="' + k + '" class="switch' + (on ? ' on' : '') + '" aria-label="' + k + '"></button>'; }
  function settingsToggles() { return '<div class="toggle"><span>Music</span>' + sw('music') + '</div><div class="toggle"><span>Sound effects</span>' + sw('sfx') + '</div><div class="toggle"><span>Camera follows the front line</span>' + sw('cam') + '</div>'; }
  function bindToggles() {
    document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const k = b.getAttribute('data-toggle');
      if (k === 'music') { state.settings.music = !state.settings.music; AU.setMusic(state.settings.music); }
      if (k === 'sfx') { state.settings.sfx = !state.settings.sfx; AU.setSfx(state.settings.sfx); }
      if (k === 'cam') { state.settings.autoCam = !state.settings.autoCam; if (state.settings.autoCam) R.setAuto(); }
      const on = k === 'music' ? state.settings.music : k === 'sfx' ? state.settings.sfx : state.settings.autoCam;
      b.classList.toggle('on', on);
      AU.click(); markDirty();
    }));
  }

  // ---------------------------------------------------------------------------
  // Windows
  // ---------------------------------------------------------------------------
  const PANELS = {
    map: { title: 'World Map', render: renderMap },
    hatch: { title: 'Hatchery', render: renderHatch },
    army: { title: 'Army', render: renderArmy },
    lab: { title: 'Lab', render: renderLab },
    rewards: { title: 'Rewards', render: renderRewards },
    events: { title: 'Events', render: renderEvents },
    tower: { title: 'Gloom Tower', render: renderTower },
    medals: { title: 'Medals', render: renderMedals },
    book: { title: 'Book', render: renderBook }
  };
  function openPanel(name) {
    if (!PANELS[name]) return;
    if (mode === 'battle') return;
    panelName = name; mode = 'menu';
    setAppClass('menu');
    $('panel-title').innerHTML = title(PANELS[name].title, 3, 'cream') + '<span hidden>' + PANELS[name].title + '</span>';
    rerender();
    $('panel-body').scrollTop = 0;
  }
  // Painted region art in menus: zoomed by a whole number to cover its box (anchored at the ground).
  function fitBgs(root) {
    root.querySelectorAll('[data-art]').forEach((el) => {
      const [w, h] = el.getAttribute('data-art').split('x').map(Number);
      if (!el.clientWidth) return;
      const k = Math.max(1, Math.ceil(Math.max(el.clientWidth / w, el.clientHeight / h)));
      el.style.backgroundSize = w * k + 'px ' + h * k + 'px';
    });
  }
  function rerender() {
    if (!panelName) return;
    const top = $('panel-body').scrollTop;
    PANELS[panelName].render($('panel-body'));
    fillIcons($('panel-body'));
    fitLabels($('panel-body'));
    fitBgs($('panel-body'));
    renderCurrencies();
    $('panel-body').scrollTop = top;
  }
  function closePanel() { swapPick = null; enterHome(); }
  function on(root, sel, fn) { root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { AU.click(); fn(el, e); })); }
  function bar(frac, cls) { return '<div class="' + (cls || '') + ' fx-insetDark"><i style="width:' + Math.max(0, Math.min(100, frac * 100)) + '%"></i></div>'; }
  function head(ic, text, sub) { return '<div class="sec"><h3>' + (ic ? icon(ic) : '') + esc(text) + '</h3><span class="grow"></span>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>'; }

  // --- Map ----------------------------------------------------------------------
  const CHEST_TIERS = [12, 24, 36];
  function chestReward(d, r, k) {
    if (k === 0) return { gems: 100 * (d + 1) };
    if (k === 1) return { silver: 2 + d, coins: 3000 * (r + 1) * (d + 1) };
    return { gold: 1, gems: 200 * (d + 1) };
  }
  function rewardText(o) {
    const out = [];
    if (o.gems) out.push(SPR.img('icon_gem', 1) + o.gems);
    if (o.coins) out.push(SPR.img('icon_coin', 1) + fmt(o.coins));
    if (o.silver) out.push(SPR.img('icon_silver', 1) + o.silver);
    if (o.gold) out.push(SPR.img('icon_gold', 1) + o.gold);
    if (o.seeds) out.push(SPR.img('icon_seed', 1) + o.seeds);
    if (o.fruit) out.push(SPR.img('icon_fruit', 1) + o.fruit);
    return out.join(' ');
  }
  function rewardTiles(o) {
    const out = [];
    if (o.coins) out.push(lootTile('coin', fmt(o.coins), 'coins'));
    if (o.gems) out.push(lootTile('gem', o.gems, 'gems', true));
    if (o.silver) out.push(lootTile('silver', o.silver, 'silver egg', true));
    if (o.gold) out.push(lootTile('gold', o.gold, 'gold egg', true));
    if (o.seeds) out.push(lootTile('seed', o.seeds, 'seeds', true));
    if (o.fruit) out.push(lootTile('fruit', o.fruit, 'star fruit', true));
    return out.join('');
  }
  function grant(o) {
    if (o.gems) state.gems += o.gems;
    if (o.coins) { state.coins += o.coins; state.stats.coinsEarned += o.coins; }
    if (o.silver) state.tickets.silver += o.silver;
    if (o.gold) state.tickets.gold += o.gold;
    if (o.seeds) state.seeds += o.seeds;
    if (o.fruit) state.fruit += o.fruit;
  }

  // Twelve stops along a winding road (percent positions).
  const ROAD = [[6, 78], [14, 54], [23, 76], [31, 52], [40, 76], [48, 50], [57, 74], [65, 50], [73, 74], [80, 52], [87, 76], [92, 40]];
  function renderMap(el) {
    const d = ui.mapDiff;
    let r = ui.mapRegion;
    if (!AW.regionOpen(state, d, r)) { r = 0; for (let i = 0; i < 8; i++) if (AW.regionOpen(state, d, i)) r = i; ui.mapRegion = r; }
    const R0 = CT.REGIONS[r];
    let h = '<div class="row"><div class="seg fx-insetDark">' + CT.DIFFICULTIES.map((D) => {
      const open = AW.regionOpen(state, D.id, 0);
      return '<button type="button" data-diff="' + D.id + '" class="bt2 sm fx-btn-' + (D.id === d ? ['green', 'gold', 'pink'][D.id] : 'dark') + '"' + (open ? '' : ' style="filter:grayscale(1) brightness(.7)"') + '>' + (open ? '' : SPR.img('icon_lock', 1)) + D.name + '</button>';
    }).join('') + '</div><span class="grow"></span><span class="sub">' + icon('star') + ' <b>' + AW.totalStars(state) + '</b> stars</span></div>';
    h += '<div class="regions">' + CT.REGIONS.map((Rg, i) => {
      const open = AW.regionOpen(state, d, i);
      return '<button type="button" data-region="' + i + '" class="rg fx-cardDark' + (i === r ? ' on' : '') + (open ? '' : ' locked') + '"><span class="rgi" data-art="160x60" style="background-image:url(' + R.themeArt(Rg.theme, 160, 60, false) + ')"></span>' +
        '<span class="rgk">' + (i + 1) + '</span>' + (open ? '<span class="rgs">' + SPR.img('icon_star', 1) + AW.regionStars(state, d, i) + '</span>' : '<span class="lk">' + icon('lock') + '</span>') + '<span class="rgn">' + esc(Rg.name) + '</span></button>';
    }).join('') + '</div>';
    const pts = ROAD.map((p) => p[0] + ',' + p[1]).join(' ');
    h += '<div class="mapscroll"><div class="mapview" data-art="480x200" style="background-image:url(' + R.themeArt(R0.theme, 480, 200, true) + ')">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="#2a160c" vector-effect="non-scaling-stroke" stroke-linejoin="round" style="stroke-width:14px"/><polyline points="' + pts + '" fill="none" stroke="#f3e2bc" stroke-dasharray="10 8" vector-effect="non-scaling-stroke" style="stroke-width:6px"/></svg>' +
      '<div class="mv-title">' + title(R0.name, 3, 'cream') + '</div><div class="mv-stars fx-plaque">' + icon('star') + AW.regionStars(state, d, r) + ' / 36</div>';
    for (let i = 0; i < 12; i++) {
      const open = AW.stageOpen(state, d, r, i), mask = state.stars[AW.stageKey(d, r, i)] || 0;
      const cleared = state.clear[d][r] > i, next = open && !cleared;
      const boss = i === 11, brute = i === 5;
      const col = cleared ? 'green' : next ? 'gold' : 'gray';
      const art = boss ? enemyFit(R0.boss, 96, 64, '', 3) : brute ? enemyFit(R0.pool.c[0], 64, 44) : '';
      h += '<button type="button" class="node sq fx-btn-' + col + (boss ? ' boss' : '') + (next ? ' next' : '') + '" data-stage="' + i + '" style="left:' + ROAD[i][0] + '%;top:' + ROAD[i][1] + '%" title="' + esc(R0.names[i]) + '">' +
        (art ? '<span class="nb">' + art + '</span>' : '') + (open ? (i + 1) : '<span class="lockic">' + SPR.img('icon_lock', 2) + '</span>') +
        (cleared ? '<span class="ns">' + [1, 2, 4].map((m) => '<img class="px" src="' + SPR.url((mask & m) ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</span>' : '') + '</button>';
    }
    h += '</div></div>';
    const stars = AW.regionStars(state, d, r);
    h += '<div class="chests">' + CHEST_TIERS.map((need, k) => {
      const done = !!state.flags['chest' + d + r + k];
      const ready = !done && stars >= need;
      return '<button type="button" class="chest fx-card' + (done ? ' done' : ready ? ' pulse' : '') + '" data-chest="' + k + '"' + (ready ? '' : ' data-locked="1"') + '>' + icon('chest') + '<span class="grow"><span class="cr">' + need + '★ chest: ' + rewardText(chestReward(d, r, k)) + (done ? ' ✓' : '') + '</span>' + bar(Math.min(1, stars / need), 'cbar') + '</span></button>';
    }).join('') + '</div>';
    el.innerHTML = h;
    on(el, '[data-diff]', (b) => { const v = Number(b.getAttribute('data-diff')); if (!AW.regionOpen(state, v, 0)) { lockTip(b, 'Clear all of ' + CT.REGIONS[0].name + ' on ' + CT.DIFFICULTIES[v - 1].name + ' to unlock ' + CT.DIFFICULTIES[v].name); return; } ui.mapDiff = v; rerender(); });
    on(el, '[data-region]', (b) => { const v = Number(b.getAttribute('data-region')); if (!AW.regionOpen(state, d, v)) { const pr = CT.REGIONS[Math.max(0, v - 1)]; lockTip(b, 'Beat ' + AW.ENEMY[pr.boss].name + ' at ' + v + '-12' + (d ? ' on ' + CT.DIFFICULTIES[d].name : '') + ' to unlock'); return; } ui.mapRegion = v; rerender(); });
    on(el, '[data-stage]', (b) => { const i = Number(b.getAttribute('data-stage')); if (!AW.stageOpen(state, d, r, i)) { lockTip(b, 'Clear stage ' + (r + 1) + '-' + i + ' first'); return; } openStage(AW.stageDef(d, r, i)); });
    on(el, '[data-chest]', (b) => {
      const k = Number(b.getAttribute('data-chest'));
      if (b.getAttribute('data-locked')) { if (!state.flags['chest' + d + r + k]) lockTip(b, 'Collect ' + CHEST_TIERS[k] + ' stars in ' + R0.name + ' to open'); return; }
      const rw = chestReward(d, r, k);
      state.flags['chest' + d + r + k] = true; grant(rw); AU.claim(); save();
      toast('Star chest: ' + rewardText(rw), 'green'); rerender();
    });
  }

  function starGoals(def, mask) {
    const g = [['Win the battle', 1], ['Keep your burrow above 50%', 2], ['Win within ' + Math.floor(def.par / 60) + ':' + String(def.par % 60).padStart(2, '0'), 4]];
    return g.map((x) => '<div>' + '<img class="px" src="' + SPR.url((mask & x[1]) ? 'icon_star' : 'icon_starOff') + '" alt=""> <span class="' + ((mask & x[1]) ? '' : 'off') + '">' + x[0] + '</span></div>').join('');
  }
  function foesOf(def) {
    const seen = {}, out = [];
    for (const l of def.lines) if (!seen[l.e]) { seen[l.e] = 1; out.push({ id: l.e, boss: !!l.boss }); } else if (l.boss) out.find((o) => o.id === l.e).boss = true;
    return out;
  }
  function traitChips(traits) { return traits.map((t) => '<span class="trait" style="background:' + CT.TRAITS[t].color + '">' + CT.TRAITS[t].name + '</span>').join(''); }
  function foesHtml(def) {
    return '<div class="foes">' + foesOf(def).map((f) => {
      const e = AW.ENEMY[f.id], known = state.seen[f.id];
      return '<div class="foe fx-cardDark' + (f.boss ? ' boss' : '') + '"><span class="fi">' + enemyFit(f.id, 74, 44, known ? '' : 'unk') + '</span><span>' + (known ? esc(e.name) : '???') + '</span>' + (known ? '<span>' + traitChips(e.traits) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function itemsHtml() {
    return '<div class="items">' + CT.ITEMS.map((it) => '<button type="button" class="item fx-card' + (ui.items[it.id] ? ' on' : '') + (state.items[it.id] ? '' : ' none') + '" data-item="' + it.id + '" title="' + esc(it.desc) + '">' + icon(it.id) + '<span><b>' + esc(it.name) + '</b><span class="muted">' + esc(it.desc) + '</span></span><span class="ic">×' + state.items[it.id] + '</span></button>').join('') + '</div>';
  }
  function lineupMini() {
    return '<div class="lineup-mini">' + state.lineup.map((id) => id ? '<span class="lm ' + rarFrame(AW.HERO[id].rarity) + '">' + heroFit(id, state.heroes[id].form, 40, 30) + '</span>' : '<span class="lm empty fx-cardDark"></span>').join('') + '</div>';
  }

  function openStage(def) {
    if (mode !== 'menu' && mode !== 'home') enterHome();
    const mask = def.kind === 'story' ? (state.stars[def.key] || 0) : 0;
    const first = def.kind === 'story' && state.clear[def.d][def.r] === def.i;
    for (const k in ui.items) if (!state.items[k]) ui.items[k] = false;
    let h = '';
    if (def.kind === 'story') h += '<p class="tip-line">' + esc(def.region) + ' · <b style="color:' + ['#2e8a3a', '#c08010', '#c03a9a'][def.d] + '">' + CT.DIFFICULTIES[def.d].name + '</b>' + (def.boss ? ' · <b class="bad">BOSS STAGE</b>' : '') + '</p>';
    h += head('skull', 'The Gloom') + foesHtml(def);
    if (def.kind === 'story') h += head('star', 'Star goals') + '<div class="goals">' + starGoals(def, mask) + '</div>';
    const rw = { coins: def.coins };
    if (first) rw.gems = def.gems;
    if (def.kind === 'tower' && state.tower === def.floor - 1) { rw.gems = def.gems; rw.gold = def.gold; }
    if (def.kind === 'event') Object.assign(rw, def.rewards);
    h += head('chest', 'Rewards', first ? 'First clear bonus included' : '') + '<div class="loot" style="justify-content:flex-start">' + rewardTiles(rw) + '</div>';
    h += head('charge', 'Boosts', 'Tap to use one') + itemsHtml();
    h += head('army', 'Lineup') + lineupMini();
    const label = def.kind === 'story' ? stageLabel(def) + ' ' + def.name : def.name;
    openModal(label, h, [['Edit lineup', 'wood', () => { closeModal(); openPanel('army'); }], [title('Battle!', 3, 'cream'), 'green pulse', () => startBattle(def, { items: Object.assign({}, ui.items) })]]);
    on($('modal-body'), '[data-item]', (b) => {
      const k = b.getAttribute('data-item');
      if (!state.items[k]) { lockTip(b, 'You have none yet. Buy boosts in Rewards'); return; }
      ui.items[k] = !ui.items[k]; b.classList.toggle('on', ui.items[k]);
    });
  }

  // --- Hatchery -------------------------------------------------------------------
  function renderHatch(el) {
    const day = AW.dayNumber(now()), f = AW.featured(day), t = now();
    const royal = AW.BANNER.royal;
    let h = '';
    if (AW.welcomeReady(state)) h += '<div class="tile fx-cardHot row"><span>' + SPR.img('egg_3', 2) + '</span><div class="grow"><h4>Welcome gift!</h4><span class="muted">A free ×10 Royal hatch with at least one Epic hero.</span></div><button type="button" class="bt2 fx-btn-gold pulse" id="welcome">Hatch ×10 free</button></div>';
    const fe = [f.legend, f.mythic, f.epic].filter(Boolean);
    h += '<div class="banner fx-windark"><div class="bn-art">' + (fe[1] ? heroFit(fe[1], 0, 90, 76, 'fh l') : '') + SPR.img('egg_3', 4, 'egg-big') + (fe[0] ? heroFit(fe[0], 0, 90, 76, 'fh r') : '') + '</div><div class="bn-info">' +
      title('Royal Nest', 3, 'gold') + '<p>' + esc(royal.desc) + '</p>' +
      '<div class="feat">' + fe.map((id) => '<span class="fx-plaque">' + heroFit(id, 0, 32, 28) + '<b style="color:' + SPR.RARITY_HEX[AW.HERO[id].rarity] + '">' + esc(AW.HERO[id].names[0]) + '</b>&nbsp;RATE UP</span>').join('') + '</div>' +
      '<div class="pity">Mythic or better within ' + (royal.pity.mythic - state.gacha.sinceMythic) + ' hatches · Legend within ' + (royal.pity.legend - state.gacha.sinceLegend) + '</div>' + bar(state.gacha.sinceMythic / royal.pity.mythic, 'pitybar') +
      '<div class="bn-btns"><button type="button" class="bt2 fx-btn-pink" data-hatch="royal" data-n="1">×1 ' + (state.tickets.gold > 0 ? icon('gold') + '1' : icon('gem') + royal.cost) + '</button>' +
      '<button type="button" class="bt2 lg fx-btn-gold" data-hatch="royal" data-n="10">×10 ' + (state.tickets.gold >= 10 ? icon('gold') + '10' : icon('gem') + royal.cost10) + '</button></div></div></div>';
    const silverFree = AW.freeEggReady(state, t);
    h += '<div class="banner fx-windark"><div class="bn-art">' + SPR.img('egg_1', 4, 'egg-big') + '</div><div class="bn-info">' + title('Meadow Nest', 3, 'green') +
      '<p>' + esc(AW.BANNER.silver.desc) + ' You have <b>' + state.tickets.silver + '</b> Silver Eggs.</p>' +
      '<div class="bn-btns"><button type="button" class="bt2 fx-btn-green' + (silverFree ? ' pulse' : '') + '" id="free-egg"' + (silverFree ? '' : ' disabled') + '>' + (silverFree ? 'Free egg!' : 'Free egg in ' + timeLeft(state.gacha.freeAt - t)) + '</button>' +
      '<button type="button" class="bt2 fx-btn-blue" data-hatch="silver" data-n="1">×1 ' + icon('silver') + '1</button>' +
      '<button type="button" class="bt2 fx-btn-blue" data-hatch="silver" data-n="10">×10 ' + icon('silver') + '10</button></div></div></div>';
    h += '<div class="rates fx-inset"><b>Odds</b><br>' + CT.BANNERS.map((B) => esc(B.name) + ': ' + [1, 2, 3, 4].filter((r) => B.rates[r]).map((r) => '<b class="rc' + r + '">' + rarityName(r) + ' ' + B.rates[r] + '%</b>').join(' · ')).join('<br>') +
      '<br>Rate up: a featured hero gets half of its rarity\'s chance. A ×10 Royal hatch always includes an Epic or better. Duplicates give +1 level (up to +20), then coins. Gems and eggs are only ever earned by playing. Featured heroes change every day.</div>';
    el.innerHTML = h;
    on(el, '[data-hatch]', (b) => doHatch(b.getAttribute('data-hatch'), Number(b.getAttribute('data-n'))));
    const w = el.querySelector('#welcome'); if (w) w.addEventListener('click', () => { const res = AW.claimWelcome(state, Math.random, AW.dayNumber(now())); if (res) { save(); showHatch(res); } });
    const fr = el.querySelector('#free-egg'); if (fr) fr.addEventListener('click', () => { const res = AW.claimFreeEgg(state, now(), Math.random); if (res) { save(); showHatch(res); } });
  }
  function timeLeft(ms) { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000); return h ? h + 'h ' + m + 'm' : m + 'm'; }

  function doHatch(banner, n) {
    if (!AW.canHatch(state, banner, n)) {
      AU.deny();
      toast(banner === 'royal' ? 'Not enough gems: earn them from stages, quests and medals' : 'Not enough Silver Eggs', 'pink');
      return;
    }
    const res = AW.hatch(state, banner, n, Math.random, AW.dayNumber(now()));
    if (!res) return;
    save();
    showHatch(res);
  }

  let hatchQ = null;
  function showHatch(results) {
    hatchQ = { list: results, i: 0, phase: 'egg' };
    $('hatchery').hidden = false;
    AU.play('home');
    hatchStep();
  }
  function sparkles(col) {
    const st = $('h-stage');
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i');
      s.className = 'sparkle';
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 120;
      s.style.cssText = 'left:50%;top:45%;--dx:' + Math.round(Math.cos(a) * d) + 'px;--dy:' + Math.round(Math.sin(a) * d) + 'px;--rc:' + col;
      st.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }
  function hatchStep() {
    const q = hatchQ;
    if (!q) return;
    const st = $('h-stage'), info = $('h-info'), rays = $('h-rays');
    if (q.i >= q.list.length) { hatchSummary(); return; }
    const r = q.list[q.i];
    if (q.phase === 'egg') {
      rays.classList.remove('on');
      st.innerHTML = '<div class="egg wob">' + SPR.img('egg_' + Math.max(1, r.rarity), 7) + '</div>';
      info.innerHTML = title('Egg ' + (q.i + 1) + ' of ' + q.list.length, 3, 'cream');
      setBtnText($('h-next'), 'Crack!');
      $('h-skip').hidden = q.list.length < 2;
      AU.shake();
      q.phase = 'crack';
      return;
    }
    if (q.phase === 'crack') {
      AU.crack();
      st.innerHTML = '<div class="egg">' + SPR.img('egg_' + Math.max(1, r.rarity) + '_c', 7) + '</div>';
      q.phase = 'reveal';
      setTimeout(() => { if (hatchQ === q && q.phase === 'reveal') hatchStep(); }, 380);
      return;
    }
    if (q.phase === 'reveal') {
      const def = AW.HERO[r.id];
      rays.style.setProperty('--rc', SPR.RARITY_HEX[r.rarity]);
      rays.classList.toggle('on', r.rarity >= 1);
      st.innerHTML = '<div class="got">' + heroFit(r.id, 0, 300, Math.min(220, innerHeight * 0.34), '', 8) + '<div class="pedestal"></div></div>';
      if (r.rarity >= 2) sparkles(SPR.RARITY_HEX[r.rarity]);
      info.innerHTML = title(rarityName(r.rarity), 3, RAR_PAL[r.rarity]) + title(def.names[0], 4, 'cream') + '<div class="hx' + (r.isNew ? '' : ' dupe') + '">' + (r.isNew ? 'NEW HERO!' : r.plus ? 'Duplicate: +1 level' : '+' + fmt(r.coins) + ' coins') + '</div>';
      AU.reveal(r.rarity);
      if (r.rarity >= 3) PF.happytime();
      setBtnText($('h-next'), q.i + 1 < q.list.length ? 'Next' : 'OK');
      q.phase = 'next';
      return;
    }
    if (q.phase === 'next') { q.i++; q.phase = 'egg'; hatchStep(); }
  }
  function hatchSummary() {
    const q = hatchQ;
    if (q.list.length === 1) { endHatch(); return; }
    $('h-rays').classList.remove('on');
    $('h-stage').innerHTML = '<div class="sum">' + q.list.map((r) => '<div class="hero ' + rarFrame(r.rarity) + '"><div class="hi">' + heroFit(r.id, 0, 96, 64) + '</div><div class="hn">' + esc(AW.HERO[r.id].names[0]) + '</div>' + (r.isNew ? '<span class="new-tag">NEW</span>' : '') + '</div>').join('') + '</div>';
    const best = Math.max.apply(null, q.list.map((r) => r.rarity));
    $('h-info').innerHTML = title('Best: ' + rarityName(best), 3, RAR_PAL[best]);
    setBtnText($('h-next'), 'OK'); $('h-skip').hidden = true;
    q.phase = 'done';
  }
  function endHatch() { hatchQ = null; $('hatchery').hidden = true; if (panelName) rerender(); else refreshHome(); }

  // --- Army ---------------------------------------------------------------------
  function heroLvl(id) { const h = state.heroes[id]; return h.lvl + h.plus; }
  function renderArmy(el) {
    let h = head('army', 'Lineup', swapPick ? 'Tap a slot for <b>' + esc(heroName(swapPick)) + '</b>' : 'Tap a hero to remove it');
    h += '<div class="shelf fx-inset"><div class="lineup">' + state.lineup.map((id, i) => id ? '<button type="button" class="slot ' + rarFrame(AW.HERO[id].rarity) + (swapPick ? ' pick' : '') + '" data-slot="' + i + '">' + heroFit(id, state.heroes[id].form, 88, 72) + '<span class="lv">' + heroLvl(id) + '</span></button>' : '<button type="button" class="slot empty fx-cardDark' + (swapPick ? ' pick' : '') + '" data-slot="' + i + '">+</button>').join('') + '</div></div>';
    h += '<div class="row"><div class="seg fx-insetDark">' + [-1, 0, 1, 2, 3, 4].map((r) => '<button type="button" data-filter="' + r + '" class="bt2 sm fx-btn-' + (ui.armyFilter === r ? 'gold' : 'dark') + '">' + (r < 0 ? 'All' : rarityName(r)) + '</button>').join('') + '</div><span class="grow"></span><span class="sub">' + AW.ownedCount(state) + ' / ' + CT.HEROES.length + ' heroes</span><button type="button" class="bt2 sm fx-btn-blue" id="autofill">Auto-fill</button></div>';
    const list = CT.HEROES.filter((d) => ui.armyFilter < 0 || d.rarity === ui.armyFilter).slice().sort((a, b) => {
      const oa = state.heroes[a.id] ? 1 : 0, ob = state.heroes[b.id] ? 1 : 0;
      return ob - oa || b.rarity - a.rarity;
    });
    h += '<div class="roster">' + list.map(heroTile).join('') + '</div>';
    h += '<p class="panel-note">Heroes level up with coins. Evolve at level 10, and again at level 20 with Growth Seeds or Star Fruit from the Seed Grove event. Duplicates add bonus levels.</p>';
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
    if (!h) return '<button type="button" class="hero locked fx-cardDark" data-hero="' + d.id + '"><div class="hi">' + heroFit(d.id, 0, 96, 64) + '</div><div class="hn" style="color:' + SPR.RARITY_HEX[d.rarity] + '">' + rarityName(d.rarity) + '</div></button>';
    const inl = state.lineup.indexOf(d.id) >= 0;
    const up = AW.canLevel(state, d.id) || AW.canEvolve(state, d.id);
    return '<button type="button" class="hero ' + rarFrame(d.rarity) + '" data-hero="' + d.id + '">' + (inl ? '<span class="inl">IN</span>' : '') + (up ? '<span class="up"></span>' : '') +
      '<div class="hi">' + heroFit(d.id, h.form, 96, 64) + '</div><div class="hn">' + esc(d.names[h.form]) + '</div><span class="hst">' + [0, 1, 2].map((f) => '<img class="px" src="' + SPR.url(f <= h.form ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</span><span class="lv">Lv ' + h.lvl + (h.plus ? '+' + h.plus : '') + '</span></button>';
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
    const out = [[st.area ? 'Area attack' : 'Single target', false]];
    if (ab.strong) out.push(['Strong vs ' + T(ab.strong), true]);
    if (ab.massive) out.push(['3× vs ' + T(ab.massive), true]);
    if (ab.resist) out.push(['Resists ' + T(ab.resist), true]);
    if (ab.crit) out.push([Math.round(ab.crit * 100) + '% critical', true]);
    if (ab.kb) out.push([Math.round(ab.kb * 100) + '% knockback', true]);
    if (ab.freeze) out.push([Math.round(ab.freeze[0] * 100) + '% freeze ' + ab.freeze[1] + 's', true]);
    if (ab.slow) out.push([Math.round(ab.slow[0] * 100) + '% slow ' + ab.slow[1] + 's', true]);
    if (ab.weaken) out.push([Math.round(ab.weaken[0] * 100) + '% weaken ' + ab.weaken[1] + 's', true]);
    if (ab.wave) out.push([Math.round(ab.wave[0] * 100) + '% wave Lv ' + ab.wave[1], true]);
    if (ab.multi) out.push([ab.multi + ' hits per attack', true]);
    if (ab.base) out.push([ab.base + '× vs towers', true]);
    if (ab.survive) out.push(['Survives a fatal hit', true]);
    if (ab.burrow) out.push(['Burrows past the front', true]);
    if (ab.zkill) out.push(['Zombie Slayer', true]);
    if (ab.immune) out.push(['Immune: ' + ab.immune.map((x) => ({ kb: 'knockback', freeze: 'freeze', slow: 'slow', weaken: 'weaken' })[x]).join(', '), true]);
    return out;
  }
  const MAXB = { hp: Math.max.apply(null, CT.HEROES.map((h) => h.hp)), atk: Math.max.apply(null, CT.HEROES.map((h) => h.atk / h.rate)), rng: 150, spd: 56 };

  function openHero(id) {
    const def = AW.HERO[id], own = state.heroes[id];
    const form = own ? own.form : 0;
    const st = AW.heroStats(state, id);
    let h = '<div class="hd"><div class="hd-art ' + rarFrame(def.rarity) + '"><span class="hd-r fx-ribbon' + (def.rarity >= 3 ? 'Gold' : def.rarity >= 1 ? 'Blue' : '') + '">' + rarityName(def.rarity).toUpperCase() + '</span>' + heroFit(id, form, 196, innerHeight <= 520 ? 104 : 156, own ? '' : 'unk', 6) + '<div class="pedestal"></div></div><div class="hd-info">';
    h += '<div class="hd-name">' + esc(def.names[form]) + '</div>';
    if (own) {
      h += '<div class="lvbar">Lv ' + own.lvl + (own.plus ? ' <span class="good">+' + own.plus + '</span>' : '') + bar(own.lvl / AW.CONFIG.maxLevel, 'bar') + AW.CONFIG.maxLevel + '</div>';
      h += '<div class="forms">' + [0, 1, 2].map((f) => '<span class="fx-card' + (f > form ? ' lock' : '') + '" title="' + esc(def.names[f]) + '">' + heroFit(id, f, 44, 36) + (f === form ? '▲' : '') + '</span>').join('') + '</div>';
    } else h += '<p class="muted">' + (def.rarity === 0 && def.unlock ? 'Joins after you clear stage ' + (def.unlock[0] + 1) + '-' + (def.unlock[1] + 1) + '.' : 'Hatch it in the ' + (def.rarity === 4 ? 'Royal Nest' : 'Royal or Meadow Nest') + '.') + '</p>';
    h += '<p class="muted">' + esc(def.desc) + '</p>';
    const nxt = own && own.lvl < AW.CONFIG.maxLevel ? AW.heroStats(state, id, { lvl: own.lvl + 1, plus: own.plus, form: own.form }) : null;
    const d = (k) => nxt ? '<em>+' + fmt(nxt[k] - st[k]) + '</em>' : '';
    const stat = (ic, label, v, extra, frac) => '<div class="stat">' + icon(ic) + '<span>' + label + '</span><b>' + v + (extra || '') + '</b>' + (frac !== undefined ? '<span class="sbar"><i style="width:' + Math.min(100, frac * 100) + '%"></i></span>' : '') + '</div>';
    h += '<div class="stats">' + stat('heart', 'Health', fmt(st.hp), d('hp'), def.hp / MAXB.hp) + stat('sword', 'Attack', fmt(st.atk), d('atk'), (def.atk / def.rate) / MAXB.atk) +
      stat('target', 'Reach', st.rng, '', st.rng / MAXB.rng) + stat('boot', 'Speed', st.spd, '', st.spd / MAXB.spd) +
      stat('acorn', 'Cost', st.cost) + stat('clock', 'Cooldown', st.cd.toFixed(1) + 's') + '</div>';
    h += '<div class="abil">' + abilityLines(st).map((t) => '<span class="chip' + (t[1] ? ' hot' : '') + '">' + esc(t[0]) + '</span>').join('') + '</div></div></div>';
    const acts = [];
    if (own) {
      if (own.form < 2) {
        const n = AW.evolveNeed(id, own.form);
        const ok = (c) => c ? '' : ' class="no"';
        h += '<div class="evo fx-card">' + SPR.heroImg(id, own.form + 1, 2) + '<div class="grow"><b>Evolve to ' + esc(def.names[own.form + 1]) + '</b><div class="need"><span' + ok(own.lvl >= n.level) + '>Lv ' + n.level + '</span><span' + ok(state.coins >= n.coins) + '>' + SPR.img('icon_coin', 1) + fmt(n.coins) + '</span>' +
          (n.seeds ? '<span' + ok(state.seeds >= n.seeds) + '>' + SPR.img('icon_seed', 1) + state.seeds + '/' + n.seeds + '</span>' : '') + (n.fruit ? '<span' + ok(state.fruit >= n.fruit) + '>' + SPR.img('icon_fruit', 1) + state.fruit + '/' + n.fruit + '</span>' : '') + '</div><span class="muted">' + (own.form === 0 ? '+12% stats and a new look' : '+16% stats and a stronger ability') + '</span></div></div>';
        acts.push(['Evolve', AW.canEvolve(state, id) ? 'purple pulse' : 'purple', () => {
          if (!AW.evolve(state, id)) { AU.deny(); toast('Not ready to evolve yet', 'pink'); return; }
          AU.reveal(Math.max(2, def.rarity)); PF.happytime(); save(); openHero(id); if (panelName) rerender(); toast(heroFit(id, own.form, 48, 28) + '<b>' + esc(def.names[own.form]) + '</b> evolved!', 'violet');
        }]);
      }
      const inl = state.lineup.indexOf(id) >= 0;
      acts.push([inl ? 'Remove' : 'Add to lineup', 'wood', () => {
        if (inl) { if (state.lineup.filter(Boolean).length <= 1) { toast('Keep at least one hero', 'pink'); return; } state.lineup[state.lineup.indexOf(id)] = null; }
        else { const free = state.lineup.indexOf(null); if (free >= 0) state.lineup[free] = id; else { swapPick = id; toast('Lineup full: tap a slot to swap', 'violet'); } }
        markDirty(); closeModal(); if (panelName) rerender();
      }]);
      if (own.lvl < AW.CONFIG.maxLevel) acts.push(['Level up ' + SPR.img('icon_coin', 1) + fmt(AW.levelCost(id, own.lvl)), state.coins >= AW.levelCost(id, own.lvl) ? 'gold' : 'gray', () => {
        if (!AW.levelUp(state, id)) { AU.deny(); toast('Not enough coins', 'pink'); return; }
        AU.level(); markDirty(); openHero(id); if (panelName) rerender();
      }]);
    }
    openModal(def.names[form], h, acts);
  }

  // --- Lab ----------------------------------------------------------------------
  function renderLab(el) {
    let h = '<p class="panel-note">Permanent upgrades for your whole army, paid with coins.</p><div class="labg">';
    for (const l of CT.LAB) {
      const lv = state.lab[l.id], max = lv >= l.max, cost = max ? 0 : AW.labCost(l.id, lv);
      const val = (n) => l.id === 'start' ? '+' + n * l.per : l.id === 'rchg' ? '-' + (n * l.per).toFixed(1) + 's' : '+' + Math.round(n * l.per * 100) + '%';
      h += '<div class="lr fx-card"><span class="li fx-insetDark">' + icon(l.icon) + '</span><div class="lmain">' +
        '<div class="lhead"><b class="ln">' + esc(l.name) + '</b><span class="lvl num">Lv ' + lv + '<small>/' + l.max + '</small></span></div>' +
        '<div class="lx">' + esc(l.desc) + '</div>' +
        '<div class="lbar fx-insetDark"><i style="width:' + (100 * lv / l.max) + '%"></i></div>' +
        '<div class="lfx"><span class="now">' + val(lv) + '</span>' + (max ? '<span class="mx">MAX</span>' : '<span class="arrow">▶</span><span class="nxt">' + val(lv + 1) + '</span>') +
        '<button type="button" class="btn bt2 sm fx-btn-' + (max ? 'gray' : state.coins >= cost ? 'gold' : 'gray') + '" data-lab="' + l.id + '"' + (max ? ' disabled' : '') + '>' + (max ? 'MAX' : SPR.img('icon_coin', 1) + fmt(cost)) + '</button></div></div></div>';
    }
    el.innerHTML = h + '</div>';
    on(el, '[data-lab]', (b) => { if (AW.buyLab(state, b.getAttribute('data-lab'))) { AU.level(); markDirty(); rerender(); } else { AU.deny(); toast('Not enough coins', 'pink'); } });
  }

  // --- Rewards ------------------------------------------------------------------
  function loginPrompt() { openModal('Daily Gift', calendarHtml(), [['Claim!', 'gold pulse', () => { claimLoginNow(); closeModal(); }]]); }
  function calendarHtml() {
    const ready = AW.loginReady(state, now());
    const idx = state.login.count % 7;
    return '<div class="cal">' + CT.LOGIN.map((r, i) => {
      const cls = i < idx ? ' got' : (i === idx && ready ? ' today' : '');
      const ic = r.gold ? 'gold' : r.gems ? 'gem' : r.silver ? 'silver' : r.coins ? 'coin' : 'gift';
      const v = r.gold ? '1 + ' + r.gems : r.gems || r.silver || (r.coins ? fmt(r.coins) : 'Boost');
      return '<div class="day ' + (i === 6 ? 'fx-cardHot' : 'fx-card') + cls + '">Day ' + (i + 1) + icon(ic) + '<b>' + v + '</b></div>';
    }).join('') + '</div><p class="tip-line">Come back every day: Day 7 gives a Gold Egg.</p>';
  }
  function claimLoginNow() {
    const got = AW.claimLogin(state, now(), Math.random);
    if (!got) return;
    AU.claim(); save();
    toast('Day ' + state.login.count + ': ' + rewardText(got) + (got.item ? ' ' + SPR.img('icon_' + got.item, 1) : ''), 'green');
    refreshHome();
  }
  function welcomeHatchPrompt() {
    openModal('A gift for you!', '<p style="text-align:center">The Hatchery is open! Here is a free <b>×10 Royal hatch</b> with at least one <b class="rc2">Epic</b> hero.</p><div style="text-align:center">' + SPR.img('egg_3', 6, 'egg-big') + '</div>',
      [['Hatch!', 'gold pulse', () => { closeModal(); const res = AW.claimWelcome(state, Math.random, AW.dayNumber(now())); if (res) { save(); showHatch(res); } }]]);
  }
  function renderRewards(el) {
    const t = now();
    let h = '<div class="tile fx-card">' + head('gift', 'Daily Gift', AW.loginReady(state, t) ? '' : 'Next in ' + timeLeft(nextMidnight() - t)) + calendarHtml() + (AW.loginReady(state, t) ? '<button type="button" class="bt2 fx-btn-gold pulse" id="login">Claim today\'s gift</button>' : '') + '</div>';
    h += '<div class="tile fx-card">' + head('quest', 'Daily Quests', 'New in ' + timeLeft(nextMidnight() - t));
    state.daily.missions.forEach((m, i) => {
      const info = AW.missionInfo(state, m);
      h += '<div class="mis' + (info.claimed ? ' claimed' : '') + '"><span>' + esc(info.text) + '</span><span class="mb fx-insetDark"><i style="width:' + (100 * info.prog / info.n) + '%"></i><span>' + info.prog + ' / ' + info.n + '</span></span>' +
        (info.claimed ? '<span class="mr good">✔ Done</span>' : info.done ? '<button type="button" class="btn bt2 sm fx-btn-gold" data-mis="' + i + '">' + SPR.img('icon_gem', 1) + info.gems + '</button>' : '<span class="mr">' + icon('gem') + info.gems + '</span>') + '</div>';
    });
    const bonus = AW.missionBonusReady(state);
    h += '<div class="mis' + (state.daily.bonus ? ' claimed' : '') + '"><b>All quests done</b><span></span>' + (bonus ? '<button type="button" class="bt2 sm fx-btn-gold pulse" id="mbonus">' + SPR.img('icon_gem', 1) + '100 ' + SPR.img('icon_silver', 1) + '1</button>' : '<span class="mr">' + icon('gem') + '100 ' + icon('silver') + '1' + (state.daily.bonus ? ' ✔' : '') + '</span>') + '</div></div>';
    const fp = AW.farmPending(state, t);
    h += '<div class="tile fx-card">' + head('farm', 'Acorn Farm', fmt(AW.farmRate(state)) + ' coins/hour · holds 8 hours') + '<div class="farm">' + icon('coin') + '<div class="grow"><div class="fv">' + fmt(fp.coins) + '</div><span class="muted">' + (fp.full ? 'The farm is full! Collect it.' : 'Coins keep growing while you are away.') + '</span>' + bar(fp.hours / 8, 'cbar') + '</div>' +
      '<button type="button" class="bt2 fx-btn-green" id="farm"' + (fp.coins > 0 ? '' : ' disabled') + '>Collect</button>' + (PF.canRewarded() && fp.coins > 0 ? '<button type="button" class="bt2 fx-btn-gold ad" id="farm2">×2</button>' : '') + '</div></div>';
    h += '<div class="tile fx-card">' + head('charge', 'Boost Shop', 'Use boosts before a battle') + '<div class="shop">' + CT.ITEMS.map((it) => '<div class="ware fx-card"><div class="wtop"><span class="wi fx-insetDark">' + icon(it.id) + '</span><div class="grow"><b>' + esc(it.name) + '</b><span class="own">Owned ×' + state.items[it.id] + '</span></div></div><p>' + esc(it.desc) + '</p>' +
      '<button type="button" class="bt2 sm wide fx-btn-' + (state.coins >= it.price ? 'gold' : 'gray') + '" data-buy="' + it.id + '">' + SPR.img('icon_coin', 1) + fmt(it.price) + '</button></div>').join('') + '</div></div>';
    el.innerHTML = h;
    const lg = el.querySelector('#login'); if (lg) lg.addEventListener('click', () => { claimLoginNow(); rerender(); });
    on(el, '[data-mis]', (b) => { const g = AW.claimMission(state, Number(b.getAttribute('data-mis'))); if (g) { AU.claim(); toast(icon('gem') + '<b>+' + g + '</b> gems', 'green'); save(); rerender(); } });
    const mb = el.querySelector('#mbonus'); if (mb) mb.addEventListener('click', () => { if (AW.claimMissionBonus(state)) { AU.claim(); save(); rerender(); } });
    const fm = el.querySelector('#farm'); if (fm) fm.addEventListener('click', () => { const c = AW.claimFarm(state, now(), 1); if (c) { AU.claim(); toast(icon('coin') + '<b>+' + fmt(c) + '</b> coins', 'green'); save(); rerender(); } });
    const f2 = el.querySelector('#farm2'); if (f2) f2.addEventListener('click', () => PF.rewarded((ok) => { if (ok) { const c = AW.claimFarm(state, now(), 2); AU.claim(); toast(icon('coin') + '<b>+' + fmt(c) + '</b> coins', 'green'); save(); rerender(); } }));
    on(el, '[data-buy]', (b) => { if (AW.buyItem(state, b.getAttribute('data-buy'))) { AU.claim(); markDirty(); rerender(); } else { AU.deny(); toast('Not enough coins', 'pink'); } });
  }
  function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }

  // --- Events ---------------------------------------------------------------------
  function renderEvents(el) {
    let h = '<p class="panel-note">Entries refill every day at midnight.</p>';
    for (const E of CT.EVENTS) {
      const left = AW.eventEntriesLeft(state, E.id), open = AW.eventOpen(state, E.id, 0);
      h += '<div class="tile fx-card"><div class="mapview" data-art="320x48" style="height:140px;background-image:url(' + R.themeArt(E.theme, 320, 48, false, 160) + ')"><div class="mv-title">' + title(E.name, 3, 'cream') + '</div><div class="mv-stars fx-plaque">' + (open ? left + ' / ' + E.entries + ' entries' : SPR.img('icon_lock', 1) + ' ' + E.unlock + ' stages') + '</div></div><p class="muted">' + esc(E.desc) + '</p>';
      if (open) {
        h += '<div class="evls">';
        for (let l = 0; l < 5; l++) {
          const ok = AW.eventOpen(state, E.id, l), def = AW.eventDef(E.id, l);
          h += '<button type="button" class="evl fx-' + (ok && left > 0 ? 'card' : 'cardDark') + (ok ? '' : ' locked') + '" data-ev="' + E.id + '" data-lv="' + l + '"><b>Level ' + (l + 1) + '</b><span class="cr">' + (ok ? rewardText(def.rewards) : SPR.img('icon_lock', 1) + ' ' + Math.max(E.unlock, AW.EVENT_LEVELS[l].need) + ' stages') + '</span></button>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    el.innerHTML = h;
    on(el, '[data-ev]', (b) => {
      const id = b.getAttribute('data-ev'), l = Number(b.getAttribute('data-lv'));
      if (!AW.eventOpen(state, id, l)) { lockTip(b, 'Clear ' + Math.max(AW.EVENT[id].unlock, AW.EVENT_LEVELS[l].need) + ' story stages to unlock'); return; }
      if (AW.eventEntriesLeft(state, id) <= 0) { toast('No entries left today. Come back tomorrow!', 'pink'); return; }
      openStage(AW.eventDef(id, l));
    });
  }

  // --- Tower ----------------------------------------------------------------------
  function renderTower(el) {
    const f = state.tower + 1, def = AW.towerDef(f);
    let h = '<div class="mapview" data-art="320x80" style="height:220px;background-image:url(' + R.themeArt(7, 320, 80, true, 168) + ')"><div class="mv-title">' + title('Floor ' + f, 5, 'gold') + '</div><div class="mv-stars fx-plaque">Best: ' + state.tower + '</div></div>';
    h += '<p class="panel-note">The tower never ends and every floor gets tougher. ' + (PF.canLeaderboard() ? 'Your best floor is posted to the CrazyGames leaderboard.' : 'Climb as high as you can!') + '</p>';
    h += '<div class="tile fx-card">' + head('tower', 'Floor ' + f + (def.boss ? ' · BOSS' : '')) + foesHtml(def) + '<div class="loot" style="justify-content:flex-start">' + rewardTiles({ coins: def.coins, gems: def.gems, gold: def.gold }) + '</div><button type="button" class="bt2 lg wide fx-btn-green" id="climb">' + title('Climb!', 3, 'cream') + '</button></div>';
    h += '<div class="tiles">' + [1, 2, 3, 4, 5].map((k) => { const ff = f + k, dd = AW.towerDef(ff); return '<div class="tile fx-cardDark" style="color:#fff"><h4>Floor ' + ff + (dd.boss ? ' · BOSS' : '') + '</h4><span>' + rewardText({ coins: dd.coins, gems: dd.gems, gold: dd.gold }) + '</span></div>'; }).join('') + '</div>';
    el.innerHTML = h;
    el.querySelector('#climb').addEventListener('click', () => { AU.click(); openStage(def); });
  }

  // --- Medals -----------------------------------------------------------------------
  function renderMedals(el) {
    let h = '<div class="labg">';
    for (const it of AW.medalList(state)) {
      const frac = it.done ? 1 : Math.min(1, it.value / it.target);
      h += '<div class="lr fx-' + (it.ready ? 'cardHot' : 'card') + (it.done ? ' done' : '') + '"><span class="li fx-insetDark">' + icon('medal') + '</span><div class="lmain">' +
        '<div class="lhead"><b class="ln">' + esc(it.m.name) + '</b><span class="tiers">' + it.m.tiers.map((_, i) => '<img class="px" src="' + SPR.url(i < it.claimed ? 'icon_star' : 'icon_starOff') + '" alt="">').join('') + '</span></div>' +
        '<div class="lx">' + (it.done ? 'Every tier complete!' : esc(it.text)) + '</div>' +
        '<div class="lbar fx-insetDark"><i style="width:' + (100 * frac) + '%"></i></div>' +
        '<div class="lfx"><span class="now num">' + (it.done ? 'Done' : fmt(Math.min(it.value, it.target)) + ' / ' + fmt(it.target)) + '</span>' +
        (it.ready ? '<button type="button" class="btn bt2 sm fx-btn-gold pulse" data-medal="' + it.m.stat + '">' + SPR.img('icon_gem', 1) + it.gems + '</button>' : it.done ? '' : '<span class="mr">' + SPR.img('icon_gem', 1) + it.gems + '</span>') + '</div></div></div>';
    }
    el.innerHTML = h + '</div>';
    on(el, '[data-medal]', (b) => { const g = AW.claimMedal(state, b.getAttribute('data-medal')); if (g) { AU.claim(); toast(icon('gem') + '<b>+' + g + '</b> gems', 'green'); save(); rerender(); } });
  }

  // --- Book -------------------------------------------------------------------------
  function renderBook(el) {
    let h = '<div class="row"><div class="seg fx-insetDark"><button type="button" data-tab="heroes" class="bt2 sm fx-btn-' + (ui.bookTab === 'heroes' ? 'gold' : 'dark') + '">Heroes ' + AW.ownedCount(state) + '/' + CT.HEROES.length + '</button><button type="button" data-tab="gloom" class="bt2 sm fx-btn-' + (ui.bookTab === 'gloom' ? 'gold' : 'dark') + '">Gloom ' + Object.keys(state.seen).length + '/' + CT.ENEMIES.length + '</button></div></div>';
    if (ui.bookTab === 'heroes') h += '<div class="roster">' + CT.HEROES.map(heroTile).join('') + '</div>';
    else {
      h += '<div class="roster">' + CT.ENEMIES.map((e) => {
        const k = state.seen[e.id];
        return '<button type="button" class="hero fx-cardDark' + (k ? '' : ' locked') + '" data-enemy="' + e.id + '" style="color:#fff"><div class="hi">' + enemyFit(e.id, 96, 64) + '</div><div class="hn" style="color:#fff">' + (k ? esc(e.name) : '???') + '</div><div>' + (k ? traitChips(e.traits) : '') + '</div></button>';
      }).join('') + '</div>';
      h += '<div class="rates fx-inset">' + Object.keys(CT.TRAITS).map((t) => traitChips([t]) + ' ' + esc(CT.TRAITS[t].desc)).join('<br>') + '</div>';
    }
    el.innerHTML = h;
    on(el, '[data-tab]', (b) => { ui.bookTab = b.getAttribute('data-tab'); rerender(); });
    on(el, '[data-hero]', (b) => openHero(b.getAttribute('data-hero')));
    on(el, '[data-enemy]', (b) => {
      const e = AW.ENEMY[b.getAttribute('data-enemy')];
      if (!state.seen[e.id]) { AU.deny(); return; }
      openModal(e.name, '<div class="hd"><div class="hd-art fx-cardDark">' + enemyFit(e.id, 196, innerHeight <= 520 ? 104 : 156, '', 6) + '<div class="pedestal"></div></div><div class="hd-info"><div>' + (e.traits.length ? traitChips(e.traits) : '<span class="muted">No trait</span>') + '</div><p class="muted">' + esc(e.desc) + '</p>' +
        '<div class="stats"><div class="stat">' + icon('heart') + '<span>Health</span><b>' + fmt(e.hp) + '</b></div><div class="stat">' + icon('sword') + '<span>Attack</span><b>' + fmt(e.atk) + '</b></div><div class="stat">' + icon('target') + '<span>Reach</span><b>' + e.rng + '</b></div><div class="stat">' + icon('boot') + '<span>Speed</span><b>' + e.spd + '</b></div><div class="stat">' + icon('acorn') + '<span>Acorns</span><b>' + e.drop + '</b></div></div><p class="muted">Base stats; stages make the Gloom stronger.</p></div></div>', []);
    });
  }

  // --- Settings ---------------------------------------------------------------------
  function openSettings() {
    openModal('Settings', settingsToggles() +
      '<p class="tip-line">Tap a hero card (or 1-0) to deploy · E pouch · R or Space Battle Cry · F speed · drag or scroll to look around · P or Esc pause</p>' +
      '<p class="tip-line">Animal Wars v1.1 · Fonts: Pixelify Sans and Silkscreen (SIL Open Font License) · Music and sound are synthesized in your browser.</p>',
      [['Reset progress', 'red', () => {
        openModal('Reset?', '<p style="text-align:center">This deletes your heroes, stages and everything else. It cannot be undone.</p>', [['Cancel', 'wood', closeModal], ['Delete everything', 'red', () => { PF.remove(SAVE_KEY); state = AW.createState(now()); AW.ensureDaily(state, now()); closeModal(); save(); startFirstBattle(); }]]);
      }], ['Done', 'green', closeModal]]);
    bindToggles();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function bindInput() {
    $('btn-battle').addEventListener('click', () => { AU.unlock(); AU.click(); const n = nextStory(); if (n) openStage(n); else openPanel('map'); });
    $('quests').addEventListener('click', () => { AU.click(); openPanel('rewards'); });
    $('profile').addEventListener('click', () => { AU.click(); openPanel('medals'); });
    document.querySelectorAll('.nav [data-go]').forEach((b) => b.addEventListener('click', () => {
      AU.unlock();
      const k = b.getAttribute('data-go');
      if (b.classList.contains('locked')) { lockTip(b, stageReq(NEED[k]) + ' to unlock ' + PANELS[k].title); return; }
      AU.click();
      if (k === 'map') { const n = nextStory(); if (n) { ui.mapRegion = n.r; ui.mapDiff = 0; } }
      openPanel(k);
    }));
    $('panel-back').addEventListener('click', () => { AU.click(); closePanel(); });
    $('btn-settings').addEventListener('click', () => { AU.click(); openSettings(); });
    $('btn-sound').addEventListener('click', () => { AU.unlock(); setMuted(!AU.muted); });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#locktip')) hideLockTip(); }, true);
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
        const i = KEYS.indexOf(e.key);
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
    window.addEventListener('resize', () => { R.resize(); checkOrientation(); if (mode === 'battle') fitCardArt(); });
    // Landscape only on phones and tablets: in portrait a rotate prompt covers the game and battles pause.
    const portrait = window.matchMedia ? window.matchMedia('(orientation: portrait) and (pointer: coarse)') : null;
    function checkOrientation() {
      const rot = !!(portrait && portrait.matches);
      $('rotate').hidden = !rot;
      if (rot && mode === 'battle' && battle && !ended && !paused) pause(true);
    }
    if (portrait) { if (portrait.addEventListener) portrait.addEventListener('change', checkOrientation); else if (portrait.addListener) portrait.addListener(checkOrientation); }
    checkOrientation();
    // Ask the browser to keep landscape (works in fullscreen / installed web apps; ignored elsewhere).
    document.addEventListener('pointerdown', function lockOnce() {
      document.removeEventListener('pointerdown', lockOnce);
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ }
    });
    window.addEventListener('pagehide', save);
  }

  function toggleSpeed() { state.settings.speed = state.settings.speed === 2 ? 1 : 2; $('speed-t').textContent = state.settings.speed; $('btn-speed').classList.toggle('on', state.settings.speed === 2); AU.click(); markDirty(); }
  // Mute: the speaker icon is struck out while muted (and the choice is remembered).
  function setMuted(m) {
    AU.setMuted(m);
    const b = $('btn-sound');
    b.classList.toggle('muted', m);
    b.classList.toggle('fx-btn-red', m); b.classList.toggle('fx-btn-blue', !m);
    b.innerHTML = icon(m ? 'soundOff' : 'sound');
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.title = m ? 'Sound is off (M)' : 'Sound is on (M)';
    if (state && !!state.settings.muted !== m) { state.settings.muted = m; markDirty(); }
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  let lastT = 0, slow = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000);
    lastT = t;
    try {
      if (mode === 'battle' && battle && !ended && !paused && !$('rotate').hidden) pause(true);
      if (mode === 'battle') battleTick(dt);
      R.frame(paused && mode === 'battle' ? 0 : dt);
    } catch (e) { if (DEBUG) console.error(e); }
    slow += dt;
    if (slow > 1) {
      slow = 0;
      if (AW.ensureDaily(state, now())) { markDirty(); if (mode === 'home') refreshHome(); }
      if (mode === 'home') { updateBadges(); renderSide(); }
      if (dirty && now() - lastSave > 4000) save();
    }
  }

  function startFirstBattle() {
    enterHome();
    startBattle(AW.stageDef(0, 0, 0), {});
  }

  function boot() {
    PF.loadingStart();
    SPR.installFrames();
    const L = load();
    state = L.state;
    AW.ensureDaily(state, now());
    AU.setSfx(state.settings.sfx); AU.setMusic(state.settings.music);
    setMuted(!!state.settings.muted);
    R.init({ canvas: $('cv'), container: $('view') });
    fillIcons(document);
    bindInput();
    R.resize();
    PF.on('mute', (m) => AU.setExternalMute(m));
    PF.on('pause', (p) => { if (p) AU.suspend(); else AU.resume(); });
    PF.on('ready', () => { adoptCloud(); PF.loadingStop(); if (state.tower) PF.submitScore(state.tower); if (mode === 'home') refreshHome(); });
    PF.on('user', () => { if (mode === 'home') refreshHome(); });
    const away = now() - state.lastSeen;
    if (COVER) coverMode();
    else if (L.fresh) startFirstBattle();
    else {
      enterHome();
      const fp = AW.farmPending(state, now());
      if (away > 15 * 60000 && fp.coins > 0) {
        setTimeout(() => openModal('Welcome back!', '<div class="farm fx-card">' + icon('farm') + '<div class="grow"><p>Your Acorn Farm grew</p><div class="fv">' + icon('coin') + fmt(fp.coins) + ' coins</div></div></div>',
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
    logo.className = 'logo';
    const ls = Math.max(3, Math.round(innerHeight > innerWidth ? innerWidth / 150 : innerWidth / 240));
    logo.innerHTML = title('Animal', ls, 'cream') + '<div class="paws">' + icon('paw') + icon('paw') + icon('paw') + '</div>' + title('Wars', Math.round(ls * 1.8), 'gold');
    logo.style.cssText = 'position:absolute;left:50%;top:' + (innerHeight > innerWidth * 1.2 ? 16 : 6) + '%;transform:translateX(-50%);z-index:5;animation:none';
    $('view').appendChild(logo);
    R.resize();
    R.setMinimap(false);
    R.lookAt(mid - 34);
  }

  window.__aw = {
    AW: AW,
    get state() { return state; }, set state(s) { state = s; },
    get battle() { return battle; },
    get mode() { return mode; },
    startBattle: startBattle, openPanel: openPanel, enterHome: enterHome, save: save, openStage: openStage, openHero: openHero,
    get paused() { return paused; }, pause: pause
  };

  // Titles are drawn with the pixel font, so wait for it (briefly) before the first paint.
  const fontsReady = document.fonts && document.fonts.load ? Promise.race([Promise.all([document.fonts.load('700 8px AWPixel'), document.fonts.load('700 16px Cozy')]), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  Promise.all([fontsReady.catch(() => {}), SPR.loadAssets().catch(() => {})]).then(boot, boot);
})();
