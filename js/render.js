/* Animal Wars — scene renderer.
 * Draws the battlefield (or the home meadow) into a small pixel buffer and scales it up by a whole number.
 * World units are buffer pixels. The camera follows the front line until the player drags it.
 */
(function (root) {
  'use strict';

  const SPR = root.AWSprites;
  const mix = SPR.mix;

  const THEMES = [
    { name: 'meadow', sky: ['#6ec0f6', '#bfe9fb'], far: '#8cc79a', mid: '#57a868', ground: '#7cbc48', dirt: '#7a5236', deep: '#55381f', prop: 'tree', fx: 'petal', cloud: '#ffffff' },
    { name: 'dunes', sky: ['#ffbf73', '#ffecc4'], far: '#eab877', mid: '#d99a58', ground: '#e3ad62', dirt: '#a8683c', deep: '#6b423c', prop: 'cactus', fx: 'dust', cloud: '#fff6e0' },
    { name: 'peaks', sky: ['#8fb4e8', '#e4f0ff'], far: '#c8d8f0', mid: '#5a7a9a', ground: '#eef4ff', dirt: '#7f95c8', deep: '#4a5a90', prop: 'pine', fx: 'snow', cloud: '#ffffff' },
    { name: 'bog', sky: ['#3a4a5a', '#7a8a78'], far: '#4a5a4a', mid: '#3a4a3a', ground: '#557c46', dirt: '#3a4a34', deep: '#29342a', prop: 'shroom', fx: 'fog', cloud: '#9aaa98' },
    { name: 'caldera', sky: ['#3a1424', '#a8442a'], far: '#5a2a2a', mid: '#3a1a1a', ground: '#c0583e', dirt: '#7a2a24', deep: '#4a1a1a', prop: 'rock', fx: 'ember', cloud: '#7a4a4a' },
    { name: 'city', sky: ['#22223e', '#5a5a80'], far: '#3a3a5a', mid: '#2a2a40', ground: '#6a7498', dirt: '#2c3256', deep: '#1a1e3a', prop: 'lamp', fx: 'petal', cloud: '#5a5a7a' },
    { name: 'sky', sky: ['#5ab4ff', '#e8f8ff'], far: '#ffffff', mid: '#a8d8a0', ground: '#eef2ff', dirt: '#8a96c8', deep: '#5a6494', prop: 'island', fx: 'feather', cloud: '#ffffff' },
    { name: 'rift', sky: ['#07071a', '#29366f'], far: '#4a4a6a', mid: '#3a3a58', ground: '#8e8ebc', dirt: '#3a3e66', deep: '#24264a', prop: 'crystal', fx: 'star', cloud: '#5a5a8a' }
  ];

  let cv, ctx, container;
  const buf = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const b = buf ? buf.getContext('2d') : null;
  let W = 1, H = 1, DPR = 1, PXS = 3, BW = 1, BH = 1, KK = 3, GY = 100;
  let mode = 'home', battle = null, homeState = null, theme = THEMES[0], themeIdx = 0;
  let layers = null;
  const cam = { x: -60, target: -60, manual: 0, shake: 0 };
  const parts = [], floats = [], rings = [];
  let flashT = 0, flashCol = '#ffffff', time = 0;
  const strollers = [];
  const silCache = {};

  function init(opts) { cv = opts.canvas; container = opts.container; ctx = cv.getContext('2d', { alpha: false }); }

  function resize() {
    DPR = Math.min(2.5, root.devicePixelRatio || 1);
    W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
    // About 140-180 art pixels tall, whole-number scale; at least ~280 wide so the action fits.
    PXS = Math.max(1, Math.round(H / (mode === 'home' ? 205 : 155)));
    if (W / PXS < 280) PXS = Math.max(1, Math.floor(W / 185), Math.round(H / 240));
    BW = Math.ceil(W / PXS); BH = Math.ceil(H / PXS);
    KK = Math.max(1, Math.round(PXS * DPR));
    cv.width = BW * KK; cv.height = BH * KK;
    cv.style.width = BW * PXS + 'px'; cv.style.height = BH * PXS + 'px';
    buf.width = BW; buf.height = BH;
    GY = BH - Math.max(16, Math.round(BH * 0.14));
    buildLayers();
  }

  // ---------------------------------------------------------------------------
  // Backgrounds (built once per battle / resize)
  // ---------------------------------------------------------------------------
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function laneLen() { return mode === 'battle' && battle ? battle.L : 380; }

  // A painted background repeated side by side, every other copy mirrored so the seams match.
  const ART_GROUND = 164;  // row of the painted backgrounds where the ground meets the lane
  function tiled(art, w) {
    const c = mk(w, art.height), g = c.getContext('2d');
    for (let x = 0, i = 0; x < w; x += art.width, i++) {
      if (i % 2) { g.save(); g.translate(x + art.width, 0); g.scale(-1, 1); g.drawImage(art, 0, 0); g.restore(); } else g.drawImage(art, x, 0);
    }
    return c;
  }
  function paintedLayers(art, th, span, r) {
    const farW = Math.ceil(BW + span * 0.25 + 40);
    const strip = tiled(art, farW);
    const far = mk(farW, BH), fg = far.getContext('2d');
    const y0 = GY + 1 - ART_GROUND;
    fg.drawImage(strip, 0, y0);
    // Taller screens: continue the painted sky upward as a gradient that deepens toward the top.
    const sky = mk(1, BH), sg = sky.getContext('2d');
    const px0 = strip.getContext('2d').getImageData(0, 0, 1, 1).data;
    const top = '#' + [px0[0], px0[1], px0[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const sgrad = sg.createLinearGradient(0, 0, 0, Math.max(1, y0));
    sgrad.addColorStop(0, mix(top, '#0b1030', 0.35)); sgrad.addColorStop(1, top);
    sg.fillStyle = sgrad; sg.fillRect(0, 0, 1, BH);
    if (y0 > 0) fg.drawImage(sky, 0, 0, 1, y0, 0, 0, farW, y0);
    let mid = null;

    return { sky: sky, far: far, mid: mid };
  }

  function buildLayers() {
    if (!buf) return;
    const th = theme, L = laneLen();
    const span = L + 200;
    const r = rng(1234 + themeIdx * 77);
    const art = SPR.asset && SPR.asset('bg_' + th.name);
    if (art) {
      const pl = paintedLayers(art, th, span, r);
      layers = { sky: pl.sky, far: pl.far, mid: pl.mid, ground: groundStrip(th, r, root.AW_ASSETS && root.AW_ASSETS['bg_' + th.name]) };
      return;
    }
    // Sky.
    const sky = mk(1, BH);
    const sg = sky.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, GY);
    grad.addColorStop(0, th.sky[0]); grad.addColorStop(1, th.sky[1]);
    sg.fillStyle = grad; sg.fillRect(0, 0, 1, BH);
    // Far layer (0.25 parallax).
    const farW = Math.ceil(BW + span * 0.25 + 40);
    const far = mk(farW, BH), fg = far.getContext('2d');
    if (th.name === 'rift') {
      for (let i = 0; i < farW * BH / 90; i++) { fg.fillStyle = r() > 0.85 ? '#ffffff' : '#9aa8d0'; fg.fillRect(Math.floor(r() * farW), Math.floor(r() * GY * 0.8), 1, 1); }
      const px = farW * 0.3, py = GY * 0.28, pr = BH * 0.14;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) { const d = x * x + y * y; if (d <= pr * pr) { fg.fillStyle = (x + y) < -pr * 0.4 ? '#c88ae8' : d > pr * pr * 0.7 ? '#5a3a8a' : '#8a5ab8'; fg.fillRect(Math.round(px + x), Math.round(py + y), 1, 1); } }
    }
    // Clouds.
    if (th.name !== 'rift') for (let i = 0; i < farW / 70; i++) {
      const cx = r() * farW, cy = GY * (0.1 + r() * 0.3), cw = 14 + r() * 26;
      fg.fillStyle = hexA(th.cloud, th.name === 'bog' || th.name === 'city' || th.name === 'caldera' ? 0.35 : 0.85);
      for (let k = 0; k < 4; k++) blob(fg, cx + k * cw * 0.28, cy - (k % 2) * 3, cw * 0.32, cw * 0.18);
    }
    ridge(fg, farW, GY - BH * 0.18, BH * 0.16, th.far, r, th.name === 'peaks' ? 'peaks' : th.name === 'dunes' ? 'dunes' : th.name === 'city' ? 'skyline' : th.name === 'caldera' ? 'volcano' : 'hills');
    // Mid layer (0.55 parallax) with props.
    const midW = Math.ceil(BW + span * 0.55 + 60);
    const mid = mk(midW, BH), mg = mid.getContext('2d');
    ridge(mg, midW, GY - BH * 0.07, BH * 0.08, th.mid, r, th.name === 'dunes' ? 'dunes' : 'hills');
    for (let x = 10; x < midW; x += 22 + r() * 40) prop(mg, th.prop, x, GY - BH * 0.03 - r() * 4, th, r);
    layers = { sky: sky, far: far, mid: mid, ground: groundStrip(th, r) };
  }
  // Ground strip (1.0 parallax), tiled: the lane the armies walk on. Its colours come from the painting's own
  // terrain where one is used (art.ground), and its texture from the land: grass, sand, snow or paving.
  // Clean shapes only, and nothing touches the tile seam.
  const GROUND_STYLE = { meadow: 'grass', bog: 'grass', dunes: 'sand', caldera: 'sand', peaks: 'snow', sky: 'snow', city: 'stone', rift: 'stone' };
  function groundStrip(th, r, art) {
    const gw = 96, gh = BH - GY + 2;
    const ground = mk(gw, gh), gg = ground.getContext('2d');
    const px = function (c, x, y, w, h) { gg.fillStyle = c; gg.fillRect(x, y, w, h); };
    const style = GROUND_STYLE[th.name] || 'grass';
    const top = art && art.ground ? art.ground.top : th.ground;
    const dirt = art && art.ground ? mix(art.ground.band, top, 0.18) : th.dirt;
    const deep = mix(dirt, '#0b0b16', 0.35), lip = mix(top, '#ffffff', 0.32), shade = mix(top, dirt, 0.55), lite = mix(dirt, '#ffffff', 0.16);
    px(dirt, 0, 0, gw, gh);
    if (style === 'grass') {
      px(top, 0, 0, gw, 5); px(lip, 0, 0, gw, 1); px(shade, 0, 5, gw, 1);
      for (let x = 4; x < gw - 4; x += 12) { px(top, x, 5, 4, 1); px(shade, x + 1, 6, 2, 1); }
      for (let x = 3; x < gw - 3; x += 8) { px(lip, x, 1, 1, 2); px(lip, x + 3, 2, 1, 1); }
    } else if (style === 'snow') {
      px(top, 0, 0, gw, 6); px(mix(top, '#ffffff', 0.6), 0, 0, gw, 1); px(shade, 0, 6, gw, 1);
      for (let x = 2; x < gw - 8; x += 16) { px(mix(top, '#ffffff', 0.45), x, 1, 6, 1); px(top, x + 5, 6, 4, 1); px(top, x + 6, 7, 2, 1); }
    } else if (style === 'sand') {
      px(top, 0, 0, gw, 4); px(lip, 0, 0, gw, 1); px(shade, 0, 4, gw, 1);
      for (let x = 6; x < gw - 12; x += 22) { px(lite, x, 9, 8, 1); px(lite, x + 8, 8, 4, 1); }
    } else {
      // Paving: a lit kerb, then staggered slabs with mortar joints.
      px(top, 0, 0, gw, 4); px(lip, 0, 0, gw, 1); px(deep, 0, 4, gw, 1);
      for (let y = 5, row = 0; y < gh; y += 6, row++) {
        px(deep, 0, y + 5, gw, 1);
        for (let x = (row % 2 ? 8 : 0); x < gw; x += 16) { px(deep, x, y, 1, 5); px(lite, x + 1, y, 14, 1); }
      }
      for (let x = 0; x < gw; x += 24) px(deep, x, 0, 1, 4);
      return ground;
    }
    for (const [y, x0] of [[11, 6], [11, 52], [17, 28], [17, 74]]) if (y < gh - 1) px(deep, x0, y, 14 + Math.floor(r() * 6), 1);
    for (let i = 0; i < 4; i++) {
      const x = 6 + Math.floor(r() * (gw - 14)), y = 9 + Math.floor(r() * Math.max(1, gh - 12));
      px(deep, x, y + 1, 4, 1); px(lite, x + 1, y, 2, 1);
    }
    return ground;
  }
  // A still picture of a region (sky, hills, props, ground) for menus. Cached per theme and size.
  const artCache = {};
  // anchor: the painting row that lands on the bottom edge (default: just below the ground line).
  function themeArt(t, w, h, withBases, anchor) {
    const key = t + ':' + w + 'x' + h + ':' + (withBases ? 1 : 0) + ':' + (anchor || 0);
    if (artCache[key]) return artCache[key];
    const art = SPR.asset && SPR.asset('bg_' + THEMES[t % THEMES.length].name);
    if (art) {
      // The painting itself, shrunk by a whole factor when the slot is small, anchored on the ground line.
      const k = Math.max(1, Math.min(2, Math.floor(art.height / h), Math.floor(art.width / w)));
      const sw = w * k, sh = h * k, strip = tiled(art, Math.max(sw, art.width));
      const groundRow = anchor || ART_GROUND + 6;
      const sy = groundRow - sh;
      const c = mk(w, h), g = c.getContext('2d');
      g.imageSmoothingEnabled = k > 1;
      const sx = Math.max(0, Math.floor((strip.width - sw) / 2));
      if (sy < 0) g.drawImage(strip, sx, 0, sw, 1, 0, 0, w, Math.ceil(-sy / k));
      g.drawImage(strip, sx, Math.max(0, sy), sw, sh - Math.max(0, -sy), 0, Math.ceil(Math.max(0, -sy) / k), w, h - Math.ceil(Math.max(0, -sy) / k));
      g.imageSmoothingEnabled = false;
      if (withBases) {
        const tw = SPR.get('tower_' + (t % 8) + '_0');
        g.drawImage(tw, w - tw.width + 6, Math.round(h - 6 / k) - tw.height + 2);
      }
      artCache[key] = c.toDataURL();
      return artCache[key];
    }
    const save = { BW: BW, BH: BH, GY: GY, theme: theme, themeIdx: themeIdx, layers: layers, mode: mode, battle: battle };
    BW = w; BH = h; GY = h - Math.max(8, Math.round(h * 0.16)); theme = THEMES[t % THEMES.length]; themeIdx = t % THEMES.length; mode = 'art'; battle = null;
    buildLayers();
    const c = mk(w, h), g = c.getContext('2d');
    g.drawImage(layers.sky, 0, 0, 1, h, 0, 0, w, h);
    g.drawImage(layers.far, -20, 0);
    g.drawImage(layers.mid, -30, 0);
    for (let x = 0; x < w; x += layers.ground.width) g.drawImage(layers.ground, x, GY);
    if (withBases) {
      const tw = SPR.get('tower_' + (t % 8) + '_0');
      g.drawImage(tw, w - tw.width + 6, GY - tw.height + 3);
    }
    artCache[key] = c.toDataURL();
    BW = save.BW; BH = save.BH; GY = save.GY; theme = save.theme; themeIdx = save.themeIdx; layers = save.layers; mode = save.mode; battle = save.battle;
    return artCache[key];
  }
  function hexA(h, a) { const n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function blob(g, cx, cy, rx, ry) { for (let y = -ry; y <= ry; y++) { const w = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))); g.fillRect(Math.round(cx - w), Math.round(cy + y), Math.round(w * 2), 1); } }
  function ridge(g, w, base, amp, col, r, kind) {
    const dark = mix(col, '#1a1030', 0.18), light = mix(col, '#ffffff', 0.18);
    let ph = r() * 10;
    for (let x = 0; x < w; x++) {
      let h;
      if (kind === 'peaks') h = Math.abs(((x * 0.035 + ph) % 2) - 1) * amp * 1.3 + Math.sin(x * 0.11) * 2;
      else if (kind === 'dunes') h = (Math.sin(x * 0.02 + ph) * 0.5 + 0.5) * amp + Math.sin(x * 0.07) * 2;
      else if (kind === 'skyline') h = ((Math.floor(x / 9) * 7919 + ph * 100) % 13) / 13 * amp * 1.4 + 4;
      else if (kind === 'volcano') { const d = Math.abs((x % 240) - 120); h = Math.max(0, amp * 1.8 - d * 0.6) + Math.sin(x * 0.05) * 3; }
      else h = (Math.sin(x * 0.025 + ph) * 0.5 + 0.5) * amp + Math.sin(x * 0.09 + ph) * 2;
      const top = Math.round(base - h);
      g.fillStyle = col; g.fillRect(x, top, 1, GY + 40 - top);
      if (kind === 'peaks' && h > amp * 0.8) { g.fillStyle = '#ffffff'; g.fillRect(x, top, 1, 3); }
      else { g.fillStyle = light; g.fillRect(x, top, 1, 1); }
      if (kind === 'skyline' && (x % 9) > 1 && (x % 9) < 8) for (let y = top + 3; y < GY; y += 4) if (((x * 31 + y * 17) % 7) === 0) { g.fillStyle = '#ffe9a0'; g.fillRect(x, y, 1, 1); g.fillStyle = col; }
      if (kind === 'volcano' && Math.abs((x % 240) - 120) < 6) { g.fillStyle = '#ef7d57'; g.fillRect(x, top, 1, 4); }
      g.fillStyle = dark; g.fillRect(x, top + Math.round(amp * 0.6) + 2, 1, 1);
    }
  }
  function prop(g, kind, x, y, th, r) {
    const px = (c, xx, yy, w, h) => { g.fillStyle = c; g.fillRect(Math.round(xx), Math.round(yy), w, h); };
    if (kind === 'tree') { px('#6a4a3a', x, y - 10, 2, 10); g.fillStyle = mix(th.mid, '#000000', 0.1); blob(g, x + 1, y - 14, 6, 5); g.fillStyle = mix(th.mid, '#ffffff', 0.15); blob(g, x - 0.5, y - 16, 3, 2); }
    else if (kind === 'cactus') { const c = '#4a8a4a'; px(c, x, y - 12, 3, 12); px(c, x - 3, y - 8, 3, 2); px(c, x - 3, y - 11, 2, 3); px(c, x + 3, y - 6, 3, 2); px(c, x + 4, y - 9, 2, 3); px('#6ab06a', x, y - 12, 1, 12); }
    else if (kind === 'pine') { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#3a6a5a' : '#2a5a4a'; blob(g, x, y - 4 - i * 4, 7 - i * 1.5, 2); } px('#f4f8ff', x - 1, y - 18, 2, 1); px('#5a3a2a', x, y - 2, 1, 3); }
    else if (kind === 'shroom') { px('#c8b8a0', x, y - 5, 2, 5); g.fillStyle = r() > 0.5 ? '#a04a6a' : '#6a4aa0'; blob(g, x + 1, y - 6, 4, 2); px('#ffffff', x - 1, y - 7, 1, 1); }
    else if (kind === 'rock') { g.fillStyle = '#2a1414'; blob(g, x, y - 3, 6, 4); px('#ef7d57', x - 2, y - 3, 3, 1); px('#ffcd75', x - 1, y - 3, 1, 1); }
    else if (kind === 'lamp') { px('#2a2a3a', x, y - 16, 1, 16); px('#2a2a3a', x, y - 16, 4, 1); px('#ffe9a0', x + 3, y - 15, 2, 2); }
    else if (kind === 'island') { g.fillStyle = '#c8e0f0'; blob(g, x, y - 20, 9, 3); g.fillStyle = '#7ac070'; blob(g, x, y - 23, 9, 1.5); px('#9a7a5a', x - 2, y - 18, 4, 3); }
    else if (kind === 'crystal') { g.fillStyle = r() > 0.5 ? '#a884f3' : '#73eff7'; for (let i = 0; i < 6; i++) g.fillRect(Math.round(x + i * 0.3), Math.round(y - i * 2), 3 - Math.floor(i / 2), 2); }
  }

  // ---------------------------------------------------------------------------
  // Modes
  // ---------------------------------------------------------------------------
  function setBattle(bt) {
    mode = 'battle'; battle = bt;
    themeIdx = bt.def.theme % THEMES.length; theme = THEMES[themeIdx];
    parts.length = 0; floats.length = 0; rings.length = 0;
    cam.x = cam.target = minCam(); cam.manual = 0;
    buildLayers();
  }
  function setHome(state, t) {
    mode = 'home'; battle = null; homeState = state;
    themeIdx = t || 0; theme = THEMES[themeIdx];
    parts.length = 0; floats.length = 0; rings.length = 0;
    strollers.length = 0;
    resize();
    const ids = state.lineup.filter(Boolean);
    ids.forEach(function (id, i) { strollers.push({ id: id, x: 60 + i * 26 + Math.random() * 10, dir: Math.random() < 0.5 ? 1 : -1, t: Math.random() * 3, walk: 0, pause: Math.random() * 2, y: Math.floor(Math.random() * 6) }); });
    cam.x = cam.target = homeCam();
    buildLayers();
  }
  // Our base sits left of x = 0 (its door at the lane start); the Gloom tower at the far end.
  function padL() { return 4 - baseX(SPR.get('burrow_0').width); }
  const PADR = 62;
  function homeCam() { return -padL(); }
  function minCam() { return -padL(); }
  function maxCam() { return battle ? Math.max(minCam(), battle.L + PADR - BW) : 0; }
  function baseX(w) { return -w + 30; }

  // Camera controls from game.js.
  function drag(dxScreen) { cam.manual = 3; cam.target = clampCam(cam.target - dxScreen / PXS); cam.x = cam.target; }
  function jumpTo(fraction) { if (!battle) return; cam.manual = 3; cam.target = clampCam((battle.L + padL() + PADR) * fraction - padL() - BW / 2); }
  function clampCam(x) { return Math.max(minCam(), Math.min(maxCam(), x)); }
  function setAuto() { cam.manual = 0; }
  // Free camera: the view stays where the player put it.
  let follow = true;
  function setFollow(on) { follow = !!on; if (follow) cam.manual = 0; }
  function lookAt(x) { cam.manual = 1e9; cam.x = cam.target = clampCam(x - BW / 2); }
  let minimapOn = true;
  function setMinimap(on) { minimapOn = on; }

  // ---------------------------------------------------------------------------
  // Effects fed by battle events
  // ---------------------------------------------------------------------------
  function particle(o) { if (parts.length < 400) parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 0.6, t: 0, c: '#ffffff', s: 1 }, o)); }
  function float(o) { if (floats.length < 40) floats.push(Object.assign({ t: 0, life: 0.9, c: '#ffffff' }, o)); }
  function entY(id) { if (!battle) return GY; for (const e of battle.ents) if (e.id === id) return feet(e) - e.st.size * 0.6; return GY - 10; }
  function feet(e) { return GY + 3 + e.y; }

  function event(ev) {
    switch (ev.t) {
      case 'hit': {
        const y = entY(ev.id);
        const n = ev.big ? 8 : 4;
        for (let i = 0; i < n; i++) particle({ x: ev.x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, g: 120, life: 0.3, c: ev.side === 0 ? (i % 2 ? '#ffffff' : '#ffcd75') : (i % 2 ? '#ffffff' : '#ff8fb1') });
        if (ev.crit) { float({ x: ev.x, y: y - 8, text: 'CRIT!', c: '#ffcd4d', big: true }); cam.shake = Math.max(cam.shake, 2); }
        break;
      }
      case 'miss': float({ x: ev.x, y: GY - 26, text: 'miss', c: '#c9b3ff' }); break;
      case 'kb': for (let i = 0; i < 5; i++) particle({ x: ev.x, y: GY - 2, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 18, life: 0.45, c: theme.dirt, s: 2 }); break;
      case 'die': {
        if (ev.side === 1) {
          for (let i = 0; i < 10; i++) particle({ x: ev.x + (Math.random() - 0.5) * 10, y: GY - 10 + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 30, life: 0.7, c: i % 2 ? '#5a4a7a' : '#2a1a3a', s: 2 });
          if (ev.drop) float({ x: ev.x, y: GY - 24, text: '+' + ev.drop, c: '#ffcd75', icon: 'acorn' });
          if (ev.boss) { cam.shake = 8; flash('#ffffff', 0.4); }
        } else {
          particle({ x: ev.x, y: GY - 14, vx: 0, vy: -26, life: 1.1, c: '#ffffff', s: 3, soul: true });
        }
        break;
      }
      case 'towerHit': if (ev.side === 1) cam.shake = Math.max(cam.shake, 1.5); break;
      case 'roar': {
        // Battle Cry: a golden shout from the base, and a burst of light on every hero it reaches.
        rings.push({ x: -16, r: 0, t: 0, life: 0.8, roar: true });
        cam.shake = 4; flash('#ffe066', 0.22);
        if (battle) for (const e of battle.ents) if (e.side === 0 && e.buff > 0) {
          const y = feet(e) - e.st.size * 0.5;
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; particle({ x: e.x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, vx: Math.cos(a) * 34, vy: Math.sin(a) * 26 - 8, life: 0.45, c: i % 2 ? '#fff6c8' : '#ffcd4d', s: 2 }); }
        }
        break;
      }
      case 'wave': rings.push({ x: ev.x, r: 0, t: 0, life: 0.5, side: ev.side }); break;
      case 'boss': cam.shake = 10; flash('#ff5a5a', 0.35); if (cam.manual <= 0 && battle) cam.target = clampCam(battle.L - BW + 40); break;
      case 'deploy': for (let i = 0; i < 6; i++) particle({ x: 10, y: GY - 2, vx: Math.random() * 40, vy: -Math.random() * 20, life: 0.4, c: '#ffffff', s: 2 }); break;
      case 'status': float({ x: entX(ev.id), y: entY(ev.id) - 6, text: ev.k === 'freeze' ? 'FREEZE' : ev.k === 'slow' ? 'SLOW' : 'WEAK', c: ev.k === 'freeze' ? '#73eff7' : ev.k === 'slow' ? '#c9b3ff' : '#a7f070' }); break;
      case 'survive': float({ x: ev.x, y: GY - 30, text: 'SURVIVED!', c: '#ffcd4d', big: true }); break;
      case 'down': float({ x: ev.x, y: GY - 22, text: '...', c: '#ef7d57' }); break;
      case 'revive': float({ x: ev.x, y: GY - 26, text: 'REVIVED', c: '#ef7d57' }); for (let i = 0; i < 8; i++) particle({ x: ev.x, y: GY - 6, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 40, life: 0.6, c: '#ef7d57' }); break;
      case 'burrow': case 'surface': for (let i = 0; i < 8; i++) particle({ x: ev.x, y: GY - 2, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40, g: 140, life: 0.5, c: theme.dirt, s: 2 }); break;
      case 'win': flash('#ffffff', 0.5); cam.shake = 6; break;
      default: break;
    }
  }
  function entX(id) { if (!battle) return 0; for (const e of battle.ents) if (e.id === id) return e.x; return 0; }
  function flash(c, t) { flashCol = c; flashT = Math.max(flashT, t); }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function silhouette(name) {
    if (silCache[name]) return silCache[name];
    const src = SPR.get(name);
    const c = mk(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    silCache[name] = c;
    return c;
  }

  const glowCache = {};
  function glow(name) {
    if (glowCache[name]) return glowCache[name];
    const src = SPR.get(name), w = src.width + 4, h = src.height + 4;
    const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const solid = function (x, y) { x -= 2; y -= 2; return x >= 0 && y >= 0 && x < src.width && y < src.height && sd[(y * src.width + x) * 4 + 3] > 0; };
    const c = mk(w, h), g = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      const d1 = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      const d2 = !d1 && (solid(x - 2, y) || solid(x + 2, y) || solid(x, y - 2) || solid(x, y + 2) || solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1));
      if (d1) { g.fillStyle = '#ffe066'; g.fillRect(x, y, 1, 1); }
      else if (d2) { g.fillStyle = 'rgba(255,159,28,0.6)'; g.fillRect(x, y, 1, 1); }
    }
    glowCache[name] = c;
    return c;
  }

  function frameFor(e) {
    const st = e.state;
    if (st === 'atk') return e.at < e.st.fore * 0.7 ? 2 : (e.at < e.st.fore + 0.2 ? 3 : 0);
    if (st === 'kb') return 2;
    if (st === 'walk') return Math.floor(e.walkT * 2.2) % 2;
    return 0;
  }

  function drawEnt(e) {
    const sx = Math.round(e.x - cam.x);
    const fy = feet(e);
    if (sx < -60 || sx > BW + 60) return;
    if (e.state === 'burrow') {
      b.fillStyle = theme.dirt;
      for (let i = 0; i < 4; i++) b.fillRect(sx - 6 + i * 3, fy - 2 - (i % 2), 3, 2 + (i % 2));
      return;
    }
    const f = frameFor(e);
    const name = e.side === 0 ? 'hero_' + e.st.id + '_' + e.st.form + '_' + f : 'enemy_' + e.st.id + '_' + f;
    const img = SPR.get(name);
    let dy = 0, alpha = 1;
    if (e.state === 'kb') dy = -Math.sin(Math.min(1, e.kbT / 0.35) * Math.PI) * 6;
    if (e.state === 'dead') { alpha = Math.max(0, 1 - e.t / 0.6); dy = e.side === 0 ? -e.t * 10 : 0; }
    if (e.state === 'walk' && f === 1) dy -= 1;
    const flying = e.st.traits && e.st.traits.indexOf('winged') >= 0;
    if (flying && e.state !== 'dead') dy -= 6 + Math.round(Math.sin(time * 4 + e.id) * 1.5);
    // Sprite's feet sit at its bottom, centred on x (heroes face right, so the face is ahead of x).
    const ox = e.side === 0 ? Math.round(img.width * 0.62) : Math.round(img.width * 0.38);
    const x0 = sx - ox, y0 = Math.round(fy - img.height + dy);
    // Shadow.
    b.fillStyle = 'rgba(0,0,0,0.22)';
    const sw = Math.max(6, Math.round(img.width * 0.45));
    b.fillRect(sx - (e.side === 0 ? Math.round(sw * 0.65) : Math.round(sw * 0.35)), fy, sw, 1);
    if (e.state === 'down') {
      b.globalAlpha = 0.6;
      b.drawImage(img, 0, 0, img.width, img.height, x0, fy - Math.round(img.height * 0.4), img.width, Math.round(img.height * 0.4));
      b.globalAlpha = 1;
      return;
    }
    // Battle Cry glow: a 2-pixel aura hugging the sprite, pulsing, blinking as it runs out.
    if (e.buff > 0 && e.state !== 'dead' && (e.buff > 1.5 || Math.floor(time * 8) % 2 === 0)) {
      b.globalAlpha = 0.7 + 0.3 * Math.sin(time * 9 + e.id);
      b.drawImage(glow(name), x0 - 2, y0 - 2);
      if (Math.random() < 0.08) particle({ x: e.x + (Math.random() - 0.5) * img.width * 0.6, y: fy - Math.random() * img.height * 0.8, vx: 0, vy: -16, life: 0.6, c: Math.random() < 0.5 ? '#ffe066' : '#fff6c8', s: 1 });
    }
    b.globalAlpha = alpha;
    b.drawImage(img, x0, y0);
    if (e.flash > 0) { b.globalAlpha = Math.min(1, e.flash * 8) * 0.8 * alpha; b.drawImage(silhouette(name), x0, y0); }
    b.globalAlpha = 1;
    // Status effects.
    if (e.freeze > 0) { b.fillStyle = 'rgba(115,239,247,0.45)'; b.fillRect(x0 + 2, y0 + 2, img.width - 4, img.height - 3); b.fillStyle = '#ffffff'; b.fillRect(x0 + 3, y0 + 3, 1, 1); b.fillRect(x0 + img.width - 5, y0 + 5, 1, 1); }
    if (e.slow > 0) { b.fillStyle = '#c9b3ff'; b.fillRect(sx - 1 + Math.round(Math.sin(time * 5) * 2), y0 - 3, 2, 1); }
    if (e.weaken > 0) { b.fillStyle = '#a7f070'; b.fillRect(sx, y0 - 4, 1, 3); b.fillRect(sx - 1, y0 - 2, 3, 1); }
    if (e.poison > 0 && Math.floor(time * 6) % 2) { b.fillStyle = '#a7f070'; b.fillRect(sx + 2, y0 + 2, 1, 1); b.fillRect(sx - 3, y0 + 4, 1, 1); }
    // Small health bar once hurt (enemies) or for bosses.
    if (e.side === 1 && e.hp < e.max && e.state !== 'dead') {
      const w = Math.max(10, Math.round(img.width * 0.5)), hx = sx - Math.round(w / 2), hy = y0 - 3;
      b.fillStyle = '#0b0b16'; b.fillRect(hx - 1, hy - 1, w + 2, 3);
      b.fillStyle = e.boss ? '#ff6fd0' : '#ef7d57'; b.fillRect(hx, hy, Math.max(1, Math.round(w * e.hp / e.max)), 1);
    }
  }

  function drawBases() {
    const bt = battle;
    const ad = Math.min(3, Math.floor((1 - bt.ally.hp / bt.ally.max) * 4));
    const bur = SPR.get('burrow_' + ad);
    const shakeA = bt.ally.hitT > 0 ? Math.round(Math.sin(time * 60) * 1) : 0;
    b.drawImage(bur, Math.round(baseX(bur.width) - cam.x) + shakeA, GY - bur.height + 3);
    // Smoke and embers once the base is hurt.
    if (ad > 0 && Math.random() < ad * 0.12) particle({ x: baseX(bur.width) + bur.width * (0.25 + Math.random() * 0.5), y: GY - bur.height * (0.3 + Math.random() * 0.5), vx: -4 + Math.random() * 8, vy: -14 - Math.random() * 10, life: 1.4, c: Math.random() < 0.25 ? '#ef7d57' : '#4a4058', s: 2, amb: true });
    const td = Math.min(3, Math.floor((1 - bt.enemy.hp / bt.enemy.max) * 4));
    const tw = SPR.get('tower_' + (bt.def.theme % 8) + '_' + td);
    const shakeE = bt.enemy.hitT > 0 ? Math.round(Math.sin(time * 60) * 1) : 0;
    b.drawImage(tw, Math.round(bt.L - 8 - cam.x) + shakeE, GY - tw.height + 3);
  }

  function drawWaves() {
    for (const w of battle.waves) {
      const sx = Math.round(w.x - cam.x);
      const col = w.side === 0 ? '#73eff7' : '#ff6bd0';
      for (let i = 0; i < 10; i++) { const h = 2 + Math.round(Math.abs(Math.sin(time * 20 + i)) * 5); b.fillStyle = i % 2 ? col : '#ffffff'; b.fillRect(sx - w.dir * i * 2, GY - h, 2, h); }
    }
  }

  function drawMinimap() {
    if (!battle) return;
    const L = battle.L, w = Math.min(BW - 120, 180), x0 = Math.round((BW - w) / 2), y0 = 3;
    b.fillStyle = 'rgba(11,11,22,0.7)'; b.fillRect(x0 - 1, y0 - 1, w + 2, 5);
    const pl = padL(), span = L + pl + PADR;
    const vx = Math.round(x0 + (cam.x + pl) / span * w), vw = Math.round(BW / span * w);
    b.fillStyle = 'rgba(244,244,244,0.25)'; b.fillRect(vx, y0 - 1, vw, 5);
    for (const e of battle.ents) {
      if (e.state === 'dead') continue;
      b.fillStyle = e.side === 0 ? '#73eff7' : (e.boss ? '#ff6fd0' : '#ef7d57');
      b.fillRect(Math.round(x0 + (e.x + pl) / span * w), y0 + (e.side === 0 ? 0 : 2), 1, e.boss ? 3 : 1);
    }
    b.fillStyle = '#3b5dc9'; b.fillRect(x0, y0, 2, 3);
    b.fillStyle = '#b13e53'; b.fillRect(x0 + w - 2, y0, 2, 3);
  }
  function minimapRect() {
    if (!battle) return null;
    const w = Math.min(BW - 120, 180), x0 = Math.round((BW - w) / 2);
    return { x: x0 * PXS, y: 0, w: w * PXS, h: 10 * PXS };
  }

  function updateCamera(dt) {
    if (mode !== 'battle' || !battle) { cam.x = homeCam(); return; }
    if (cam.manual > 0 || !follow) { if (cam.manual > 0) cam.manual -= dt; }
    else {
      // Frame the army: the bulk of our heroes (not one runner far ahead) and the nearest Gloom.
      const xs = [];
      let foe = battle.L;
      for (const e of battle.ents) { if (e.state === 'dead') continue; if (e.side === 0) xs.push(e.x); else foe = Math.min(foe, e.x); }
      xs.sort(function (a, b2) { return a - b2; });
      const front = xs.length ? xs[Math.max(0, Math.floor(xs.length * 0.8) - (xs.length > 2 ? 1 : 0))] : 0;
      const lead = xs.length ? xs[xs.length - 1] : 0;
      let focus = Math.max(front, Math.min(lead, front + BW * 0.25));
      if (foe < focus + BW * 0.25) focus = Math.min(focus, foe);
      cam.target = clampCam(focus - BW * 0.62);
    }
    cam.x += (cam.target - cam.x) * Math.min(1, dt * 3);
  }

  function fxAmbient(dt) {
    const k = theme.fx;
    const rate = k === 'snow' ? 30 : k === 'rain' ? 60 : k === 'ember' ? 14 : k === 'petal' ? 5 : k === 'star' ? 4 : k === 'dust' ? 6 : k === 'feather' ? 3 : 0;
    const n = rate * dt;
    for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++) {
      const x = cam.x + Math.random() * BW;
      if (k === 'snow') particle({ x: x, y: -2, vx: -6 + Math.random() * 4, vy: 14 + Math.random() * 8, life: 6, c: '#ffffff', amb: true });
      else if (k === 'rain') particle({ x: x, y: -2, vx: -20, vy: 160, life: 1.2, c: '#8a9ad0', amb: true, len: 3 });
      else if (k === 'ember') particle({ x: x, y: GY, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 20, life: 3, c: Math.random() < 0.5 ? '#ffcd75' : '#ef7d57', amb: true });
      else if (k === 'petal') particle({ x: x, y: -2, vx: 10 + Math.random() * 6, vy: 10 + Math.random() * 6, life: 8, c: Math.random() < 0.5 ? '#ffa8c5' : '#ffffff', amb: true });
      else if (k === 'dust') particle({ x: cam.x - 2, y: GY - Math.random() * 40, vx: 40 + Math.random() * 30, vy: 0, life: 8, c: '#fff0c8', amb: true });
      else if (k === 'feather') particle({ x: x, y: -2, vx: 6, vy: 8, life: 9, c: '#ffffff', amb: true });
      else if (k === 'star') particle({ x: x, y: Math.random() * GY * 0.7, vx: 0, vy: 0, life: 1.2, c: '#ffffff', amb: true, twinkle: true });
    }
  }

  function frame(dt) {
    if (!ctx || !layers) return;
    time += dt;
    updateCamera(dt);
    fxAmbient(dt);
    cam.shake = Math.max(0, cam.shake - dt * 18);
    flashT = Math.max(0, flashT - dt);
    const shx = cam.shake > 0 ? Math.round((Math.random() - 0.5) * cam.shake) : 0;
    const shy = cam.shake > 0 ? Math.round((Math.random() - 0.5) * cam.shake * 0.6) : 0;
    const cx = Math.round(cam.x) + shx;
    // Sky, parallax, ground.
    b.drawImage(layers.sky, 0, 0, 1, BH, 0, 0, BW, BH);
    b.drawImage(layers.far, -Math.round((cx + 70) * 0.25), shy);
    if (layers.mid) b.drawImage(layers.mid, -Math.round((cx + 70) * 0.55), shy);
    const gw = layers.ground.width;
    for (let x = -((cx % gw) + gw) % gw; x < BW; x += gw) b.drawImage(layers.ground, x, GY + shy);
    const savedCam = cam.x;
    cam.x = cx;
    if (mode === 'battle' && battle) {
      drawBases();
      // Back to front by depth so lower units overlap higher ones.
      const list = battle.ents.slice().sort(function (p, q) { return p.y - q.y || p.side - q.side; });
      for (const e of list) drawEnt(e);
      drawWaves();
    } else drawHome(dt);
    // Rings (wave launches, roar).
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt;
      if (r.t > r.life) { rings.splice(i, 1); continue; }
      const k = r.t / r.life, rad = (r.roar ? BW * 0.9 : 26) * (r.roar ? 1 - (1 - k) * (1 - k) : k), x = Math.round(r.x - cam.x);
      b.fillStyle = r.roar ? hexA('#ffe066', 1 - k) : hexA(r.side === 0 ? '#73eff7' : '#ff6bd0', 1 - k);
      for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.08) b.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(GY - 14 + Math.sin(a) * rad * 0.7), 2, 2);
    }
    // Particles.
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = p.amb ? (p.twinkle ? Math.sin(p.t / p.life * Math.PI) : 1) : 1 - p.t / p.life;
      if (p.y > GY + 2 && !p.amb) continue;
      b.globalAlpha = Math.max(0, a);
      b.fillStyle = p.c;
      const x = Math.round(p.x - cam.x), y = Math.round(p.y + shy);
      if (p.soul) { b.fillRect(x - 1, y - 2, 3, 3); b.fillRect(x, y + 1, 1, 2); b.fillStyle = '#c9b3ff'; b.fillRect(x - 2, y - 1, 1, 1); b.fillRect(x + 2, y - 1, 1, 1); }
      else if (p.len) b.fillRect(x, y, 1, p.len);
      else b.fillRect(x, y, p.s, p.s);
    }
    b.globalAlpha = 1;
    if (mode === 'battle' && minimapOn) drawMinimap();
    if (flashT > 0) { b.fillStyle = hexA(flashCol, Math.min(0.6, flashT * 1.6)); b.fillRect(0, 0, BW, BH); }
    cam.x = savedCam;
    // Scale up to the display canvas, then crisp text on top.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, BW * KK, BH * KK);
    drawFloats(dt, cx);
  }

  function drawFloats(dt, cx) {
    ctx.textAlign = 'center';
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt;
      if (f.t > f.life) { floats.splice(i, 1); continue; }
      const k = f.t / f.life;
      const x = (f.x - cx) * KK, y = (f.y - k * 14) * KK;
      const size = Math.round((f.big ? 9 : 7) * KK * 0.9);
      ctx.font = '700 ' + size + 'px Cozy, monospace';
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.fillStyle = '#0b0b16';
      ctx.fillText(f.text, x + KK, y + KK);
      ctx.fillStyle = f.c;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // Home: the burrow and your lineup strolling about.
  function drawHome(dt) {
    const bur = SPR.get('burrow_0');
    b.drawImage(bur, Math.round(baseX(bur.width) - cam.x), GY - bur.height + 3);
    const right = BW + cam.x - 20;
    strollers.sort(function (p, q) { return p.y - q.y; });
    for (const s of strollers) {
      s.t += dt;
      if (s.pause > 0) { s.pause -= dt; }
      else {
        s.x += s.dir * 12 * dt; s.walk += dt;
        if (s.x < 24) { s.dir = 1; s.pause = 1 + Math.random() * 2; }
        if (s.x > right) { s.dir = -1; s.pause = 1 + Math.random() * 2; }
        if (Math.random() < dt * 0.2) { s.pause = 0.8 + Math.random() * 2.5; if (Math.random() < 0.4) s.dir *= -1; }
      }
      const h = homeState.heroes[s.id];
      const f = s.pause > 0 ? (Math.floor(s.t * 0.7) % 7 === 0 ? 3 : 0) : Math.floor(s.walk * 2.4) % 2;
      const img = SPR.get('hero_' + s.id + '_' + (h ? h.form : 0) + '_' + f);
      const fy = GY + 3 + s.y;
      const x = Math.round(s.x - cam.x - img.width / 2);
      b.fillStyle = 'rgba(0,0,0,0.2)'; b.fillRect(x + Math.round(img.width * 0.25), fy, Math.round(img.width * 0.5), 1);
      if (s.dir < 0) { b.save(); b.translate(x + img.width, 0); b.scale(-1, 1); b.drawImage(img, 0, Math.round(fy - img.height - (f === 1 ? 1 : 0))); b.restore(); }
      else b.drawImage(img, x, Math.round(fy - img.height - (f === 1 ? 1 : 0)));
    }
  }

  function screenToWorld(px) { return px / PXS + cam.x; }

  root.AWRender = { init, resize, frame, event, setBattle, setHome, drag, jumpTo, setAuto, setFollow, lookAt, setMinimap, themeArt, minimapRect, screenToWorld, THEMES, get scale() { return PXS; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
