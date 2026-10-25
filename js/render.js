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
  let mode = 'home', battle = null, homeState = null, theme = THEMES[0], themeIdx = 0, tint = 0;
  // Chapter colour grades: 1 = dusk (chapter 2), 2 = deep gloom (chapter 3). Applied to the painting and the lane.
  const GRADES = [null, { mul: [1.04, 0.8, 0.86], add: [22, 4, 26], sat: 0.95 }, { mul: [0.6, 0.55, 0.82], add: [16, 6, 34], sat: 0.55 }];
  function gradeRgb(r, g, b2, k) {
    const G = GRADES[k];
    if (!G) return [r, g, b2];
    const l = r * 0.3 + g * 0.59 + b2 * 0.11;
    r = l + (r - l) * G.sat; g = l + (g - l) * G.sat; b2 = l + (b2 - l) * G.sat;
    return [Math.min(255, r * G.mul[0] + G.add[0]), Math.min(255, g * G.mul[1] + G.add[1]), Math.min(255, b2 * G.mul[2] + G.add[2])];
  }
  function gradeHex(h, k) { if (!k) return h; const n = parseInt(h.slice(1), 16); return '#' + gradeRgb(n >> 16, (n >> 8) & 255, n & 255, k).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
  const gradeCache = {};
  function bgArt(name, k) {
    const art = SPR.asset && SPR.asset('bg_' + name);
    if (!art || !k) return art;
    const key = name + k;
    if (gradeCache[key]) return gradeCache[key];
    const c = mk(art.width, art.height), g = c.getContext('2d');
    g.drawImage(art, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const o = gradeRgb(p[i], p[i + 1], p[i + 2], k); p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
    g.putImageData(d, 0, 0);
    gradeCache[key] = c;
    return c;
  }
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
    const art = bgArt(th.name, tint);
    if (art) {
      const pl = paintedLayers(art, th, span, r);
      const meta = root.AW_ASSETS && root.AW_ASSETS['bg_' + th.name];
      const gm = meta && meta.ground ? { ground: { top: gradeHex(meta.ground.top, tint), band: gradeHex(meta.ground.band, tint) } } : null;
      layers = { sky: pl.sky, far: pl.far, mid: pl.mid, ground: groundStrip(th, r, gm) };
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
  function themeArt(t, w, h, withBases, anchor, tn) {
    const key = t + ':' + w + 'x' + h + ':' + (withBases ? 1 : 0) + ':' + (anchor || 0) + ':' + (tn || 0);
    if (artCache[key]) return artCache[key];
    const art = bgArt(THEMES[t % THEMES.length].name, tn || 0);
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
    themeIdx = bt.def.theme % THEMES.length; theme = THEMES[themeIdx]; tint = bt.def.tint || 0;
    parts.length = 0; floats.length = 0; rings.length = 0; FXS.length = 0; PROJS.length = 0;
    cam.x = cam.target = minCam(); cam.manual = 0;
    buildLayers();
  }
  function setHome(state, t) {
    mode = 'home'; battle = null; homeState = state;
    themeIdx = t || 0; theme = THEMES[themeIdx]; tint = 0;
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
      case 'swing': attackFx(ev); break;
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

  // ---------------------------------------------------------------------------
  // Attack styles (js/fx.js): every unit's own body motion while it attacks, its projectile and its hit effect.
  // ---------------------------------------------------------------------------
  const FXS = [], PROJS = [];
  let STYLES = null;
  function styleOf(e) {
    if (!STYLES && root.AW_FX && root.AW_CONTENT) STYLES = root.AW_FX.build(root.AW_CONTENT);
    return STYLES ? STYLES[e.side === 0 ? 'hero' : 'enemy'][e.st.id] : null;
  }
  // Sprite offset, squash and flip for the attack motion. p: wind-up progress, q: strike progress (both 0..1).
  function motionPose(e, sty) {
    const o = { dx: 0, dy: 0, sx: 1, sy: 1, flip: false, ghost: 0 };
    if (!sty || e.state !== 'atk') return o;
    const fore = Math.max(0.05, e.st.fore), p = Math.min(1, e.at / fore), q = e.at < fore ? -1 : Math.min(1, (e.at - fore) / 0.25);
    const S = Math.sin, PI = Math.PI;
    switch (sty.motion) {
      case 'lunge': if (q < 0) o.dx = -2 * p; else o.dx = 7 * S(q * PI); break;
      case 'hop': if (q < 0) o.dy = -9 * S(p * PI / 2); else o.dy = -9 * (1 - q) * (1 - q); break;
      case 'spin': if (q >= 0) o.flip = Math.floor(q * 6) % 2 === 1; else o.dx = -1 * p; break;
      case 'rear': if (q < 0) { o.dy = -4 * p; o.dx = -2 * p; } else { o.dx = 5 * (1 - q); o.dy = -4 * (1 - q) * 0.5; } break;
      case 'stomp': if (q < 0) { o.sy = 1 - 0.18 * p; o.sx = 1 + 0.12 * p; } else { o.sy = 1 + 0.14 * (1 - q); o.sx = 1 - 0.06 * (1 - q); } break;
      case 'dash': if (q >= 0) { o.dx = 13 * (1 - q); o.ghost = 1 - q; } else o.dx = -3 * p; break;
      case 'recoil': if (q >= 0) o.dx = -5 * (1 - q); else o.sy = 1 - 0.06 * p; break;
      case 'charge': if (q < 0) o.dx = (Math.random() < 0.5 ? -1 : 1) * Math.round(p * 1.5); else o.dx = 4 * (1 - q); break;
      case 'float': if (q < 0) o.dy = -7 * p; else o.dy = -7 * (1 - q); break;
      case 'bounce': if (q < 0) o.dy = -Math.abs(S(p * PI * 2)) * 4; else o.dx = 3 * S(q * PI); break;
      case 'crouch': if (q < 0) { o.sy = 0.8 + 0.2 * (1 - p); o.sx = 1 + 0.1 * p; } else { o.sy = 1 + 0.18 * (1 - q); o.dy = -3 * (1 - q); } break;
      case 'backstep': if (q < 0) o.dx = -6 * p; else o.dx = -6 * (1 - q) + 5 * S(q * PI); break;
      case 'pulse': if (q >= 0) { const k = 1 + 0.2 * S(q * PI); o.sx = k; o.sy = k; } else { const k = 1 - 0.06 * p; o.sx = k; o.sy = k; } break;
      case 'shove': if (q >= 0) { o.dx = 6 * (1 - q); o.sx = 1 + 0.1 * (1 - q); } else o.dx = -2 * p; break;
      case 'sway': if (q < 0) o.dx = -2.5 * S(p * PI * 2); else o.dx = 4 * S(q * PI); break;
      case 'flip': if (q >= 0) { o.dy = -8 * S(q * PI); o.flip = q > 0.3 && q < 0.7; } else o.sy = 1 - 0.1 * p; break;
      default: break;
    }
    return o;
  }

  function nearestFoe(e) {
    let best = null, bd = 1e9;
    const dir = e.side === 0 ? 1 : -1;
    for (const f of battle.ents) {
      if (f.side === e.side || f.state === 'dead' || f.state === 'burrow') continue;
      const d = (f.x - e.x) * dir;
      if (d > -10 && d < e.st.rng + 60 && d < bd) { bd = d; best = f; }
    }
    return best;
  }
  // A swing: the projectile (if any) flies to the target, then the hit effect plays there.
  function attackFx(ev) {
    if (!battle) return;
    let e = null; for (const x of battle.ents) if (x.id === ev.id) { e = x; break; }
    if (!e) return;
    const sty = styleOf(e); if (!sty) return;
    const dir = e.side === 0 ? 1 : -1, size = e.st.size || 20;
    const foe = nearestFoe(e);
    const tx = foe ? foe.x : e.x + dir * Math.min(e.st.rng, 60), ty = foe ? feet(foe) - (foe.st.size || 20) * 0.45 : feet(e) - size * 0.45;
    if (sty.motion === 'stomp' || sty.motion === 'hop' || sty.motion === 'flip') for (let i = 0; i < 6; i++) particle({ x: e.x + (Math.random() - 0.5) * size * 0.8, y: GY + 1, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 30, g: 120, life: 0.4, c: theme.dirt, s: 2 });
    if (sty.proj) {
      const sx = e.x + dir * size * 0.35, sy = feet(e) - size * 0.55;
      const dist = Math.abs(tx - sx);
      PROJS.push({ kind: sty.proj, x0: sx, y0: sy, x1: tx, y1: ty, t: 0, dur: Math.max(0.12, Math.min(0.45, dist / 240)), sty: sty, dir: dir, landed: ev.landed });
    } else spawnFx(sty, foe ? tx - dir * (foe.st.size || 20) * 0.15 : tx, ty, dir, ev.landed);
    sty.scale = Math.max(1.3, Math.min(2.2, size / 14));
  }
  function spawnFx(sty, x, y, dir, landed) {
    const c = sty.col || '#ffffff', c2 = sty.col2 || '#ffffff', R = Math.random;
    const big = (landed ? 1 : 0.65) * (sty.scale || 1);
    const fx = { kind: sty.fx, x: x, y: y, dir: dir, t: 0, life: 0.38, c: c, c2: c2, seed: sty.seed % 997, big: big };
    switch (sty.fx) {
      // Particle-led effects.
      case 'sparks': for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2, v = 60 + R() * 70; particle({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.22, c: i % 2 ? '#ffffff' : c, s: 1 }); } fx.life = 0.12; break;
      case 'petals': for (let i = 0; i < 8; i++) particle({ x: x + (R() - 0.5) * 10, y: y - 4, vx: dir * (10 + R() * 30), vy: -10 - R() * 20, g: 40, life: 0.8, c: i % 2 ? '#ffb3d9' : '#ff8fd0', s: 2 }); fx.life = 0.1; break;
      case 'leaves': for (let i = 0; i < 7; i++) particle({ x: x, y: y, vx: (R() - 0.3) * 70 * dir, vy: -20 - R() * 30, g: 70, life: 0.7, c: i % 2 ? '#5ac54f' : '#a7f070', s: 2 }); fx.life = 0.1; break;
      case 'embers': for (let i = 0; i < 9; i++) particle({ x: x + (R() - 0.5) * 12, y: y + 4, vx: (R() - 0.5) * 20, vy: -30 - R() * 40, life: 0.6, c: i % 3 ? '#ff9a3a' : '#ffe066', s: 1 }); fx.life = 0.2; break;
      case 'drops': for (let i = 0; i < 9; i++) particle({ x: x, y: y, vx: (R() - 0.5) * 80, vy: -40 - R() * 40, g: 260, life: 0.55, c: i % 2 ? '#73d8ff' : '#3b8ae0', s: 1 }); fx.life = 0.15; break;
      case 'sand': for (let i = 0; i < 10; i++) particle({ x: x + (R() - 0.5) * 8, y: y + 6, vx: (R() - 0.5) * 60, vy: -R() * 30, g: 60, life: 0.6, c: i % 2 ? '#d8c08a' : '#b89a62', s: 2 }); fx.life = 0.12; break;
      case 'feathers': for (let i = 0; i < 6; i++) particle({ x: x, y: y - 6, vx: (R() - 0.5) * 50, vy: -10 - R() * 25, g: 30, life: 1, c: i % 2 ? '#ffffff' : c, s: 2 }); fx.life = 0.1; break;
      case 'snow': fx.life = 0.7; break;
      case 'quake': cam.shake = Math.max(cam.shake, 2); for (let i = 0; i < 8; i++) particle({ x: x + (R() - 0.5) * 24, y: GY + 1, vx: (R() - 0.5) * 30, vy: -20 - R() * 40, g: 160, life: 0.5, c: theme.dirt, s: 2 }); fx.life = 0.45; break;
      case 'bolt': flash('#fff6c8', 0.06); fx.life = 0.24; break;
      case 'beam': fx.life = 0.32; break;
      case 'smoke': case 'ink': case 'vortex': case 'runes': fx.life = 0.5; break;
      case 'hearts': case 'notes': fx.life = 0.7; break;
      default: break;
    }
    if (FXS.length < 160) FXS.push(fx);
  }

  // Drawing helpers in world coordinates (x minus the camera, y plus the shake).
  let SHY = 0;
  function px(x, y, c, w, h) { b.fillStyle = c; b.fillRect(Math.round(x - cam.x), Math.round(y + SHY), w || 1, h || 1); }
  function line(x0, y0, x1, y1, c, w) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, w || 1, w || 1); }
  function circle(x, y, r, c, step) { for (let a = 0; a < Math.PI * 2; a += (step || 0.35) / Math.max(1, r / 6)) px(x + Math.cos(a) * r, y + Math.sin(a) * r, c); }
  const SHAPES = {
    heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'], note: ['..XX', '..X.', '..X.', 'XXX.', 'XX..'], skull: ['.XXX.', 'X.X.X', 'XXXXX', '.X.X.'],
    rune: ['XXX', 'X.X', 'XX.'], flake: ['.X.', 'XXX', '.X.'], star4: ['..X..', '..X..', 'XXXXX', '..X..', '..X..']
  };
  function shape(name, x, y, c) { const s = SHAPES[name]; for (let j = 0; j < s.length; j++) for (let i = 0; i < s[j].length; i++) if (s[j][i] === 'X') px(x - (s[j].length >> 1) + i, y - (s.length >> 1) + j, c); }

  function drawFx(dt) {
    // Projectiles.
    for (let i = PROJS.length - 1; i >= 0; i--) {
      const p = PROJS[i]; p.t += dt;
      const k = Math.min(1, p.t / p.dur), c = p.sty.col, d = p.dir;
      const arc = p.kind === 'rock' || p.kind === 'seed' || p.kind === 'spore' ? -18 * Math.sin(k * Math.PI) : p.kind === 'boomerang' ? -10 * Math.sin(k * Math.PI) : 0;
      const x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k + arc;
      const sp = Math.floor(p.t * 24) % 4;
      switch (p.kind) {
        case 'orb': circle(x, y, 2.5, c, 0.6); px(x - 1, y - 1, '#ffffff', 2, 2); break;
        case 'arrow': line(x - d * 7, y, x, y, '#c8a070'); px(x, y - 1, '#e8e8f0', 1, 3); px(x - d * 7, y - 1, c, 1, 3); break;
        case 'shuriken': if (sp % 2) { px(x - 3, y, '#d8e0f0', 7, 1); px(x, y - 3, '#d8e0f0', 1, 7); } else { line(x - 2, y - 2, x + 2, y + 2, '#d8e0f0'); line(x - 2, y + 2, x + 2, y - 2, '#d8e0f0'); } break;
        case 'bolt': line(x - d * 8, y - 2, x - d * 4, y + 1, '#fff6c8'); line(x - d * 4, y + 1, x, y - 1, '#ffe066'); break;
        case 'rock': px(x - 1, y - 1, '#8a7a62', 3, 3); px(x - 1, y - 1, '#b8a888', 1, 1); break;
        case 'bubble': circle(x, y, 3, '#9fd8ff', 0.5); px(x - 1, y - 2, '#ffffff'); break;
        case 'leaf': px(x - 1, y, '#5ac54f', 3, 1); px(x, y - (sp % 2), '#a7f070'); break;
        case 'fireball': px(x - 2, y - 2, '#ff9a3a', 4, 4); px(x - 1, y - 1, '#ffe066', 2, 2); for (let t = 1; t < 4; t++) px(x - d * (3 + t * 2), y + (t % 2), t % 2 ? '#e04a3a' : '#ff9a3a'); break;
        case 'icicle': line(x - d * 6, y, x, y, '#bfefff'); px(x, y, '#ffffff'); break;
        case 'beam': line(p.x0, p.y0, p.x0 + (p.x1 - p.x0) * Math.min(1, k * 1.6), p.y0 + (p.y1 - p.y0) * Math.min(1, k * 1.6), c, 2); break;
        case 'boomerang': if (sp % 2) { line(x - 3, y, x, y - 3, '#c8a070'); line(x, y - 3, x + 3, y, '#c8a070'); } else { line(x, y - 3, x + 3, y, '#c8a070'); line(x + 3, y, x, y + 3, '#c8a070'); } break;
        case 'feather': px(x - 3, y, '#ffffff', 5, 1); px(x - 2, y - 1, c, 3, 1); break;
        case 'note': shape('note', x, y, c); break;
        case 'comet': px(x - 1, y - 1, '#ffffff', 3, 3); for (let t = 1; t < 7; t++) px(x - d * t * 2, y, t < 3 ? c : '#fff6c8'); break;
        case 'spore': circle(x, y, 2, '#c8e8a0', 0.8); px(x, y, c); break;
        case 'dart': line(x - d * 5, y, x, y, '#566c86'); px(x, y, '#ffffff'); break;
        case 'ring': circle(x, y, 2 + 3 * k, c, 0.5); break;
        case 'skull': shape('skull', x, y, '#e8e0f0'); break;
        case 'crescent': for (let a = -1.2; a <= 1.2; a += 0.3) px(x + d * Math.cos(a) * 4, y + Math.sin(a) * 4, '#e0d8ff'); break;
        case 'seed': px(x, y, '#8a6a3a', 2, 2); break;
        default: px(x, y, c, 2, 2);
      }
      if (k >= 1) { PROJS.splice(i, 1); spawnFx(p.sty, p.x1, p.y1, p.dir, p.landed); }
    }
    // Hit effects.
    for (let i = FXS.length - 1; i >= 0; i--) {
      const f = FXS[i]; f.t += dt;
      if (f.t > f.life) { FXS.splice(i, 1); continue; }
      const k = f.t / f.life, x = f.x, y = f.y, d = f.dir, c = f.c, W = '#ffffff', s = f.big;
      b.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      switch (f.kind) {
        case 'slash': { const r = 9 * s; for (let a = -1.3; a <= -1.3 + 2.6 * Math.min(1, k * 2); a += 0.08) { px(x + d * Math.cos(a) * r, y + Math.sin(a) * r, W, 2, 2); px(x + d * Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2), c, 2, 2); } break; }
        case 'cross': { const r = 7 * s * Math.min(1, k * 2.5); line(x - r, y - r, x + r, y + r, W, 2); line(x - r, y + r, x + r, y - r, c, 2); break; }
        case 'claw': for (let j = -1; j <= 1; j++) { const r = 8 * s * Math.min(1, k * 2.5); line(x - d * 3 + j * 4, y - r, x + d * 3 + j * 4, y + r * 0.6, j ? c : W, 2); } break;
        case 'star': { const r = 2 + 7 * s * Math.sin(k * Math.PI); px(x - r, y - 1, W, r * 2 + 1, 2); px(x - 1, y - r, W, 2, r * 2 + 1); px(x - r / 2, y - r / 2, c, 1, 1); px(x + r / 2, y + r / 2, c, 1, 1); px(x + r / 2, y - r / 2, c, 1, 1); px(x - r / 2, y + r / 2, c, 1, 1); break; }
        case 'ring': circle(x, y, 2 + 12 * s * k, k < 0.5 ? W : c, 0.25); circle(x, y, 1 + 12 * s * k, c, 0.25); break;
        case 'spikes': for (let j = 0; j < 3; j++) { const hh = Math.round(10 * s * Math.sin(Math.min(1, k * 1.6) * Math.PI) * (j === 1 ? 1 : 0.65)); for (let t = 0; t < hh; t++) px(x - 5 + j * 5 - Math.round((hh - t) / 4) + Math.round((hh - t) / 4), GY + 2 - t, t > hh - 2 ? W : c, Math.max(1, Math.round((hh - t) / 3)), 1); } break;
        case 'snow': for (let j = 0; j < 5; j++) shape('flake', x + Math.sin(f.seed + j * 2.3) * 9, y - 8 + k * 16 + j * 2, j % 2 ? W : '#bfefff'); break;
        case 'flames': for (let j = 0; j < 5; j++) { const hh = 3 + ((f.seed + j * 7 + Math.floor(f.t * 20)) % 5); px(x - 6 + j * 3, y + 6 - hh, j % 2 ? '#ff9a3a' : '#e04a3a', 2, hh); px(x - 6 + j * 3, y + 6 - hh - 1, '#ffe066', 1, 1); } break;
        case 'bolt': { let bx = x, by = y - 40; for (let j = 0; j < 6; j++) { const nx = x + ((f.seed + j * 13) % 7 - 3), ny = y - 40 + (j + 1) * 7; line(bx, by, nx, ny, j % 2 ? '#fff6c8' : '#ffe066', 1); bx = nx; by = ny; } circle(x, y, 3 + 4 * k, '#fff6c8', 0.6); break; }
        case 'twinkle': for (let j = 0; j < 5; j++) { const a = j * 1.25 + f.seed; if ((Math.floor(f.t * 14) + j) % 3) shape('star4', x + Math.cos(a) * 9 * s, y + Math.sin(a) * 7 * s, j % 2 ? W : c); } break;
        case 'shards': for (let j = 0; j < 7; j++) { const a = j * 0.9 + f.seed, r = 4 + 14 * k; px(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, j % 2 ? '#d8d0c0' : c, 2, 1); } break;
        case 'ink': { const r = 3 + 6 * s * Math.min(1, k * 2); for (let a = 0; a < 6.28; a += 0.5) px(x + Math.cos(a) * r * (0.7 + ((f.seed + a * 10) % 3) / 6), y + Math.sin(a) * r * 0.7, '#2a1a3a', 2, 2); px(x - 1, y - 1, '#5d275d', 3, 3); for (let j = 0; j < 3; j++) px(x - 4 + j * 4, y + r * 0.7 + k * 6, '#2a1a3a', 1, 2); break; }
        case 'hearts': for (let j = 0; j < 3; j++) shape('heart', x - 6 + j * 6, y - k * 16 - j * 3, j % 2 ? '#ff8fd0' : '#e04a7a'); break;
        case 'notes': for (let j = 0; j < 3; j++) shape('note', x - 6 + j * 6 + Math.sin(f.t * 10 + j) * 2, y - k * 18 - j * 4, j % 2 ? c : W); break;
        case 'smoke': b.globalAlpha *= 0.7; for (let j = 0; j < 3; j++) circle(x - 4 + j * 4, y - k * 8 - j, 2 + 3 * k, j % 2 ? '#6a6a7a' : '#4a4a5a', 0.6); break;
        case 'beam': { const w = Math.round(6 * s * Math.sin(k * Math.PI)) + 1; px(x - w / 2, 0, '#fff6c8', w, GY + 2); px(x - w / 4, 0, W, Math.max(1, w / 2), GY + 2); break; }
        case 'runes': for (let j = 0; j < 4; j++) { const a = f.t * 8 + j * 1.57; shape('rune', x + Math.cos(a) * 10, y + Math.sin(a) * 5, j % 2 ? c : '#c9b3ff'); } break;
        case 'quake': for (let j = 0; j < 4; j++) line(x, GY + 2, x + (j - 1.5) * 8 * Math.min(1, k * 3), GY + 2 + (j % 2), '#2a1a12'); break;
        case 'shatter': for (let j = 0; j < 8; j++) { const a = j * 0.785, r = 3 + 16 * k; const xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r; line(xx, yy, xx + Math.cos(a + 1) * 2, yy + Math.sin(a + 1) * 2, j % 2 ? '#bfefff' : W); } break;
        case 'vortex': for (let j = 0; j < 10; j++) { const a = j * 0.63 + f.t * 14, r = 14 * (1 - k) * (0.4 + j / 16); px(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, j % 2 ? c : W); } break;
        default: break;
      }
      b.globalAlpha = 1;
    }
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
    // The unit's own attack motion: offset, squash and stretch about its feet, a mirror flip, an afterimage.
    const pose = motionPose(e, styleOf(e)), dir = e.side === 0 ? 1 : -1;
    const pw = Math.round(img.width * pose.sx), ph = Math.round(img.height * pose.sy);
    const px0 = Math.round(sx - ox * pose.sx + dir * pose.dx), py0 = Math.round(fy - ph + dy + pose.dy);
    const put = (im) => {
      if (!pose.flip) { b.drawImage(im, px0, py0, pw, ph); return; }
      b.save(); b.translate(px0 + pw, py0); b.scale(-1, 1); b.drawImage(im, 0, 0, pw, ph); b.restore();
    };
    if (pose.ghost > 0) { b.globalAlpha = 0.3 * pose.ghost * alpha; b.drawImage(img, x0, y0); b.globalAlpha = 0.18 * pose.ghost * alpha; b.drawImage(img, Math.round((x0 + px0) / 2), y0); }
    b.globalAlpha = alpha;
    put(img);
    if (e.flash > 0) { b.globalAlpha = Math.min(1, e.flash * 8) * 0.8 * alpha; put(silhouette(name)); }
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
      SHY = shy; drawFx(dt);
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
