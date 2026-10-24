/* Animal Wars — pixel art.
 * Sweetie 16 palette, a tiny shaded Painter with selective outlines, and painters for every hero, Gloom enemy,
 * base, egg and icon. Everything is drawn once into small canvases and cached; the renderer scales them up.
 * Characters are drawn side-on facing right in a 34×28 "unit" grid scaled to their size; enemies are mirrored.
 * Frames: 0 and 1 walk, 2 wind-up, 3 strike.
 */
(function (root) {
  'use strict';

  const PAL = {
    night: '#1a1c2c', plum: '#5d275d', berry: '#b13e53', peach: '#ef7d57', butter: '#ffcd75', lime: '#a7f070',
    green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7',
    cream: '#f4f4f4', mist: '#94b0c2', slate: '#566c86', dusk: '#333c57', pink: '#ffa8c5', lav: '#a884f3', ink: '#0b0b16'
  };
  const INK = '#1a1c2c', PINK = '#ff8fb1', WHITE = '#fffdf6', GOLD = '#ffcd4d', BEAK = '#ffa34d', RED = '#e04848';

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgbHex(r) { return '#' + r.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function tones(base) {
    return { base: base, light: mix(base, '#fff6dc', 0.38), spec: mix(base, '#ffffff', 0.75), dark: mix(base, '#3a2a6e', 0.38), deep: mix(base, '#1a1030', 0.62), belly: mix(base, '#fffdf6', 0.62) };
  }

  // ---------------------------------------------------------------------------
  // Painter (pixel grid with shaded shapes and a selective outline)
  // ---------------------------------------------------------------------------
  function Painter(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  Painter.prototype.set = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; };
  Painter.prototype.clear = function (x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = null; };
  Painter.prototype.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.p[y * this.w + x] : null; };
  Painter.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); };
  Painter.prototype.ell = function (cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(nx, ny, x, y) : c);
    }
  };
  Painter.prototype.ball = function (cx, cy, rx, ry, T, opts) {
    opts = opts || {};
    this.ell(cx, cy, rx, ry, function (nx, ny) {
      const l = -(nx * 0.55 + ny * 0.85);
      if (opts.belly && ny > -0.1 && nx > -0.2) return l > 0.5 ? T.light : T.belly;
      return l > 0.5 ? T.light : l < -0.45 ? T.dark : T.base;
    });
    if (!opts.noSpec && rx > 2.5) { this.set(cx - rx * 0.45, cy - ry * 0.55, T.spec); }
  };
  Painter.prototype.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 400; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  Painter.prototype.tri = function (ax, ay, bx, by, cx, cy, c) {
    const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!area) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
    }
  };
  Painter.prototype.outline = function (ink) {
    const out = this.p.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      let n = null;
      for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const c = this.get(x + d[0], y + d[1]); if (c) { n = c; break; } }
      if (n) out[y * this.w + x] = mix(n, ink || '#140c26', 0.7);
    }
    this.p = out;
  };
  Painter.prototype.canvas = function () {
    const c = makeCanvas(this.w, this.h);
    if (!c) return null;
    const g = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const v = this.p[y * this.w + x]; if (v) { g.fillStyle = v; g.fillRect(x, y, 1, 1); } }
    return c;
  };

  // ---------------------------------------------------------------------------
  // Kit: unit-space drawing helpers for character painters (34×28 units, ground at y = 27).
  // ---------------------------------------------------------------------------
  function Kit(P, u, f) {
    this.P = P; this.u = u; this.f = f;
    this.lean = f === 2 ? -1 : f === 3 ? 1.6 : 0;
    this.step = f === 0 ? 1 : f === 1 ? -1 : 0;
    this.atk = f === 3; this.wind = f === 2;
  }
  const K = Kit.prototype;
  K.ell = function (x, y, rx, ry, c) { this.P.ell(x * this.u, y * this.u, Math.max(0.6, rx * this.u), Math.max(0.6, ry * this.u), c); };
  K.ball = function (x, y, rx, ry, T, o) { this.P.ball(x * this.u, y * this.u, Math.max(0.6, rx * this.u), Math.max(0.6, ry * this.u), T, o); };
  K.rect = function (x, y, w, h, c) { const u = this.u; this.P.rect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)), c); };
  K.tri = function (ax, ay, bx, by, cx, cy, c) { const u = this.u; this.P.tri(ax * u, ay * u, bx * u, by * u, cx * u, cy * u, c); };
  K.line = function (x0, y0, x1, y1, c, w) {
    const u = this.u, t = Math.max(1, Math.round((w || 1) * u * 0.75));
    for (let i = 0; i < t; i++) for (let j = 0; j < t; j++) this.P.line(x0 * u + i, y0 * u + j, x1 * u + i, y1 * u + j, c);
  };
  K.px = function (x, y, c) { this.P.set(x * this.u, y * this.u, c); };
  // Eye looking right: white, pupil, glint. Pixel sized (not scaled) so faces stay crisp.
  K.eye = function (x, y, o) {
    o = o || {};
    const P = this.P, u = this.u, px = Math.round(x * u), py = Math.round(y * u);
    const big = u >= 1.45 || o.big;
    if (o.angry) {
      P.rect(px - 1, py - 1, 3, 3, o.glow || '#ffe066'); P.set(px + 1, py, INK); P.set(px, py, INK);
      P.line(px - 2, py - 3, px + 2, py - 1, INK);
      return;
    }
    if (o.closed) { P.rect(px - 1, py, 3, 1, INK); return; }
    if (big) { P.rect(px - 1, py - 2, 3, 4, WHITE); P.rect(px, py - 1, 2, 3, INK); P.set(px, py - 1, WHITE); }
    else { P.rect(px, py - 1, 2, 3, INK); P.set(px, py - 1, WHITE); }
  };
  K.blush = function (x, y) { const u = this.u; this.P.set(x * u, y * u, PINK); this.P.set(x * u + 1, y * u, PINK); };
  K.smile = function (x, y) { const P = this.P, u = this.u, px = Math.round(x * u), py = Math.round(y * u); if (this.atk) { P.rect(px - 1, py, 2, 2, INK); P.set(px - 1, py + 1, '#c0405a'); } else { P.set(px - 1, py, INK); P.set(px, py + 1, INK); } };
  // Leg: a stubby rectangle with a darker foot. step shifts it for the walk cycle.
  K.leg = function (x, y, len, w, c, dir) {
    const s = this.step * (dir || 1) * 0.8;
    this.rect(x + s, y, w, len, c);
  };

  // Generic quadruped: body, head, 4 legs, tail. o: {bx, by, brx, bry, hx, hy, hr, legs, tail, ears, snout, ...}
  function quad(k, T, o) {
    const L = k.lean;
    const bx = o.bx || 13, by = o.by || 18, brx = o.brx || 7.5, bry = o.bry || 5.5;
    const leg = o.legLen || 4, lw = o.legW || 2.2;
    const far = T.dark;
    // Far legs, tail, body, near legs.
    k.leg(bx - brx * 0.55, by + bry * 0.4, leg + 0.5, lw, far, -1);
    k.leg(bx + brx * 0.4, by + bry * 0.4, leg + 0.5, lw, far, -1);
    if (o.tail) o.tail(bx - brx, by - 1);
    k.ball(bx + L * 0.3, by, brx, bry, T, { belly: o.belly !== false });
    k.leg(bx - brx * 0.35, by + bry * 0.45, leg, lw, T.base, 1);
    k.leg(bx + brx * 0.6, by + bry * 0.45, leg, lw, T.base, 1);
    if (o.body) o.body(bx + L * 0.3, by);
    const hx = (o.hx || 22) + L, hy = o.hy || 12, hr = o.hr || 5.5;
    if (o.earsBack) o.earsBack(hx, hy, hr);
    k.ball(hx, hy, hr, hr * (o.hry || 0.95), T);
    if (o.snout) o.snout(hx, hy, hr); else { k.ell(hx + hr * 0.75, hy + hr * 0.35, hr * 0.42, hr * 0.32, T.belly); k.px(hx + hr * 1.05, hy + hr * 0.15, INK); }
    if (o.ears) o.ears(hx, hy, hr);
    k.eye(hx + hr * 0.25, hy - hr * 0.1, o.eye);
    if (!o.noBlush) k.blush(hx + hr * 0.05, hy + hr * 0.5);
    return { hx: hx, hy: hy, hr: hr, top: hy - hr, bx: bx, by: by, handX: hx + hr, handY: hy + hr };
  }

  // Generic biped (stands upright): body, head on top, 2 legs, one arm.
  function biped(k, T, o) {
    const L = k.lean;
    const bx = o.bx || 15, by = o.by || 19, brx = o.brx || 5.5, bry = o.bry || 6;
    const leg = o.legLen || 3;
    k.leg(bx - 2.5, by + bry - 1.5, leg + 0.5, 2.4, T.dark, -1);
    if (o.tail) o.tail(bx - brx, by + 2);
    if (o.armBack) o.armBack(bx, by);
    k.ball(bx + L * 0.4, by, brx, bry, T, { belly: o.belly !== false });
    k.leg(bx + 1, by + bry - 1.5, leg, 2.4, T.base, 1);
    const hx = (o.hx || 16.5) + L, hy = o.hy || 10.5, hr = o.hr || 6;
    if (o.earsBack) o.earsBack(hx, hy, hr);
    k.ball(hx, hy, hr, hr * (o.hry || 0.92), T);
    if (o.snout) o.snout(hx, hy, hr);
    if (o.ears) o.ears(hx, hy, hr);
    k.eye(hx + hr * 0.35, hy - hr * 0.05, o.eye);
    if (!o.noBlush) k.blush(hx + hr * 0.15, hy + hr * 0.45);
    if (o.mouth !== false) k.smile(hx + hr * 0.6, hy + hr * 0.42);
    // Arm: swings forward on the strike frame.
    const ax = bx + brx * 0.4 + L + (k.atk ? 3 : k.wind ? -1 : 0), ay = by + (k.atk ? -1 : 1);
    if (o.arm !== false) k.ball(ax, ay, 2, 1.8, T, { noSpec: true });
    return { hx: hx, hy: hy, hr: hr, top: hy - hr, bx: bx, by: by, handX: ax + 1.5, handY: ay };
  }

  // Generic bird: round body, head, beak, wing, thin legs.
  function bird(k, T, o) {
    const L = k.lean;
    const bx = o.bx || 14, by = o.by || 18, brx = o.brx || 6.5, bry = o.bry || 6;
    const legc = o.legc || BEAK;
    if (!o.fly) {
      k.line(bx - 1 + k.step * 0.6, by + bry - 1, bx - 1 + k.step * 0.6, 26.5, legc, 0.8);
      k.line(bx + 2 - k.step * 0.6, by + bry - 1, bx + 2 - k.step * 0.6, 26.5, legc, 0.8);
    }
    if (o.tail) o.tail(bx - brx, by);
    k.ball(bx + L * 0.3, by, brx, bry, T, { belly: true });
    const hx = (o.hx || 19.5) + L, hy = o.hy || 11.5, hr = o.hr || 5;
    k.ball(hx, hy, hr, hr, T);
    const bl = o.beakLen || 3.5;
    k.tri(hx + hr * 0.8, hy - 0.8, hx + hr * 0.8, hy + 1.6, hx + hr * 0.8 + bl, hy + (k.atk ? 1.2 : 0.4), o.beak || BEAK);
    if (k.atk) k.line(hx + hr * 0.8, hy + 0.6, hx + hr * 0.8 + bl - 0.6, hy + 0.9, mix(o.beak || BEAK, INK, 0.5));
    if (o.head) o.head(hx, hy, hr);
    k.eye(hx + hr * 0.25, hy - hr * 0.15, o.eye);
    if (!o.noBlush) k.blush(hx - hr * 0.1, hy + hr * 0.45);
    // Wing flaps up on wind-up, out on strike.
    const wy = by - (k.wind ? 3 : k.atk ? 1 : 0) - (o.fly && k.f === 1 ? 2 : 0);
    const W = tones(o.wing || T.dark);
    k.ball(bx - 1 + L * 0.3, wy, brx * 0.7, bry * 0.5, W, { noSpec: true });
    return { hx: hx, hy: hy, hr: hr, top: hy - hr, bx: bx, by: by, handX: bx + brx, handY: by };
  }

  function wings(k, x, y, w, h, c, flap) {
    const T = tones(c), up = flap ? -h * 0.5 : 0;
    k.tri(x, y, x - w, y - h + up, x - w * 0.3, y + 1, T.base);
    k.tri(x, y, x - w * 0.8, y - h * 0.6 + up, x - w * 0.2, y + 1, T.light);
    k.tri(x, y + 1, x - w * 0.9, y - h * 0.2 + up, x - w * 0.5, y + 2, T.dark);
  }

  // ---------------------------------------------------------------------------
  // Heroes
  // ---------------------------------------------------------------------------
  const ears = {
    round: (k, T, s) => (x, y, r) => { k.ball(x - r * 0.45, y - r * 0.85, r * 0.38 * s, r * 0.38 * s, T, { noSpec: true }); k.ell(x - r * 0.45, y - r * 0.85, r * 0.18 * s, r * 0.18 * s, PINK); },
    pointy: (k, T, inner) => (x, y, r) => { k.tri(x - r * 0.9, y - r * 0.4, x - r * 0.1, y - r * 0.75, x - r * 0.65, y - r * 1.65, T.base); k.tri(x - r * 0.72, y - r * 0.6, x - r * 0.3, y - r * 0.75, x - r * 0.6, y - r * 1.3, inner || PINK); },
    long: (k, T) => (x, y, r) => { k.ell(x - r * 0.55, y - r * 1.35, r * 0.28, r * 0.85, T.base); k.ell(x - r * 0.5, y - r * 1.3, r * 0.12, r * 0.6, PINK); },
    tiny: (k, T) => (x, y, r) => { k.ell(x - r * 0.3, y - r * 0.85, r * 0.22, r * 0.2, T.dark); }
  };
  const tails = {
    stub: (k, T) => (x, y) => k.ell(x, y, 1.4, 1.2, T.dark),
    puff: (k, c) => (x, y) => k.ball(x - 0.5, y - 1, 2, 2, tones(c), { noSpec: true }),
    long: (k, T, curl) => (x, y) => { k.line(x, y, x - 3, y - 2, T.dark, 1); k.line(x - 3, y - 2, x - 4, y - 5 - (curl || 0), T.dark, 1); },
    bushy: (k, T, tip) => (x, y) => { k.ball(x - 2.5, y - 3, 3, 4.5, T, { noSpec: true }); if (tip) k.ell(x - 3, y - 6.5, 1.8, 1.4, tip); }
  };

  const HERO_ART = {
    hamster: function (k, T, c) {
      return biped(k, T, { brx: 6.5, bry: 6, by: 19.5, hx: 16, hy: 12, hr: 6.4, legLen: 2,
        ears: ears.round(k, T, 1), snout: (x, y, r) => { k.ell(x + r * 0.6, y + r * 0.35, r * 0.45, r * 0.35, T.belly); k.px(x + r * 0.95, y + r * 0.15, PINK); },
        body: null });
    },
    turtle: function (k, T, c) {
      const S = tones(c.b);
      const L = k.lean;
      k.leg(8, 22, 3, 2.6, T.dark, -1); k.leg(18, 22, 3, 2.6, T.dark, -1);
      k.ball(23 + L, 18, 4, 3.6, T); k.eye(24.5 + L, 17.2); k.blush(23.5 + L, 19.4); k.smile(26 + L, 19);
      k.ell(13 + L * 0.3, 18, 9.5, 7, function (nx, ny) { return ny > 0.55 ? S.dark : ((Math.abs(nx * 3 + ny * 2) % 1.4) < 0.25 ? S.dark : (ny < -0.4 ? S.light : S.base)); });
      k.ell(13 + L * 0.3, 23.5, 9, 1.6, T.belly);
      k.leg(10, 23, 3, 2.6, T.base, 1); k.leg(20, 23, 3, 2.6, T.base, 1);
      return { hx: 23 + L, hy: 18, hr: 4, top: 11, bx: 13, by: 18, handX: 26, handY: 20 };
    },
    hedgehog: function (k, T, c) {
      const Q = tones(c.c), F = tones(c.b);
      const L = k.lean;
      k.leg(9, 22, 3, 2.2, Q.deep, -1); k.leg(17, 22, 3, 2.2, Q.deep, -1);
      for (let a = 0; a < 9; a++) { const ang = Math.PI * (0.55 + a * 0.11), x = 13 + L * 0.3 + Math.cos(ang) * 8, y = 18 - Math.sin(ang) * 7; k.tri(x - 1.5, y + 1, x + 1.5, y + 1, x - Math.cos(ang) * -3, y - Math.sin(ang) * 3.2, Q.dark); }
      k.ball(13 + L * 0.3, 18, 8, 6.5, Q);
      k.ball(21 + L, 18.5, 4.5, 4, F);
      k.tri(24 + L, 17.5, 24 + L, 20.5, 27.5 + L, 19, F.base); k.px(27.5 + L, 19, INK);
      k.eye(22.5 + L, 17.2); k.blush(21.5 + L, 20);
      k.leg(11, 23, 3, 2.2, Q.dark, 1); k.leg(18, 23, 3, 2.2, Q.dark, 1);
      return { hx: 21 + L, hy: 18, hr: 4.5, top: 10, bx: 13, by: 18, handX: 24, handY: 21 };
    },
    giraffe: function (k, T, c) {
      const L = k.lean, S = c.b;
      const r = quad(k, T, { bx: 11, by: 19, brx: 6.5, bry: 4.5, hx: 22, hy: 5.5, hr: 3.8, legLen: 4.5, legW: 1.8,
        body: (x, y) => { for (const [dx, dy] of [[-3, -1], [1, -2], [3, 1], [-1, 2]]) k.ell(x + dx, y + dy, 1.2, 1, S); },
        tail: tails.long(k, T),
        snout: (x, y, r) => { k.ell(x + r * 0.8, y + r * 0.4, r * 0.55, r * 0.42, T.belly); k.px(x + r * 1.2, y + r * 0.2, INK); },
        ears: (x, y, r) => { k.line(x - r * 0.3, y - r, x - r * 0.4, y - r * 1.8, S, 0.8); k.ell(x - r * 0.4, y - r * 1.9, 0.8, 0.8, S); k.ell(x - r * 1, y - r * 0.5, r * 0.4, r * 0.2, T.dark); } });
      // Neck drawn after the body, under the head.
      k.line(15 + L * 0.3, 16, 20.5 + L, 8, T.base, 2.6);
      k.ell(17.5 + L * 0.6, 12, 0.9, 0.8, S); k.ell(19 + L * 0.8, 9.5, 0.8, 0.7, S);
      k.ball(22 + L, 5.5, 3.8, 3.6, T); k.ell(22 + 3 + L, 6.8, 2, 1.6, T.belly); k.px(26.5 + L, 6.2, INK);
      k.line(21.4 + L, 2, 21.2 + L, 0.6, S, 0.8); k.ell(21.2 + L, 0.6, 0.8, 0.8, S);
      k.eye(23 + L, 5); k.blush(22.4 + L, 7.2);
      r.hx = 22 + L; r.hy = 5.5; r.top = 1; r.handX = 26; r.handY = 7;
      return r;
    },
    rabbit: function (k, T, c) {
      return biped(k, T, { brx: 5.5, bry: 6, by: 19.5, hx: 16.5, hy: 12, hr: 5.6, legLen: 2.2, ears: ears.long(k, T), tail: tails.puff(k, '#ffffff'),
        snout: (x, y, r) => { k.px(x + r * 0.95, y + r * 0.15, PINK); } });
    },
    owl: function (k, T, c) {
      return bird(k, T, { brx: 6.5, bry: 7, by: 17.5, hx: 17, hy: 9.5, hr: 5.5, beakLen: 2, wing: T.dark,
        head: (x, y, r) => { k.tri(x - r * 0.8, y - r * 0.6, x - r * 0.2, y - r * 0.9, x - r * 0.9, y - r * 1.6, T.dark); k.ell(x + r * 0.3, y - r * 0.1, r * 0.55, r * 0.55, c.b); } });
    },
    frog: function (k, T, c) {
      const L = k.lean;
      k.ell(8 + k.step * 0.5, 24.5, 3.5, 2, T.dark);
      k.ball(14 + L * 0.3, 19, 8.5, 6, T, { belly: true });
      k.ell(20 + k.step * 0.5, 24.8, 3, 1.6, T.dark);
      k.ball(16 + L, 12.5, 3, 3, T); k.ball(21 + L, 12.5, 3, 3, T);
      k.eye(17 + L, 12.3, { big: true }); k.eye(22 + L, 12.3, { big: true });
      k.line(17 + L, 18, 23 + L, 17, INK, 0.8);
      if (k.atk) k.ell(24 + L, 18, 1.8, 1.2, PINK);
      k.blush(23 + L, 15.5);
      return { hx: 20 + L, hy: 13, hr: 4, top: 9, bx: 14, by: 19, handX: 24, handY: 18 };
    },
    bear: function (k, T, c) {
      return biped(k, T, { brx: 7.5, bry: 7, by: 19, hx: 17, hy: 10, hr: 6.4, legLen: 2.5, ears: ears.round(k, T, 1.1),
        snout: (x, y, r) => { k.ell(x + r * 0.62, y + r * 0.35, r * 0.48, r * 0.36, T.belly); k.rect(x + r * 0.95, y + r * 0.05, 1, 1, INK); } });
    },
    croc: function (k, T, c) {
      const L = k.lean, B = tones(c.b);
      k.leg(8, 21, 4, 2.6, T.dark, -1); k.leg(17, 21, 4, 2.6, T.dark, -1);
      k.line(5, 19, -0, 22, T.dark, 2.2);
      k.ball(12 + L * 0.3, 18.5, 8.5, 4.6, T, { belly: true });
      for (let x = 6; x < 18; x += 2.5) k.tri(x, 14.5, x + 1.2, 12.6, x + 2.4, 14.5, T.dark);
      // Jaws: open on strike.
      const open = k.atk ? 2.5 : k.wind ? 1.2 : 0.3;
      k.ball(22 + L, 15, 4.6, 3.4, T);
      k.rect(23 + L, 14 - open * 0.5, 9, 2.4, T.base); k.rect(23 + L, 16 + open * 0.5, 8.5, 2, B.base);
      for (let x = 24; x < 31; x += 2) { k.px(x + L, 16.2 - open * 0.5, WHITE); k.px(x + 1 + L, 15.8 + open * 0.5, WHITE); }
      k.eye(22.5 + L, 12.2); k.ball(22.5 + L, 11.4, 1.8, 1, T, { noSpec: true }); k.eye(22.8 + L, 12.4);
      k.leg(10, 22, 4, 2.6, T.base, 1); k.leg(19, 22, 4, 2.6, T.base, 1);
      return { hx: 22 + L, hy: 14, hr: 4.5, top: 10, bx: 12, by: 18, handX: 30, handY: 16 };
    },
    squirrel: function (k, T, c) {
      return biped(k, T, { brx: 5, bry: 5.5, by: 20, hx: 16, hy: 13, hr: 5.2, legLen: 2, ears: ears.pointy(k, T, T.dark), tail: tails.bushy(k, T, c.b),
        snout: (x, y, r) => { k.px(x + r * 0.95, y + r * 0.2, INK); } });
    },
    sheep: function (k, T, c) {
      const F = tones(c.b), W = tones(c.c);
      const L = k.lean;
      k.leg(9, 21, 4.5, 2, F.base, -1); k.leg(17, 21, 4.5, 2, F.base, -1);
      for (const [dx, dy] of [[-5, -2], [-2, -4], [2, -4], [5, -2], [-5, 2], [0, 3], [5, 2], [0, -1]]) k.ball(13 + dx + L * 0.3, 18 + dy, 3.5, 3.2, W, { noSpec: true });
      k.ball(21.5 + L, 14.5, 3.6, 4.2, F);
      k.ell(19.5 + L, 12, 2, 1, F.dark);
      for (const [dx, dy] of [[-1.5, -4.5], [1, -5], [-3, -3]]) k.ball(21 + dx + L, 14.5 + dy, 2, 1.8, W, { noSpec: true });
      k.eye(23 + L, 14); k.blush(22.5 + L, 16.5);
      k.leg(11, 22, 4.5, 2, F.light, 1); k.leg(19, 22, 4.5, 2, F.light, 1);
      return { hx: 21.5 + L, hy: 14.5, hr: 4, top: 8, bx: 13, by: 18, handX: 25, handY: 18 };
    },
    fox: function (k, T, c) {
      return quad(k, T, { bx: 12, by: 19, brx: 6.5, bry: 4.5, hx: 21, hy: 13, hr: 5, legLen: 3.6, legW: 1.8, ears: ears.pointy(k, T, T.deep), tail: tails.bushy(k, T, WHITE),
        snout: (x, y, r) => { k.tri(x + r * 0.2, y + r * 0.1, x + r * 0.2, y + r * 0.85, x + r * 1.6, y + r * 0.45, WHITE); k.px(x + r * 1.55, y + r * 0.4, INK); } });
    },
    goose: function (k, T, c) {
      const L = k.lean;
      const r = bird(k, T, { brx: 7, bry: 5.5, by: 19, hx: 21, hy: 6, hr: 3.6, beakLen: 3.5, beak: BEAK, wing: mix(c.c, '#94b0c2', 0.5), noBlush: false });
      k.line(17 + L * 0.5, 15, 20 + L, 9, T.base, 2.2);
      k.ball(21 + L, 6, 3.6, 3.4, T); k.tri(24 + L, 5, 24 + L, 7.6, 28 + L, k.atk ? 7.8 : 6.6, BEAK); k.eye(22 + L, 5.4); k.blush(21 + L, 7.6);
      r.top = 2.5; r.hy = 6;
      return r;
    },
    goat: function (k, T, c) {
      const H = tones(c.a);
      return quad(k, T, { bx: 12, by: 19, brx: 6.5, bry: 4.8, hx: 21, hy: 12, hr: 4.6, legLen: 4, legW: 1.8, tail: tails.stub(k, T),
        ears: (x, y, r) => { k.line(x - r * 0.3, y - r * 0.8, x - r * 1.3, y - r * 1.5, H.base, 1.2); k.line(x - r * 1.3, y - r * 1.5, x - r * 1.6, y - r * 0.6, H.base, 1.2); k.ell(x - r * 0.9, y - r * 0.2, r * 0.45, r * 0.22, T.dark); },
        snout: (x, y, r) => { k.ell(x + r * 0.7, y + r * 0.4, r * 0.5, r * 0.38, T.belly); k.px(x + r * 1.1, y + r * 0.25, INK); k.line(x + r * 0.5, y + r * 0.9, x + r * 0.6, y + r * 1.5, WHITE, 0.8); } });
    },
    puffer: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1 : 0, A = tones(c.a);
      const r = k.atk ? 8.5 : 7;
      for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; k.tri(15 + Math.cos(an) * (r - 0.5), 17 + bob + Math.sin(an) * (r - 0.5) - 0.8, 15 + Math.cos(an) * (r - 0.5), 17 + bob + Math.sin(an) * (r - 0.5) + 0.8, 15 + Math.cos(an) * (r + 2), 17 + bob + Math.sin(an) * (r + 2), T.dark); }
      k.tri(7, 17 + bob, 3, 13 + bob, 3, 21 + bob, A.base);
      k.ball(15 + L * 0.3, 17 + bob, r, r * 0.92, T, { belly: true });
      k.ell(13, 19 + bob, 2, 1.2, A.base);
      k.eye(19 + L, 15 + bob, { big: true }); k.blush(18.5 + L, 18 + bob); k.ell(21.8 + L, 18 + bob, 0.9, 0.9, '#c0405a');
      return { hx: 18 + L, hy: 15, hr: 5, top: 8, bx: 15, by: 17, handX: 22, handY: 18 };
    },
    penguin: function (k, T, c) {
      return biped(k, T, { brx: 6, bry: 7, by: 18.5, hx: 16, hy: 10, hr: 5.4, legLen: 2, arm: true, belly: true, mouth: false, noBlush: false,
        snout: (x, y, r) => { k.ell(x + r * 0.35, y + r * 0.15, r * 0.65, r * 0.75, WHITE); k.tri(x + r * 0.8, y, x + r * 0.8, y + r * 0.45, x + r * 1.5, y + r * 0.25, BEAK); } });
    },
    mole: function (k, T, c) {
      const L = k.lean;
      const r = quad(k, T, { bx: 13, by: 20, brx: 8, bry: 5, hx: 21, hy: 17, hr: 4.5, legLen: 2.2, legW: 2.4, noBlush: true,
        snout: (x, y, r) => { k.ell(x + r * 1, y + r * 0.2, r * 0.5, r * 0.35, PINK); k.ell(x + r * 1.35, y + r * 0.15, r * 0.22, r * 0.22, '#e06a8a'); },
        eye: { closed: true } });
      k.ell(22 + L + (k.atk ? 2 : 0), 21.5, 2, 1.2, PINK);
      return r;
    },
    sloth: function (k, T, c) {
      const L = k.lean, F = tones(c.b);
      const r = biped(k, T, { brx: 6, bry: 6.5, by: 19, hx: 16.5, hy: 11, hr: 5.4, legLen: 2.4, eye: { closed: true }, mouth: true,
        snout: (x, y, r) => { k.ell(x + r * 0.25, y + r * 0.05, r * 0.75, r * 0.65, F.base); k.ell(x + r * 0.35, y - r * 0.05, r * 0.42, r * 0.2, T.deep); k.px(x + r * 0.85, y + r * 0.25, INK); } });
      return r;
    },
    parrot: function (k, T, c) {
      return bird(k, T, { brx: 5.5, bry: 6.5, by: 17.5, hx: 17.5, hy: 10, hr: 4.8, beakLen: 2.8, beak: '#ffe0a0', wing: c.a, legc: '#8a8a9a',
        tail: (x, y) => { k.tri(x + 1, y + 2, x - 4, y + 9, x - 1, y + 9, tones(c.a).base); k.tri(x + 1, y + 2, x - 2, y + 9, x + 1, y + 8, c.b); },
        head: (x, y, r) => { k.ell(x + r * 0.35, y - r * 0.05, r * 0.45, r * 0.45, WHITE); } });
    },
    beaver: function (k, T, c) {
      const L = k.lean;
      const r = biped(k, T, { brx: 6.5, bry: 6.5, by: 19, hx: 16.5, hy: 11, hr: 5.4, legLen: 2.2, ears: ears.tiny(k, T),
        tail: (x, y) => { k.ell(x - 2.5, y + 4, 4, 2, '#5a3a2a'); for (let i = -2; i < 3; i += 2) k.px(x - 2.5 + i, y + 4, '#3a2a1a'); },
        snout: (x, y, r) => { k.ell(x + r * 0.6, y + r * 0.35, r * 0.48, r * 0.36, T.belly); k.px(x + r * 0.98, y + r * 0.15, INK); k.rect(x + r * 0.62, y + r * 0.7, 1.2, 1.4, WHITE); } });
      return r;
    },
    skunk: function (k, T, c) {
      const W = tones(c.b);
      return quad(k, T, { bx: 13, by: 19, brx: 7, bry: 5, hx: 21.5, hy: 14, hr: 4.6, legLen: 2.8,
        body: (x, y) => { k.ell(x, y - 4, 6, 1.4, W.base); },
        tail: (x, y) => { k.ball(x - 1.5, y - 5, 3.5, 6, T, { noSpec: true }); k.ell(x - 1.5, y - 6, 1.2, 4.5, W.base); },
        ears: ears.round(k, T, 0.8),
        snout: (x, y, r) => { k.line(x - r * 0.2, y - r, x + r * 0.4, y, W.base, 0.9); k.px(x + r * 1.05, y + r * 0.2, INK); } });
    },
    kiwi: function (k, T, c) {
      return bird(k, T, { brx: 7, bry: 6, by: 19.5, hx: 19, hy: 16, hr: 3.6, beakLen: 6, beak: '#e8d8b0', wing: T.dark, legc: '#c8a070', noBlush: false });
    },
    kangaroo: function (k, T, c) {
      const L = k.lean;
      const r = biped(k, T, { brx: 6, bry: 7, by: 18, hx: 17, hy: 8.5, hr: 4.8, legLen: 3.5, ears: (x, y, r) => { k.ell(x - r * 0.5, y - r * 1.15, r * 0.3, r * 0.7, T.base); k.ell(x - r * 0.45, y - r * 1.1, r * 0.13, r * 0.45, PINK); },
        tail: (x, y) => { k.line(x + 1, y + 4, x - 5, y + 8.5, T.dark, 2.2); },
        snout: (x, y, r) => { k.ell(x + r * 0.75, y + r * 0.35, r * 0.55, r * 0.4, T.belly); k.px(x + r * 1.2, y + r * 0.2, INK); } });
      k.ell(10 + k.step * 0.4, 25.5, 4, 1.3, T.dark);
      return r;
    },
    panda: function (k, T, c) {
      const D = tones(c.b);
      return biped(k, T, { brx: 7.5, bry: 7, by: 19, hx: 17, hy: 10, hr: 6.4, legLen: 2.5, ears: (x, y, r) => { k.ball(x - r * 0.5, y - r * 0.8, r * 0.35, r * 0.35, D); },
        body: null,
        snout: (x, y, r) => { k.ell(x + r * 0.3, y - r * 0.05, r * 0.32, r * 0.36, D.base); k.ell(x + r * 0.7, y + r * 0.42, r * 0.4, r * 0.28, WHITE); k.px(x + r * 0.98, y + r * 0.25, INK); },
        armBack: (x, y) => { k.ell(x, y - 1, 7, 2.5, D.base); } });
    },
    walrus: function (k, T, c) {
      const L = k.lean;
      k.ball(12 + L * 0.3, 20, 9, 5.5, T, { belly: true });
      k.ell(5, 24.5, 3, 1.4, T.dark); k.ell(17 + k.step * 0.5, 25, 2.8, 1.4, T.dark);
      k.ball(21 + L, 15, 5, 4.6, T);
      k.ball(24 + L, 17.5, 2.4, 2, tones(c.b), { noSpec: true }); k.ball(21.5 + L, 17.8, 2.2, 1.9, tones(c.b), { noSpec: true });
      k.rect(21.5 + L, 19, 1, 4, WHITE); k.rect(24 + L, 19, 1, 4, WHITE);
      k.px(23 + L, 16.3, INK);
      k.eye(22.5 + L, 13.5);
      return { hx: 21 + L, hy: 15, hr: 5, top: 10, bx: 12, by: 20, handX: 26, handY: 19 };
    },
    greyhound: function (k, T, c) {
      return quad(k, T, { bx: 12, by: 17.5, brx: 7.5, bry: 4, hx: 22.5, hy: 11, hr: 4, legLen: 5.5, legW: 1.5, tail: tails.long(k, T, 1),
        ears: (x, y, r) => { k.tri(x - r * 0.9, y - r * 0.6, x - r * 0.2, y - r * 0.9, x - r * 1.6, y - r * 0.2, T.dark); },
        snout: (x, y, r) => { k.tri(x + r * 0.3, y - r * 0.1, x + r * 0.3, y + r * 0.8, x + r * 2, y + r * 0.45, T.light); k.px(x + r * 1.95, y + r * 0.35, INK); } });
    },
    shiba: function (k, T, c) {
      const F = tones(c.b);
      return quad(k, T, { bx: 12, by: 19, brx: 6.8, bry: 4.8, hx: 21, hy: 12.5, hr: 5.2, legLen: 3.4, legW: 2, ears: ears.pointy(k, T, F.base),
        tail: (x, y) => { k.ball(x + 0.5, y - 3, 2.6, 2.6, T, { noSpec: true }); k.ell(x + 0.8, y - 3, 1.1, 1.1, F.base); },
        snout: (x, y, r) => { k.ell(x + r * 0.55, y + r * 0.45, r * 0.65, r * 0.42, F.base); k.px(x + r * 1.15, y + r * 0.2, INK); } });
    },
    raccoon: function (k, T, c) {
      const D = tones('#3a3a4a');
      return biped(k, T, { brx: 6, bry: 6.5, by: 19, hx: 16.5, hy: 10.5, hr: 5.8, legLen: 2.4, ears: ears.pointy(k, T, D.base),
        tail: (x, y) => { for (let i = 0; i < 4; i++) k.ball(x - 1.5 - i * 0.8, y - i * 2.2, 2.4, 1.6, i % 2 ? D : T, { noSpec: true }); },
        snout: (x, y, r) => { k.ell(x + r * 0.3, y - r * 0.05, r * 0.7, r * 0.33, D.base); k.ell(x + r * 0.7, y + r * 0.42, r * 0.38, r * 0.28, WHITE); k.px(x + r * 1.02, y + r * 0.3, INK); } });
    },
    rhino: function (k, T, c) {
      const L = k.lean;
      const r = quad(k, T, { bx: 12, by: 18, brx: 9, bry: 6, hx: 23, hy: 15, hr: 5, legLen: 3.6, legW: 3, tail: tails.stub(k, T), noBlush: false,
        ears: ears.tiny(k, T),
        snout: (x, y, r) => { k.ell(x + r * 0.7, y + r * 0.35, r * 0.6, r * 0.45, T.light); k.tri(x + r * 0.8, y - r * 0.1, x + r * 1.4, y - r * 0.1, x + r * 1.4, y - r * 1.4, WHITE); k.tri(x + r * 0.2, y - r * 0.5, x + r * 0.6, y - r * 0.5, x + r * 0.55, y - r * 1.2, WHITE); } });
      return r;
    },
    bat: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1.5 : 0;
      wings(k, 14, 13 + bob, 11, 7, c.b, k.f === 1 || k.wind);
      k.ball(15 + L * 0.3, 15 + bob, 5, 5.5, T, { belly: true });
      k.tri(14 + L, 10 + bob, 16 + L, 9 + bob, 14.5 + L, 5.5 + bob, T.base); k.tri(17 + L, 9.5 + bob, 19 + L, 10 + bob, 18.5 + L, 5.5 + bob, T.base);
      k.eye(18 + L, 13 + bob); k.px(19.5 + L, 16 + bob, WHITE); k.blush(17.5 + L, 15.5 + bob);
      k.line(14, 20.5 + bob, 14, 22 + bob, T.dark); k.line(16, 20.5 + bob, 16, 22 + bob, T.dark);
      return { hx: 17 + L, hy: 13, hr: 4, top: 6, bx: 15, by: 15, handX: 20, handY: 16 };
    },
    crab: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 3; i++) { k.line(9 + i * 2 + k.step * (i % 2 ? 0.5 : -0.5), 20, 7 + i * 2, 26, T.dark, 0.9); k.line(17 + i * 2 - k.step * (i % 2 ? 0.5 : -0.5), 20, 19 + i * 2, 26, T.dark, 0.9); }
      k.ball(15 + L * 0.3, 18, 8, 5, T, { belly: true });
      const cx = 25 + L + (k.atk ? 2 : 0), cy = k.wind ? 10 : 14;
      k.line(21 + L, 17, cx - 1, cy + 1, T.dark, 1.2);
      k.ball(cx, cy, 3.2, 2.6, T); k.tri(cx + 1, cy - 0.5, cx + 4, cy - 3 - (k.atk ? 1 : 0), cx + 3.2, cy, T.base);
      k.line(13 + L, 13, 12.5 + L, 10, T.dark); k.line(17 + L, 13, 17.5 + L, 10, T.dark);
      k.eye(12.5 + L, 10); k.eye(17.5 + L, 10);
      k.smile(18 + L, 17);
      return { hx: 15 + L, hy: 12, hr: 4, top: 7, bx: 15, by: 18, handX: cx, handY: cy };
    },
    stag: function (k, T, c) {
      const A = tones('#e8d8b0');
      return quad(k, T, { bx: 12, by: 18, brx: 7.5, bry: 5, hx: 21.5, hy: 11, hr: 4.6, legLen: 5, legW: 1.8, tail: tails.puff(k, WHITE),
        ears: (x, y, r) => {
          k.ell(x - r * 0.9, y - r * 0.4, r * 0.45, r * 0.22, T.dark);
          k.line(x - r * 0.2, y - r * 0.8, x - r * 0.6, y - r * 2.4, A.base, 1); k.line(x - r * 0.4, y - r * 1.6, x + r * 0.4, y - r * 2.2, A.base, 1);
          k.line(x - r * 0.6, y - r * 2.4, x - r * 1.4, y - r * 2.8, A.base, 1); k.line(x - r * 0.5, y - r * 2, x - r * 1.5, y - r * 1.8, A.base, 1);
        },
        snout: (x, y, r) => { k.ell(x + r * 0.75, y + r * 0.35, r * 0.5, r * 0.35, T.belly); k.px(x + r * 1.15, y + r * 0.2, INK); } });
    },
    chameleon: function (k, T, c) {
      const L = k.lean;
      k.leg(10, 20, 4, 1.6, T.dark, -1); k.leg(17, 20, 4, 1.6, T.dark, -1);
      k.line(7, 19, 3, 21, T.base, 1.6); k.ell(3, 19.5, 2, 2, T.dark); k.ell(3, 19.5, 1, 1, T.base);
      k.ball(13 + L * 0.3, 17.5, 7, 4.5, T, { belly: true });
      for (let x = 9; x < 18; x += 3) k.px(x, 15, T.light);
      k.ball(21 + L, 15, 4.4, 3.8, T); k.tri(18 + L, 12, 21 + L, 10, 22 + L, 12.5, T.dark);
      k.ball(22 + L, 14, 2, 2, tones(c.b), { noSpec: true }); k.eye(22.8 + L, 14);
      if (k.atk) { k.line(25 + L, 16.5, 31 + L, 16, PINK, 0.8); k.ell(31.5 + L, 16, 1, 1, '#ff6b8a'); }
      k.leg(12, 21, 4, 1.6, T.base, 1); k.leg(19, 21, 4, 1.6, T.base, 1);
      return { hx: 21 + L, hy: 14, hr: 4, top: 10, bx: 13, by: 17, handX: 24, handY: 18 };
    },
    gorilla: function (k, T, c) {
      const F = tones(c.b), L = k.lean;
      k.leg(10, 21, 4, 3, T.dark, -1);
      k.ball(13 + L * 0.3, 16.5, 8, 7, T, { belly: false });
      k.ell(16 + L * 0.3, 18, 4, 4.5, F.base);
      k.leg(15, 22, 3.5, 3, T.base, 1);
      // Big knuckle-walking arm.
      const ax = 22 + L + (k.atk ? 3 : 0), ay = k.wind ? 10 : 18;
      k.line(18 + L, 13, ax, ay, T.base, 2.8); k.ball(ax + 0.5, ay + 1.5, 2.6, 2.6, T);
      k.ball(19 + L, 9.5, 4.6, 4.4, T);
      k.ell(21 + L, 10.5, 2.8, 3, F.base); k.ell(20.5 + L, 8, 2.8, 1, T.dark);
      k.eye(21.2 + L, 9.2); k.px(23 + L, 11, INK); k.px(22.5 + L, 12.5, INK);
      return { hx: 19 + L, hy: 9.5, hr: 4.6, top: 4.5, bx: 13, by: 16, handX: ax, handY: ay };
    },
    elephant: function (k, T, c) {
      const L = k.lean;
      const r = quad(k, T, { bx: 12, by: 17, brx: 9.5, bry: 7, hx: 22, hy: 13, hr: 5.5, legLen: 4.5, legW: 3.2, tail: tails.long(k, T),
        earsBack: (x, y, r) => { k.ball(x - r * 0.7, y + r * 0.1, r * 0.75, r * 0.95, T, { noSpec: true }); k.ell(x - r * 0.65, y + r * 0.15, r * 0.45, r * 0.65, PINK); },
        snout: (x, y, r) => {
          const tip = k.atk ? -2 : 3;
          k.line(x + r * 0.7, y + r * 0.2, x + r * 1.3, y + r * 0.9, T.base, 2.2); k.line(x + r * 1.3, y + r * 0.9, x + r * 1.6, y + r * 0.9 + tip * 0.6 + 2, T.base, 1.8);
          k.tri(x + r * 0.5, y + r * 0.6, x + r * 0.9, y + r * 0.6, x + r * 1.2, y + r * 1.25, WHITE);
        } });
      return r;
    },
    phoenix: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1 : 0, A = tones(c.b), R = tones(c.a);
      for (let i = 0; i < 3; i++) k.tri(9, 17 + bob, 1 + i * 1.5, 22 + i * 2 + bob, 4 + i * 2, 24 + i + bob, [R.base, A.base, T.base][i]);
      wings(k, 14, 14 + bob, 12, 9, c.c, k.f !== 0);
      const r = bird(k, T, { fly: true, brx: 5.5, bry: 5, by: 16 + bob, bx: 14, hx: 19, hy: 10 + bob, hr: 4, beakLen: 2.5, beak: GOLD, wing: c.b,
        head: (x, y, r) => { for (let i = 0; i < 3; i++) k.tri(x - r * 0.6 + i, y - r * 0.7, x - r * 0.2 + i, y - r * 0.8, x - r * 1.4 + i * 0.6, y - r * 2 + i * 0.4, [A.base, T.base, R.base][i]); } });
      return r;
    },
    octopus: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 5; i++) { const x = 8 + i * 3.4, w = Math.sin((k.f + i) * 1.6) * 1.2; k.line(x, 20, x + w, 25, T.dark, 1.6); k.line(x + w, 25, x + w + 1.5, 26.5, T.dark, 1.2); }
      k.ball(15 + L * 0.3, 13, 8.5, 8, T);
      for (const [dx, dy] of [[-4, -4], [-1, -6], [3, -5]]) k.ell(15 + dx, 13 + dy, 1, 0.9, T.light);
      k.eye(18 + L, 14, { big: true }); k.eye(13.5 + L, 14, { big: true });
      k.blush(19 + L, 17); k.smile(17 + L, 18.5);
      return { hx: 15 + L, hy: 13, hr: 8, top: 5, bx: 15, by: 15, handX: 24, handY: 17 };
    },
    wolf: function (k, T, c) {
      const F = tones(c.b);
      return quad(k, T, { bx: 12, by: 18, brx: 8, bry: 5, hx: 22, hy: 12, hr: 5, legLen: 4.5, legW: 2, ears: ears.pointy(k, T, T.deep), tail: tails.bushy(k, T, F.base),
        body: (x, y) => { k.ell(x + 5, y - 3, 3, 3.5, F.base); },
        snout: (x, y, r) => { k.tri(x + r * 0.2, y, x + r * 0.2, y + r * 0.9, x + r * 1.7, y + r * 0.5, F.base); k.px(x + r * 1.65, y + r * 0.4, INK); if (k.atk) k.tri(x + r * 0.6, y + r * 0.85, x + r * 1.2, y + r * 0.7, x + r * 0.8, y + r * 1.2, WHITE); } });
    },
    serpent: function (k, T, c) {
      const L = k.lean, B = tones(c.b);
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = 3 + t * 18, y = 21 - Math.sin(t * Math.PI * 1.5 + k.f * 0.7) * 3 - t * 4;
        k.ball(x, y, 3.2 - t * 0.3, 3, i % 2 ? T : tones(mix(c.c, c.b, 0.25)), { noSpec: true });
        k.ell(x, y + 2, 2, 0.8, B.base);
      }
      k.ball(23 + L, 12, 4.6, 4, T);
      k.ell(26.5 + L, 13.5, 2.4, 1.5, T.light); k.px(28.5 + L, 13, INK);
      k.line(22 + L, 9, 19 + L, 5, GOLD, 0.8); k.line(24 + L, 8.5, 23 + L, 4.5, GOLD, 0.8);
      k.line(27 + L, 15, 30 + L, 17, B.base, 0.6);
      k.eye(24.5 + L, 11);
      return { hx: 23 + L, hy: 12, hr: 4.5, top: 6, bx: 14, by: 18, handX: 28, handY: 14 };
    },
    whale: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1 : 0;
      k.tri(4, 15 + bob, -0.5, 10 + bob, 0.5, 19 + bob, T.dark); k.tri(4, 15 + bob, 0, 20 + bob, 2, 15 + bob, T.base);
      k.ell(16 + L * 0.3, 16 + bob, 13, 7.5, function (nx, ny) { return ny > 0.25 ? T.belly : (ny < -0.6 ? T.light : T.base); });
      for (let x = 10; x < 24; x += 2) k.line(x, 19.5 + bob, x, 22 + bob, T.dark);
      k.ell(16, 21 + bob, 3, 1.2, T.dark);
      k.eye(24 + L, 14.5 + bob); k.blush(24 + L, 17 + bob); k.smile(28 + L, 17.5 + bob);
      if (k.f === 1 || k.atk) { k.line(19, 7 + bob, 18, 4 + bob, '#bfe8ff'); k.line(20, 7 + bob, 21, 4 + bob, '#bfe8ff'); }
      return { hx: 22 + L, hy: 13, hr: 6, top: 8, bx: 16, by: 16, handX: 28, handY: 16 };
    },
    unicorn: function (k, T, c) {
      const M = c.b, A = c.a;
      return quad(k, T, { bx: 12, by: 18, brx: 7.5, bry: 5, hx: 21.5, hy: 11, hr: 4.6, legLen: 5, legW: 1.8,
        tail: (x, y) => { k.line(x, y - 1, x - 3, y + 4, M, 1.6); k.line(x - 1, y, x - 4, y + 6, A, 1.2); },
        ears: (x, y, r) => {
          k.tri(x - r * 0.9, y - r * 0.5, x - r * 0.3, y - r * 0.8, x - r * 0.6, y - r * 1.6, T.base);
          k.tri(x + r * 0.1, y - r * 0.8, x + r * 0.6, y - r * 0.6, x + r * 0.9, y - r * 2.6, GOLD);
          for (let i = 0; i < 4; i++) k.ball(x - r * 1.1 - i * 0.6, y - r * 0.3 + i * 1.8, 1.6, 1.4, tones(i % 2 ? M : A), { noSpec: true });
        },
        snout: (x, y, r) => { k.ell(x + r * 0.8, y + r * 0.4, r * 0.55, r * 0.4, T.belly); k.px(x + r * 1.2, y + r * 0.3, PINK); } });
    },
    moose: function (k, T, c) {
      const A = tones('#d8c0a0');
      return quad(k, T, { bx: 12, by: 17, brx: 8.5, bry: 6, hx: 22, hy: 13, hr: 4.8, legLen: 5, legW: 2.2, tail: tails.stub(k, T),
        body: (x, y) => { k.ell(x + 5, y - 4, 3.5, 2.5, T.base); },
        ears: (x, y, r) => {
          k.line(x - r * 0.3, y - r * 0.8, x - r * 0.6, y - r * 1.3, A.dark, 1);
          k.tri(x - r * 0.6, y - r * 1.1, x - r * 2.3, y - r * 1.6, x - r * 0.4, y - r * 1.7, A.base);
          k.tri(x - r * 0.6, y - r * 1.1, x + r * 0.9, y - r * 1.8, x - r * 0.3, y - r * 1.75, A.light);
          for (let i = 0; i < 5; i++) { const tx = x - r * 2.1 + i * 0.7 * r; k.line(tx, y - r * 1.6, tx - r * 0.1, y - r * 2.3, i < 3 ? A.base : A.light, 0.8); }
          k.ell(x - r * 0.9, y - r * 0.4, r * 0.4, r * 0.2, T.dark);
        },
        snout: (x, y, r) => { k.ell(x + r * 0.8, y + r * 0.45, r * 0.75, r * 0.55, T.light); k.px(x + r * 1.35, y + r * 0.35, INK); k.ell(x + r * 0.3, y + r * 1.2, r * 0.25, r * 0.4, T.dark); } });
    },
    moth: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1.2 : 0, W = tones(c.b);
      const flap = k.f === 1 || k.wind;
      k.ell(10, 10 + bob, 7, flap ? 4 : 6.5, W.base); k.ell(10, 10 + bob, 4, flap ? 2.2 : 4, W.light); k.ell(10, 10 + bob, 1.6, 1.6, c.a);
      k.ell(10, 18 + bob, 5.5, flap ? 3 : 4.5, T.base); k.ell(10, 18 + bob, 2.6, 2, T.light);
      k.ball(15 + L * 0.3, 15 + bob, 3.5, 6, tones('#e8d8f0'));
      k.ball(17 + L, 9.5 + bob, 3.6, 3.4, tones('#f4f0ff'));
      k.line(17 + L, 6.5 + bob, 18 + L, 2 + bob, T.dark); k.line(18.5 + L, 6.5 + bob, 21 + L, 2.5 + bob, T.dark);
      k.eye(18.5 + L, 9.5 + bob, { big: true }); k.blush(18.5 + L, 11.6 + bob);
      return { hx: 17 + L, hy: 9.5, hr: 3.5, top: 3, bx: 15, by: 15, handX: 20, handY: 14 };
    },
    mammoth: function (k, T, c) {
      const F = tones(c.c), L = k.lean;
      const r = quad(k, T, { bx: 12, by: 16, brx: 10, bry: 8, hx: 22, hy: 11, hr: 5.6, legLen: 4.5, legW: 3.4, tail: tails.long(k, T),
        body: (x, y) => { for (let i = -8; i < 9; i += 2) k.line(x + i, y + 3, x + i - 0.5, y + 7.5, T.dark, 0.7); k.ell(x + 2, y - 6, 6, 3, T.light); },
        snout: (x, y, r) => {
          k.line(x + r * 0.6, y + r * 0.3, x + r * 1.1, y + r * 1.4, T.base, 2.4); k.line(x + r * 1.1, y + r * 1.4, x + r * 0.9, y + r * 2.4, T.base, 2);
          k.line(x + r * 0.6, y + r * 0.9, x + r * 1.6, y + r * 1.7, '#fff6e0', 1.2); k.line(x + r * 1.6, y + r * 1.7, x + r * 2.1, y + r * 1.1, '#fff6e0', 1.2);
        },
        ears: (x, y, r) => { k.ball(x - r * 0.75, y + r * 0.1, r * 0.4, r * 0.55, T, { noSpec: true }); } });
      return r;
    },
    narwhal: function (k, T, c) {
      const L = k.lean, bob = k.f === 1 ? -1 : 0;
      k.tri(5, 16 + bob, 0, 12 + bob, 1, 20 + bob, T.dark);
      k.ell(14 + L * 0.3, 16 + bob, 10, 6.5, function (nx, ny) { return ny > 0.3 ? T.belly : (ny < -0.6 ? T.light : T.base); });
      for (const [dx, dy] of [[-4, -2], [-1, -3], [2, -1], [-6, 0]]) k.ell(14 + dx, 16 + dy + bob, 0.9, 0.7, T.dark);
      k.line(23 + L, 13 + bob, 33 + L + (k.atk ? 1 : 0), 10 + bob, '#fff6e0', 0.9);
      for (let x = 25; x < 33; x += 2) k.px(x + L, 13 - (x - 23) * 0.3 + bob, '#d8c8a0');
      k.ell(14, 21.5 + bob, 3, 1.3, T.dark);
      k.eye(20.5 + L, 14.5 + bob); k.blush(20.5 + L, 17 + bob); k.smile(23 + L, 17.5 + bob);
      return { hx: 20 + L, hy: 14, hr: 5, top: 9, bx: 14, by: 16, handX: 30, handY: 12 };
    },
    griffin: function (k, T, c) {
      const L = k.lean, W = tones(c.b);
      wings(k, 12, 12, 11, 10, c.b, k.f === 1 || k.wind);
      const r = quad(k, T, { bx: 12, by: 18, brx: 7.5, bry: 5, hx: 21, hy: 10, hr: 4.6, legLen: 4.5, legW: 2, noBlush: true, tail: tails.long(k, T),
        snout: (x, y, r) => { k.tri(x + r * 0.6, y - r * 0.2, x + r * 0.6, y + r * 0.6, x + r * 1.7, y + r * 0.5, GOLD); k.px(x + r * 1.2, y + r * 0.15, INK); },
        ears: (x, y, r) => { k.ball(x, y, r * 1.02, r * 0.98, W); k.tri(x - r * 0.9, y - r * 0.5, x - r * 0.3, y - r * 0.9, x - r * 1.4, y - r * 1.6, W.base); } });
      k.eye(r.hx + r.hr * 0.25, r.hy - r.hr * 0.1);
      return r;
    },
    bigturtle: function (k, T, c) {
      const S = tones(c.b), L = k.lean, G = tones(c.a);
      k.leg(6, 21, 5, 3.6, T.dark, -1); k.leg(19, 21, 5, 3.6, T.dark, -1);
      k.ball(27 + L, 17, 4.4, 3.8, T); k.eye(28.5 + L, 16); k.blush(27.5 + L, 18.4); k.smile(30.5 + L, 18.2);
      k.ell(15 + L * 0.3, 16, 12, 9, function (nx, ny) { return ny > 0.6 ? S.dark : ((Math.abs(nx * 3 + ny * 2.2) % 1.2) < 0.2 ? S.dark : (ny < -0.4 ? S.light : S.base)); });
      k.ell(15 + L * 0.3, 24, 11.5, 2, T.belly);
      // A little forest on its back.
      k.rect(14, 3, 1.4, 5, '#7a5a3a'); k.ball(14.5, 3, 4, 3.2, G, { noSpec: true }); k.ball(9, 6.5, 2.8, 2.4, G, { noSpec: true }); k.ball(20, 6, 3, 2.6, G, { noSpec: true });
      k.leg(9, 22, 5, 3.6, T.base, 1); k.leg(22, 22, 5, 3.6, T.base, 1);
      return { hx: 27 + L, hy: 17, hr: 4.4, top: 0, bx: 15, by: 16, handX: 30, handY: 19 };
    },
    kitsune: function (k, T, c) {
      const L = k.lean, F = tones(c.b);
      for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.4; k.ball(9.5 + Math.cos(a + Math.PI) * 3.5, 14 + Math.sin(a + Math.PI) * 6, 2.2, 3.6, i % 2 ? T : F, { noSpec: true }); k.ell(9.5 + Math.cos(a + Math.PI) * 5.5, 14 + Math.sin(a + Math.PI) * 8.5, 1.2, 1.2, c.a); }
      return quad(k, T, { bx: 13, by: 19, brx: 6.5, bry: 4.5, hx: 21.5, hy: 12.5, hr: 4.8, legLen: 4, legW: 1.8, ears: ears.pointy(k, T, F.base),
        snout: (x, y, r) => { k.tri(x + r * 0.2, y, x + r * 0.2, y + r * 0.85, x + r * 1.6, y + r * 0.45, T.light); k.px(x + r * 1.55, y + r * 0.4, INK); k.line(x - r * 0.4, y - r * 0.4, x + r * 0.2, y - r * 0.2, '#e04880', 0.6); } });
    },
    thunderbird: function (k, T, c) {
      const bob = k.f === 1 ? -1.2 : 0, A = tones(c.b);
      wings(k, 14, 13 + bob, 13, 11, c.c, k.f !== 0);
      k.line(5, 9 + bob, 8, 12 + bob, c.a, 0.8); k.line(8, 12 + bob, 6, 14 + bob, c.a, 0.8);
      const r = bird(k, T, { fly: true, brx: 6, bry: 5.5, by: 16 + bob, hx: 20, hy: 10 + bob, hr: 4.4, beakLen: 3.6, beak: GOLD, wing: c.b,
        tail: (x, y) => { k.tri(x + 1, y, x - 5, y + 5, x - 2, y + 6, A.base); },
        head: (x, y, r) => { k.tri(x - r * 0.8, y - r * 0.4, x - r * 0.2, y - r * 0.9, x - r * 1.8, y - r * 1.3, A.base); } });
      return r;
    },
    dragon: function (k, T, c) {
      const L = k.lean, B = tones(c.b);
      wings(k, 12, 10, 11, 9, c.a, k.f === 1 || k.wind);
      const r = quad(k, T, { bx: 12, by: 18, brx: 8, bry: 5.5, hx: 22, hy: 11, hr: 5, legLen: 4, legW: 2.6, noBlush: false,
        tail: (x, y) => { k.line(x + 1, y + 1, x - 4, y + 4, T.base, 2.2); k.tri(x - 4, y + 2, x - 7, y + 6, x - 3, y + 6, T.dark); },
        body: (x, y) => { for (let i = -5; i < 6; i += 2.5) k.tri(x + i - 1, y - 4.5, x + i + 1, y - 4.5, x + i, y - 7, B.base); },
        ears: (x, y, r) => { k.line(x - r * 0.2, y - r * 0.8, x - r * 0.9, y - r * 1.9, B.base, 1); k.line(x - r * 0.7, y - r * 0.6, x - r * 1.6, y - r * 1.4, B.base, 1); },
        snout: (x, y, r) => { k.ell(x + r * 0.85, y + r * 0.35, r * 0.75, r * 0.45, T.light); k.px(x + r * 1.4, y + r * 0.15, INK); if (k.atk) k.tri(x + r * 1.6, y + r * 0.4, x + r * 3.2, y - r * 0.4, x + r * 3.2, y + r * 1.2, '#ffcd4d'); } });
      return r;
    }
  };

  // Gear and form flourishes, drawn over the animal using the anchor it returned.
  function gear(k, a, g, c) {
    if (!g) return;
    const x = a.hx, y = a.hy, r = a.hr, top = a.top;
    const steel = tones('#c9d2e3'), gold = tones(GOLD), acc = tones(c.a);
    const hand = () => { const hx = a.handX, hy = a.handY; return [hx, hy]; };
    switch (g) {
      case 'helmet': case 'hardhat': {
        const T = g === 'hardhat' ? tones('#ffcd4d') : steel;
        k.ell(x, top + r * 0.35, r * 0.95, r * 0.5, function (nx, ny) { return ny > 0.5 ? null : ny < -0.3 ? T.light : T.base; });
        k.rect(x - r * 0.95, top + r * 0.5, r * 1.9, 1, T.dark);
        if (g === 'helmet') k.rect(x - 0.4, top - 1.2, 0.9, 1.6, acc.base);
        break;
      }
      case 'knight': case 'armor': case 'siege': {
        k.ell(x, top + r * 0.35, r * 0.95, r * 0.5, function (nx, ny) { return ny > 0.5 ? null : ny < -0.3 ? steel.light : steel.base; });
        k.tri(x - 0.5, top - 0.5, x + 0.5, top - 0.5, x - 1.5, top - 3.5, acc.base);
        k.rect(a.bx - 3, a.by - 2, 6, 3, steel.base); k.rect(a.bx - 3, a.by - 2, 6, 1, steel.light);
        if (g === 'siege') { k.rect(a.bx - 4, a.by - 5, 3, 3, '#7a5a3a'); k.rect(a.bx + 1, a.by - 5, 3, 3, '#7a5a3a'); }
        break;
      }
      case 'crown': case 'king': case 'master': case 'sovereign': {
        const y0 = top - 1.6;
        k.rect(x - 2.5, y0, 5, 1.6, gold.base);
        k.tri(x - 2.5, y0, x - 1.5, y0, x - 2.5, y0 - 1.8, gold.base); k.tri(x - 0.5, y0, x + 0.5, y0, x, y0 - 2.2, gold.base); k.tri(x + 1.5, y0, x + 2.5, y0, x + 2.5, y0 - 1.8, gold.base);
        k.px(x, y0 + 0.6, '#ff6b8a');
        if (g === 'sovereign' || g === 'master') { k.line(a.bx - 6, a.by - 3, a.bx - 9, a.by + 4, tones('#b13e53').base, 1.6); }
        break;
      }
      case 'scarf': k.rect(x - r * 0.9, y + r * 0.75, r * 1.6, 1.3, acc.base); k.line(x - r * 0.9, y + r * 0.9, x - r * 1.7, y + r * 1.8 + (k.f % 2), acc.dark, 1); break;
      case 'headband': case 'ninja': k.rect(x - r * 0.95, y - r * 0.45, r * 1.9, 1.2, acc.base); k.line(x - r, y - r * 0.4, x - r * 1.8, y - r * 0.1 + (k.f % 2), acc.base, 0.8);
        if (g === 'ninja') k.rect(x + r * 0.2, y + r * 0.35, r * 0.75, r * 0.4, '#2b2b3a');
        break;
      case 'goggles': k.rect(x - r * 0.8, y - r * 0.55, r * 1.7, 1, '#3a3a4a'); k.ell(x + r * 0.4, y - r * 0.3, 1.4, 1.2, '#73eff7'); break;
      case 'cape': case 'count': { const C = tones(g === 'count' ? '#2b1a3a' : c.a); k.tri(a.bx - 1, a.by - 5, a.bx - 9, a.by + 6 + (k.f % 2), a.bx + 1, a.by + 5, C.base); if (g === 'count') k.tri(a.bx, a.by - 5, a.bx - 4, a.by - 7, a.bx + 2, a.by - 6, '#b13e53'); break; }
      case 'sword': case 'katana': case 'lance': case 'staff': case 'axe': case 'drill': case 'bow': case 'cannon': {
        const [hx, hy] = hand();
        const ang = k.atk ? 0.1 : k.wind ? -1.4 : -0.7;
        const len = g === 'lance' ? 10 : g === 'staff' ? 9 : 7;
        const ex = hx + Math.cos(ang) * len, ey = hy + Math.sin(ang) * len;
        if (g === 'bow') { k.line(hx, hy - 4, hx + 2, hy, '#8a5a3a', 0.8); k.line(hx + 2, hy, hx, hy + 4, '#8a5a3a', 0.8); k.line(hx, hy - 4, hx - (k.wind ? 2 : 0), hy + 4 - 4, WHITE, 0.5); break; }
        if (g === 'cannon') { k.rect(hx - 2, hy - 2, 5, 3, '#566c86'); k.rect(hx + 2, hy - 2.5, 2, 4, '#333c57'); break; }
        k.line(hx, hy, ex, ey, g === 'staff' ? '#8a5a3a' : g === 'katana' ? '#e8f0ff' : steel.light, g === 'lance' ? 1.1 : 0.9);
        if (g === 'staff') k.ball(ex, ey, 1.5, 1.5, tones(c.a));
        if (g === 'axe') k.tri(ex - 1, ey - 1, ex + 2, ey - 2, ex + 1.5, ey + 2, steel.base);
        if (g === 'sword' || g === 'katana') k.rect(hx - 0.5, hy - 0.5, 1.4, 1.4, gold.base);
        break;
      }
      case 'wizard': case 'archmage': case 'nightcap': {
        const C = tones(g === 'nightcap' ? '#a884f3' : c.a);
        k.tri(x - r * 1.1, top + r * 0.5, x + r * 0.9, top + r * 0.5, x - r * 0.6, top - r * 1.4, C.base);
        k.rect(x - r * 1.1, top + r * 0.3, r * 2, 1.2, C.dark);
        k.px(x - r * 0.3, top - r * 0.2, GOLD);
        if (g === 'nightcap') k.ell(x - r * 0.7, top - r * 1.4, 1, 1, WHITE);
        if (g === 'archmage') { const [hx, hy] = hand(); k.line(hx, hy + 3, hx + 1, hy - 7, '#8a5a3a', 0.9); k.ball(hx + 1, hy - 8, 1.8, 1.8, tones('#73eff7')); }
        break;
      }
      case 'shogun': case 'samurai': k.tri(x - r * 0.8, top + r * 0.3, x + r * 0.8, top + r * 0.3, x, top - r * 0.4, '#3a3a4a'); k.tri(x - 0.4, top, x + 0.6, top, x + 1.6, top - 2.5, GOLD); k.tri(x - 0.6, top, x + 0.4, top, x - 1.6, top - 2.5, GOLD);
        { const [hx, hy] = hand(); k.line(hx, hy, hx + (k.atk ? 8 : 3), hy - (k.atk ? 1 : 7), '#e8f0ff', 0.9); }
        break;
      case 'pirate': case 'admiral': k.tri(x - r * 1.1, top + r * 0.4, x + r * 1.1, top + r * 0.4, x, top - r * 0.6, '#2b2b3a'); k.px(x, top, WHITE); if (g === 'admiral') k.rect(x - r, top + r * 0.3, r * 2, 0.8, GOLD); break;
      case 'bell': k.ball(x - r * 0.1, y + r * 1.15, 1.4, 1.4, gold); k.rect(x - r * 0.8, y + r * 0.8, r * 1.4, 0.8, '#e04848'); break;
      case 'mask': k.rect(x - r * 0.2, y + r * 0.2, r * 1.2, r * 0.55, '#a0a8b8'); k.px(x + r * 0.5, y + r * 0.45, '#566c86'); break;
      case 'charm': k.line(x - r * 0.8, y + r * 0.8, x + r * 0.5, y + r * 0.9, '#b13e53', 0.7); k.ell(x, y + r * 1.2, 1, 1, GOLD); break;
      case 'gloves': { const [hx, hy] = hand(); k.ball(hx, hy, 2.2, 2, tones('#e04848')); break; }
      case 'belt': k.rect(a.bx - 4, a.by + 1, 8, 1.4, GOLD); k.ball(a.bx, a.by + 1.6, 1.6, 1.4, tones('#ffcd4d')); { const [hx, hy] = hand(); k.ball(hx, hy, 2.2, 2, tones('#e04848')); } break;
      case 'howdah': k.rect(a.bx - 5, a.by - 9.5, 9, 3, '#b13e53'); k.rect(a.bx - 5, a.by - 10, 9, 1, GOLD); k.tri(a.bx - 6, a.by - 9.5, a.bx + 5, a.by - 9.5, a.bx - 0.5, a.by - 14, '#ef7d57'); break;
      case 'vines': case 'forest': case 'ancient': for (let i = 0; i < 4; i++) k.ball(a.bx - 5 + i * 3.5, a.by - 5 - (i % 2), 1.6, 1.4, tones('#38b764'), { noSpec: true }); if (g === 'ancient') k.ell(x - r, top + 1, 1.3, 1.3, '#ffa8c5'); break;
      case 'spikes': for (let i = 0; i < 4; i++) k.tri(a.bx - 6 + i * 3.5, a.by - 5, a.bx - 4.4 + i * 3.5, a.by - 5, a.bx - 5.2 + i * 3.5, a.by - 8.5, '#e8f0ff'); break;
      default: break;
    }
  }

  // Third forms: a soft rarity aura of sparkles.
  function aura(P, col) {
    const w = P.w, h = P.h;
    const pts = [[0.1, 0.15], [0.9, 0.2], [0.05, 0.6], [0.95, 0.55], [0.5, 0.05]];
    for (const [fx, fy] of pts) { const x = Math.round(fx * (w - 3)) + 1, y = Math.round(fy * (h - 3)) + 1; if (!P.get(x, y)) { P.set(x, y, '#ffffff'); P.set(x + 1, y, col); P.set(x, y + 1, col); } }
  }

  function heroCanvas(def, form, frame) {
    const s = def.look.s;
    const u = s / 24;
    const P = new Painter(Math.ceil(34 * u), Math.ceil(28 * u));
    const k = new Kit(P, u, frame);
    const look = def.look;
    const main = look.c;
    const T = tones(main);
    const fn = HERO_ART[look.sp] || HERO_ART.hamster;
    const anchor = fn(k, T, look) || { hx: 20, hy: 12, hr: 5, top: 7, bx: 14, by: 18, handX: 24, handY: 18 };
    gear(k, anchor, look.g[form], look);
    if (form >= 1) gear(k, anchor, extraGear(look.g[form]), look);
    P.outline();
    if (form === 2) aura(P, ['#c3cfdb', '#73eff7', '#c9b3ff', '#ffe066', '#ff9fd8'][def.rarity]);
    return P.canvas();
  }
  function extraGear(g) { return { knight: 'sword', ninja: null, shogun: null, master: 'staff' }[g] || null; }

  // ---------------------------------------------------------------------------
  // Gloom enemies (drawn facing right, mirrored at draw time)
  // ---------------------------------------------------------------------------
  const GLOW = '#ffe066';
  function angryFace(k, x, y, o) {
    o = o || {};
    k.eye(x, y, { angry: true, glow: o.glow || GLOW });
    if (o.two) k.eye(x - (o.gap || 3.5), y, { angry: true, glow: o.glow || GLOW });
    const mx = x + (o.mouthX || 0.5), my = y + (o.mouthY || 3);
    if (o.mouth !== false) {
      if (k.atk) { k.rect(mx - 1.5, my - 0.5, 3, 2, INK); k.px(mx - 1, my - 0.5, WHITE); k.px(mx + 0.8, my - 0.5, WHITE); }
      else { k.line(mx - 1.5, my + 0.5, mx + 1.5, my, INK); k.px(mx - 0.5, my + 0.5, WHITE); }
    }
  }

  const ENEMY_ART = {
    blob: function (k, T, c) {
      const sq = k.f === 1 ? 1 : 0, L = k.lean;
      k.ell(15 + L * 0.5, 22 + sq * 0.5, 8 + sq, 5.5 - sq * 0.5, function (nx, ny) { const l = -(nx * 0.5 + ny * 0.85); return ny > 0.6 ? T.dark : l > 0.4 ? T.light : l < -0.4 ? T.dark : T.base; });
      k.ell(15 + L * 0.5, 17 + sq, 5.5, 4.5, function (nx, ny) { const l = -(nx * 0.5 + ny * 0.85); return l > 0.4 ? T.light : T.base; });
      k.px(12, 15, T.spec); k.ell(9, 25.5, 2, 1, T.dark);
      angryFace(k, 19 + L, 18 + sq, { two: true, gap: 4, mouthY: 3.5, mouthX: -1.5 });
      return { top: 12 };
    },
    worm: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 5; i++) { const x = 6 + i * 3.6, y = 22 - Math.abs(Math.sin((i + k.f) * 1.3)) * 2; k.ball(x, y, 3.2, 3.2, i % 2 ? T : tones(mix(c.c, '#ffffff', 0.12)), { noSpec: true }); }
      k.ball(23 + L, 18, 4.4, 4.4, T);
      angryFace(k, 25 + L, 17, { mouthY: 3 });
      k.line(22 + L, 13.5, 21 + L, 11, T.dark); k.ell(21 + L, 10.5, 0.8, 0.8, T.light);
      return { top: 10 };
    },
    imp: function (k, T, c) {
      const L = k.lean;
      k.leg(12, 21, 4, 2.2, T.dark, -1);
      k.line(9, 20, 5, 22, T.dark, 0.8); k.tri(4, 21, 6, 23, 4, 24, T.dark);
      k.ball(14 + L * 0.3, 18, 5, 5, T);
      k.leg(15, 21.5, 4, 2.2, T.base, 1);
      k.ball(16 + L, 11, 5.2, 4.8, T);
      k.tri(12 + L, 8, 14 + L, 7, 11 + L, 3.5, '#f4f4f4'); k.tri(17 + L, 7, 19 + L, 7.5, 19.5 + L, 3, '#f4f4f4');
      angryFace(k, 19 + L, 10.5, { mouthY: 3, mouthX: 0 });
      // Club.
      const cx = 20 + L + (k.atk ? 4 : 0), cy = k.wind ? 6 : k.atk ? 16 : 13;
      k.line(18 + L, 18, cx, cy, '#8a5a3a', 1.1); k.ball(cx + (k.atk ? 1 : 0), cy - (k.atk ? 0 : 1.5), 2.4, 2.4, tones('#a0704a'), { noSpec: true });
      return { top: 4 };
    },
    batling: function (k, T, c) {
      const bob = k.f === 1 ? -2 : 0, L = k.lean;
      wings(k, 14, 15 + bob, 10, 7, c.c, k.f === 1);
      k.ball(15 + L * 0.3, 17 + bob, 4.5, 4.2, T);
      k.tri(13 + L, 13.5 + bob, 15 + L, 13 + bob, 13.5 + L, 10 + bob, T.base); k.tri(16 + L, 13 + bob, 18 + L, 13.5 + bob, 17.5 + L, 10 + bob, T.base);
      angryFace(k, 18 + L, 16.5 + bob, { mouthY: 2.5, mouthX: -0.5 });
      return { top: 10 };
    },
    ogre: function (k, T, c) {
      const L = k.lean;
      k.leg(10, 21, 5, 3.4, T.dark, -1);
      k.ball(14 + L * 0.3, 15, 9.5, 8.5, T);
      k.ell(15 + L * 0.3, 19, 6, 4, T.belly);
      k.leg(15, 21.5, 5, 3.4, T.base, 1);
      k.ball(19 + L, 9.5, 4.6, 4.2, T);
      angryFace(k, 21 + L, 9, { mouthY: 3, mouthX: 0 });
      k.tri(20 + L, 12.5, 21 + L, 12.5, 20.5 + L, 14.5, WHITE);
      const ax = 24 + L + (k.atk ? 3 : 0), ay = k.wind ? 6 : 16;
      k.line(20 + L, 12, ax, ay, T.base, 2.6); k.ball(ax, ay + 1, 2.8, 2.8, T);
      return { top: 4 };
    },
    king: function (k, T, c) {
      const L = k.lean, R = tones('#b13e53');
      k.tri(4, 8, 14, 9, 8, 27, R.base);
      ENEMY_ART.blob(k, T, c);
      k.rect(11 + L * 0.5, 9, 9, 2.6, GOLD); k.tri(11 + L * 0.5, 9, 13 + L * 0.5, 9, 11 + L * 0.5, 5.5, GOLD); k.tri(14.5 + L * 0.5, 9, 16.5 + L * 0.5, 9, 15.5 + L * 0.5, 4.5, GOLD); k.tri(18 + L * 0.5, 9, 20 + L * 0.5, 9, 20 + L * 0.5, 5.5, GOLD);
      k.px(15.5 + L * 0.5, 10, '#73eff7');
      const sx = 23 + (k.atk ? 3 : 0), sy = k.wind ? 8 : 14;
      k.line(21, 22, sx, sy, '#8a6a3a', 1); k.ball(sx, sy, 1.8, 1.8, tones('#a884f3'));
      return { top: 4 };
    },
    beetle: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 3; i++) k.line(10 + i * 4 + k.step * (i % 2 ? 0.6 : -0.6), 21, 9 + i * 4, 26, '#3a3f58', 0.8);
      k.ell(14 + L * 0.3, 18, 8, 5.5, function (nx, ny) { const l = -(nx * 0.5 + ny * 0.85); return ny > 0.5 ? T.dark : l > 0.55 ? '#ffffff' : l > 0.2 ? T.light : l < -0.4 ? T.dark : T.base; });
      k.line(14 + L * 0.3, 12.8, 14 + L * 0.3, 22, T.dark);
      k.ball(22 + L, 18.5, 3.4, 3, tones('#566c86'));
      k.line(24 + L, 16, 27 + L, 13, '#566c86', 0.8);
      angryFace(k, 23.5 + L, 18, { mouth: false, glow: '#73eff7' });
      return { top: 12 };
    },
    scorpion: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 3; i++) k.line(10 + i * 3.4 + k.step * (i % 2 ? 0.6 : -0.6), 21, 9 + i * 3.4, 26, T.dark, 0.8);
      k.ball(14 + L * 0.3, 20, 7, 3.6, T);
      // Tail arcs over the back; strikes forward.
      const tx = k.atk ? 22 : 14, ty = k.atk ? 12 : 8;
      k.line(8, 19, 5, 13, T.base, 1.6); k.line(5, 13, 8, 8, T.base, 1.6); k.line(8, 8, tx, ty, T.base, 1.4); k.tri(tx, ty - 1, tx + 2.5, ty + 1, tx, ty + 1.5, '#ffcd75');
      k.ball(22 + L, 19, 2.4, 2, T); k.line(24 + L, 18, 27 + L, 16, T.dark, 1); k.line(24 + L, 20, 27 + L, 21, T.dark, 1);
      angryFace(k, 20 + L, 17.5, { mouth: false, two: true, gap: 2 });
      return { top: 7 };
    },
    sandworm: function (k, T, c) {
      const L = k.lean;
      k.ell(14, 26, 14, 2.5, tones('#c09a5a').dark);
      for (let i = 0; i < 6; i++) { const y = 24 - i * 3, x = 12 + Math.sin(i * 0.6 + k.f * 0.4) * 2 + i * 0.6; k.ball(x, y, 6 - i * 0.2, 2.6, i % 2 ? T : tones(mix(c.c, '#5a3a2a', 0.2)), { noSpec: true }); }
      const open = k.atk ? 3 : k.wind ? 2 : 1;
      k.ball(17 + L, 5, 6, 4.5, T);
      k.ell(21 + L, 5 + open * 0.3, 3, open, '#3a1a2a');
      for (let i = 0; i < 4; i++) { k.tri(19 + L + i * 1.3, 5 - open * 0.7, 20 + L + i * 1.3, 5 - open * 0.7, 19.5 + L + i * 1.3, 6.5 - open * 0.4, WHITE); }
      angryFace(k, 16 + L, 3, { mouth: false, glow: '#ff6b5a' });
      return { top: 0 };
    },
    ghost: function (k, T, c) {
      const bob = k.f === 1 ? -1.5 : 0, L = k.lean;
      k.ell(15 + L * 0.4, 14 + bob, 7, 7.5, function (nx, ny) { return ny < -0.3 && nx < 0 ? T.light : T.base; });
      for (let i = 0; i < 4; i++) k.tri(8.5 + i * 3.4, 18 + bob, 11.9 + i * 3.4, 18 + bob, 10 + i * 3.4 + (k.f % 2), 24 + bob, T.base);
      angryFace(k, 19 + L, 13 + bob, { two: true, gap: 4, mouthY: 4, mouthX: -2, glow: '#ff6bd0' });
      return { top: 6 };
    },
    wisp: function (k, T, c) {
      const bob = k.f === 1 ? -2 : 0;
      for (let i = 0; i < 4; i++) k.tri(10 + i * 2.5, 15 + bob, 13 + i * 2.5, 15 + bob, 8 + i * 2 - (k.f % 2), 3 + i * 1.5 + bob, i % 2 ? T.light : T.base);
      k.ball(15, 17 + bob, 5, 5, T);
      k.ell(15, 18 + bob, 2.5, 2.5, '#ffffff');
      angryFace(k, 17.5, 16.5 + bob, { mouth: false, glow: '#1a1c2c' });
      return { top: 3 };
    },
    yeti: function (k, T, c) {
      const L = k.lean;
      k.leg(10, 21, 5, 3.6, T.dark, -1);
      k.ball(14 + L * 0.3, 15, 9, 8.5, T);
      for (let i = 0; i < 5; i++) k.tri(7 + i * 3.6, 22, 9 + i * 3.6, 22, 8 + i * 3.6, 24.5, T.base);
      k.leg(16, 21.5, 5, 3.6, T.base, 1);
      k.ball(19 + L, 9, 5, 4.5, T);
      k.ell(21 + L, 10, 3, 2.6, tones('#6a7aa0').base);
      angryFace(k, 22 + L, 9, { mouthY: 2.5, mouthX: 0, glow: '#73eff7' });
      const ax = 25 + L + (k.atk ? 3 : 0), ay = k.wind ? 5 : 15;
      k.line(20 + L, 13, ax, ay, T.base, 2.8); k.ball(ax, ay + 1, 3, 3, T);
      return { top: 4 };
    },
    yetiboss: function (k, T, c) {
      const r = ENEMY_ART.yeti(k, T, c);
      k.tri(15, 3.5, 17, 4.5, 16, 0, '#73eff7'); k.tri(19, 3.5, 21, 4.5, 21, 0, '#73eff7'); k.tri(23, 4.5, 24.5, 6, 25.5, 2, '#73eff7');
      return r;
    },
    shroom: function (k, T, c) {
      const L = k.lean, S = tones('#e8dcc0');
      k.leg(12, 22, 4, 2, S.dark, -1); k.leg(16, 22, 4, 2, S.dark, 1);
      k.ball(14.5 + L * 0.3, 19, 4.5, 4.5, S);
      k.ell(14.5 + L * 0.6, 12, 8.5, 5.5, function (nx, ny) { return ny > 0.45 ? null : ny < -0.4 ? T.light : T.base; });
      for (const [dx, dy] of [[-4, -2], [1, -3.5], [4, -1], [-1, 0]]) k.ell(14.5 + dx + L * 0.6, 12 + dy, 1.2, 1, '#fff0f0');
      angryFace(k, 17.5 + L, 18.5, { mouthY: 2.5, mouthX: -0.5 });
      if (k.atk) for (let i = 0; i < 4; i++) k.px(23 + i * 1.4, 10 + (i % 2) * 2, '#a7f070');
      return { top: 6 };
    },
    sludge: function (k, T, c) {
      const L = k.lean, sq = k.f === 1 ? 1 : 0;
      k.ell(14 + L * 0.4, 20 + sq * 0.5, 11 + sq, 7 - sq * 0.5, function (nx, ny) { const l = -(nx * 0.5 + ny * 0.85); return ny > 0.6 ? T.dark : l > 0.45 ? T.light : l < -0.3 ? T.dark : T.base; });
      for (const [dx, dy, r] of [[-5, -3, 1.4], [2, -5, 1], [6, -1, 1.2]]) k.ell(14 + dx, 20 + dy, r, r, '#c8f070');
      k.line(4, 15, 3, 11, T.base, 1.2); k.ell(3, 10.5, 1.4, 1.4, T.light);
      angryFace(k, 19 + L, 18 + sq, { two: true, gap: 5, mouthY: 4, mouthX: -2.5 });
      return { top: 10 };
    },
    toad: function (k, T, c) {
      const L = k.lean;
      k.ell(8, 25, 4, 2, T.dark);
      k.ball(14 + L * 0.3, 18, 10, 7.5, T, { belly: true });
      for (const [dx, dy] of [[-6, -3], [-2, -6], [3, -4]]) k.ell(14 + dx, 18 + dy, 1.3, 1, T.dark);
      k.ell(21, 25.5, 3.4, 1.6, T.dark);
      k.ball(18 + L, 10.5, 3, 2.8, T); k.ball(23 + L, 11, 3, 2.8, T);
      angryFace(k, 18.5 + L, 10.5, { mouth: false, glow: '#ffcd4d' }); angryFace(k, 23.5 + L, 11, { mouth: false, glow: '#ffcd4d' });
      k.line(18 + L, 17, 25 + L, 16, INK, 0.8);
      if (k.atk) k.ball(28 + L, 15, 2, 2, tones('#a7f070'));
      k.rect(11, 6, 1, 1, GOLD);
      return { top: 7 };
    },
    hag: function (k, T, c) {
      const L = k.lean, R = tones('#3a2a4a');
      k.tri(9, 8, 22, 8, 15, 27, R.base); k.tri(10, 8, 15, 8, 9, 26, R.dark);
      k.ball(16 + L, 9, 4.6, 4.2, T);
      k.tri(12 + L, 6, 21 + L, 6, 13 + L, -0.5, '#2a1a3a'); k.rect(10 + L, 5.5, 13, 1.2, '#2a1a3a');
      k.tri(19.5 + L, 9, 19.5 + L, 11, 23 + L, 11, T.dark);
      angryFace(k, 18 + L, 8.5, { mouthY: 3, mouthX: -1, glow: '#a7f070' });
      // Cauldron.
      k.ball(24, 22, 4.5, 3.8, tones('#3a3f58')); k.ell(24, 19, 4, 1, '#a7f070');
      if (k.atk) for (let i = 0; i < 3; i++) k.ell(23 + i * 1.5, 16 - i, 0.9, 0.9, '#c8f070');
      const sx = 21 + (k.atk ? 2 : 0);
      k.line(sx, 13, sx + 3, k.wind ? 10 : 19, '#8a6a3a', 0.9);
      return { top: 0 };
    },
    skeleton: function (k, T, c) {
      const L = k.lean, B = tones(c.c);
      k.line(13 + k.step * 0.6, 19, 12 + k.step * 0.6, 26, B.base, 0.9); k.line(16 - k.step * 0.6, 19, 17 - k.step * 0.6, 26, B.base, 0.9);
      k.rect(12 + L * 0.3, 18, 5, 1.6, B.dark);
      k.line(14.5 + L * 0.5, 18, 15 + L * 0.7, 12, B.base, 0.9);
      for (let i = 0; i < 3; i++) k.line(12.5 + L * 0.6, 13.5 + i * 1.5, 17 + L * 0.6, 13.5 + i * 1.5, B.base, 0.6);
      k.ball(16 + L, 8.5, 4.4, 4, B);
      k.rect(16 + L, 11, 3.5, 1.6, B.base); for (let i = 0; i < 3; i++) k.px(16.5 + i + L, 11.5, INK);
      angryFace(k, 18.5 + L, 8, { mouth: false, glow: '#ff7a3a' });
      k.ell(15.5 + L, 3.5, 1.4, 1.4, '#ff7a3a'); k.px(15.5 + L, 2, '#ffcd4d');
      const sx = 19 + L + (k.atk ? 4 : 0), sy = k.wind ? 7 : 13;
      k.line(17 + L, 14, sx, sy, B.base, 0.8); k.line(sx, sy, sx + 5, sy - (k.atk ? 0 : 3), '#c9d2e3', 0.8);
      return { top: 2 };
    },
    ghoul: function (k, T, c) {
      const L = k.lean, rags = tones('#5a4a5a');
      k.leg(12, 21, 5, 2, T.dark, -1); k.leg(15.5, 21, 5, 2, T.base, 1);
      k.ball(14 + L * 0.4, 16, 5, 6, rags);
      k.ball(17.5 + L, 9, 4.2, 4, T);
      angryFace(k, 19.5 + L, 8.5, { mouthY: 3, mouthX: -0.5, glow: '#ff5a5a' });
      k.line(18 + L, 15, 24 + L + (k.atk ? 2 : 0), 14, T.base, 1.2); k.line(18 + L, 17, 23 + L, 17.5, T.dark, 1.2);
      return { top: 5 };
    },
    magma: function (k, T, c) {
      const L = k.lean, roll = k.f;
      k.ball(15 + L * 0.3, 18, 8, 7.5, tones('#5a3a3a'));
      for (let i = 0; i < 6; i++) { const a = i + roll * 0.7; k.line(15 + Math.cos(a) * 2, 18 + Math.sin(a) * 2, 15 + Math.cos(a) * 7, 18 + Math.sin(a) * 6.5, i % 2 ? '#ffcd4d' : '#ef7d57', 0.8); }
      k.ell(15, 18, 2.4, 2.4, '#ffcd4d');
      angryFace(k, 19 + L, 15.5, { two: true, gap: 3.5, mouthY: 3.5, mouthX: -1.5, glow: '#fff0b0' });
      k.tri(12, 11, 14, 11, 13, 7, '#ef7d57'); k.tri(16, 10.5, 18, 10.5, 17.5, 6, '#ffcd4d');
      return { top: 6 };
    },
    lich: function (k, T, c) {
      const L = k.lean, R = tones('#2a1a3a'), B = tones('#e8dcc0');
      k.tri(7, 9, 23, 9, 15, 27, R.base); k.tri(8, 10, 13, 9, 7, 27, R.dark);
      for (let i = 0; i < 4; i++) k.tri(8 + i * 4, 25, 12 + i * 4, 25, 10 + i * 4 + (k.f % 2), 28, R.base);
      k.ball(16 + L, 7, 4.6, 4.4, B);
      k.tri(11 + L, 5, 21 + L, 5, 16 + L, -1, R.base);
      angryFace(k, 18 + L, 7, { two: true, gap: 3.5, mouth: false, glow: '#ff7a3a' });
      k.rect(15.5 + L, 9.5, 4, 1.4, B.dark);
      const sx = 23 + (k.atk ? 2 : 0);
      k.line(sx, 26, sx + 1, k.wind ? 3 : 6, '#8a6a3a', 1); k.ball(sx + 1, k.wind ? 2 : 5, 2.2, 2.2, tones('#ff7a3a'));
      return { top: 0 };
    },
    golem: function (k, T, c) {
      const L = k.lean;
      k.rect(9 + k.step * 0.5, 20, 4, 7, T.dark); k.rect(16 - k.step * 0.5, 20, 4, 7, T.base);
      k.rect(7 + L * 0.3, 9, 15, 12, T.base); k.rect(7 + L * 0.3, 9, 15, 2, T.light); k.rect(20 + L * 0.3, 9, 2, 12, T.dark);
      for (const [x, y] of [[9, 13], [18, 16], [11, 18]]) k.rect(x + L * 0.3, y, 1, 1, T.dark);
      k.rect(13 + L, 4, 7, 6, T.base); k.rect(13 + L, 4, 7, 1, T.light);
      angryFace(k, 18 + L, 6.5, { mouth: false, glow: '#ff5a5a' });
      const ax = 22 + L + (k.atk ? 3 : 0), ay = k.wind ? 6 : 14;
      k.rect(ax, ay, 4, 6, T.base); k.rect(ax, ay, 4, 1, T.light);
      return { top: 4 };
    },
    drone: function (k, T, c) {
      const bob = k.f === 1 ? -1.5 : 0, L = k.lean;
      k.line(8, 9 + bob, 22, 9 + bob, '#3a3f58', 0.8);
      k.rect(k.f % 2 ? 6 : 9, 8 + bob, 4, 1, '#c9d2e3'); k.rect(k.f % 2 ? 19 : 17, 8 + bob, 4, 1, '#c9d2e3');
      k.ball(15 + L * 0.3, 15 + bob, 6, 4.6, T);
      k.rect(9 + L * 0.3, 15 + bob, 12, 1, T.dark);
      k.ball(19 + L, 15.5 + bob, 2.2, 2.2, tones('#3a3f58'));
      angryFace(k, 19.5 + L, 15.5 + bob, { mouth: false, glow: '#ff5a5a' });
      k.line(15, 19.5 + bob, 15 + (k.atk ? 5 : 2), 23 + bob, '#3a3f58', 0.8);
      if (k.atk) k.ell(21, 23.5 + bob, 1.4, 1.4, '#73eff7');
      return { top: 7 };
    },
    mecha: function (k, T, c) {
      const L = k.lean;
      k.rect(8 + k.step * 0.4, 19, 5, 8, T.dark); k.rect(17 - k.step * 0.4, 19, 5, 8, T.base); k.rect(7, 25.5, 7, 1.6, '#3a3f58'); k.rect(16, 25.5, 7, 1.6, '#3a3f58');
      k.rect(6 + L * 0.3, 8, 18, 12, T.base); k.rect(6 + L * 0.3, 8, 18, 2, T.light); k.rect(22 + L * 0.3, 8, 2, 12, T.dark);
      k.ell(15 + L * 0.3, 14, 3, 3, '#ff5a5a'); k.ell(15 + L * 0.3, 14, 1.4, 1.4, '#fff0b0');
      k.rect(11 + L, 2, 10, 6.5, T.base); k.rect(11 + L, 2, 10, 1, T.light);
      angryFace(k, 18.5 + L, 5, { two: true, gap: 4, mouth: false, glow: '#ff5a5a' });
      k.line(13 + L, 2, 12 + L, -1, '#3a3f58', 0.6); k.ell(12 + L, -1, 0.8, 0.8, '#ff5a5a');
      const ax = 24 + L + (k.atk ? 3 : 0), ay = k.wind ? 6 : 12;
      k.rect(ax, ay, 6, 4, '#3a3f58'); k.rect(ax + 5, ay - 0.5, 3, 5, '#566c86');
      return { top: 0 };
    },
    harpy: function (k, T, c) {
      const bob = k.f === 1 ? -2 : 0, L = k.lean;
      wings(k, 13, 13 + bob, 11, 9, c.c, k.f === 1);
      k.ball(15 + L * 0.3, 16 + bob, 4.5, 5.5, T);
      k.ball(17 + L, 9 + bob, 3.8, 3.6, tones('#d8a0c0'));
      k.line(14 + L, 6 + bob, 11 + L, 10 + bob, '#3a2a4a', 1.4);
      angryFace(k, 19 + L, 8.5 + bob, { mouthY: 2.5, mouthX: -0.5 });
      k.line(14, 21 + bob, 14 + (k.atk ? 4 : 0), 25 + bob, BEAK, 0.8); k.line(17, 21 + bob, 17 + (k.atk ? 4 : 0), 25 + bob, BEAK, 0.8);
      return { top: 4 };
    },
    cloud: function (k, T, c) {
      const bob = k.f === 1 ? -1 : 0;
      for (const [dx, dy, r] of [[-6, 1, 4.5], [-1, -2, 5.5], [5, 0, 4.8], [0, 3, 5]]) k.ball(15 + dx, 13 + dy + bob, r, r * 0.85, T, { noSpec: true });
      angryFace(k, 19, 13 + bob, { two: true, gap: 5, mouthY: 3.5, mouthX: -2.5, glow: '#ffe066' });
      if (k.atk || k.wind) { k.line(12, 19 + bob, 10, 23 + bob, '#ffe066', 0.8); k.line(10, 23 + bob, 13, 23 + bob, '#ffe066', 0.8); k.line(13, 23 + bob, 11, 27 + bob, '#ffe066', 0.8); }
      for (let i = 0; i < 3; i++) k.line(9 + i * 5, 20 + bob + (k.f % 2), 8.5 + i * 5, 22 + bob + (k.f % 2), '#73a0f0', 0.6);
      return { top: 6 };
    },
    queen: function (k, T, c) {
      const r = ENEMY_ART.harpy(k, T, c);
      const bob = k.f === 1 ? -2 : 0;
      k.rect(15, 4 + bob, 5, 1.4, GOLD); k.tri(15, 4 + bob, 16, 4 + bob, 15, 1.5 + bob, GOLD); k.tri(17, 4 + bob, 18, 4 + bob, 17.5 + 0.2, 1 + bob, GOLD); k.tri(19, 4 + bob, 20, 4 + bob, 20, 1.5 + bob, GOLD);
      k.line(22, 2 + bob, 20, 6 + bob, '#ffe066', 0.7);
      return r;
    },
    alien: function (k, T, c) {
      const L = k.lean, S = tones('#c9d2e3');
      k.leg(12, 21, 5, 1.8, T.dark, -1); k.leg(15.5, 21, 5, 1.8, T.base, 1);
      k.ball(14 + L * 0.3, 17, 4, 4.8, S);
      k.ball(16 + L, 9.5, 5.5, 5, T);
      k.ell(16 + L, 6.5, 6, 3, function (nx, ny) { return ny < 0 ? 'rgba(0,0,0,0)' : null; });
      k.line(15 + L, 4.5, 14 + L, 1.5, T.dark, 0.6); k.ell(14 + L, 1, 0.9, 0.9, '#ff6bd0');
      angryFace(k, 19 + L, 9.5, { two: true, gap: 4, mouthY: 3, mouthX: -1.5, glow: INK });
      const gx = 20 + L + (k.atk ? 2 : 0);
      k.rect(gx, 15, 4, 2, '#566c86'); k.rect(gx + 3, 14.5, 1, 3, '#ff6bd0');
      return { top: 1 };
    },
    squid: function (k, T, c) {
      const L = k.lean;
      for (let i = 0; i < 5; i++) { const x = 9 + i * 2.6, w = Math.sin((k.f + i) * 1.4); k.line(x, 18, x + w, 25, T.dark, 1.2); }
      k.ell(14 + L * 0.3, 12, 7, 8, function (nx, ny) { return ny < -0.4 ? T.light : T.base; });
      k.tri(8, 7, 20, 7, 14, -0.5, T.base);
      angryFace(k, 18 + L, 13, { two: true, gap: 4, mouthY: 3, mouthX: -2, glow: '#ffe066' });
      for (const [x, y] of [[10, 9], [17, 6]]) k.px(x, y, '#ffe066');
      return { top: 0 };
    },
    eye: function (k, T, c) {
      const bob = k.f === 1 ? -1.5 : 0, L = k.lean;
      for (let i = 0; i < 4; i++) k.line(10 + i * 2.5, 20 + bob, 9 + i * 2.5 + (k.f % 2), 26 + bob, T.base, 0.8);
      k.ball(15 + L * 0.3, 14 + bob, 7.5, 7.5, T);
      k.ell(16.5 + L, 14 + bob, 4.5, 4.5, '#fff0f0');
      k.ell(18 + L + (k.atk ? 1 : 0), 14 + bob, 2.2, 2.6, '#ff3a6a'); k.ell(18.4 + L + (k.atk ? 1 : 0), 14 + bob, 0.9, 1.4, INK);
      k.line(10 + L, 8.5 + bob, 19 + L, 9.5 + bob, INK, 0.7);
      return { top: 6 };
    },
    emperor: function (k, T, c) {
      const L = k.lean, R = tones('#5d275d');
      k.tri(5, 8, 25, 8, 15, 28, R.base); k.tri(6, 9, 12, 8, 5, 28, R.dark);
      k.ball(16 + L, 9, 6, 5.5, T);
      for (let i = 0; i < 5; i++) k.tri(11 + i * 2.4 + L, 4.5, 12.6 + i * 2.4 + L, 4.5, 11.8 + i * 2.4 + L, 0.5 - (i % 2) * 1.2, '#ff6bd0');
      angryFace(k, 19 + L, 9, { two: true, gap: 4.5, mouthY: 3.5, mouthX: -2, glow: '#ff6bd0' });
      for (const [x, y] of [[8, 14], [22, 17], [12, 22], [19, 24]]) { k.px(x, y, '#ffffff'); k.px(x + 1, y, '#a884f3'); }
      const ox = 24 + (k.atk ? 3 : 0), oy = k.wind ? 6 : 14;
      k.ball(ox, oy, 2.8, 2.8, tones('#ff6bd0'));
      return { top: 0 };
    }
  };

  function enemyCanvas(def, frame) {
    const s = def.look.s;
    const u = s / 24;
    const P = new Painter(Math.ceil(34 * u), Math.ceil(28 * u));
    const k = new Kit(P, u, frame);
    const T = tones(def.look.c);
    (ENEMY_ART[def.look.sp] || ENEMY_ART.blob)(k, T, def.look);
    P.outline('#0a0614');
    return mirror(P.canvas());
  }

  function mirror(c) {
    if (!c) return c;
    const m = makeCanvas(c.width, c.height), g = m.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return m;
  }

  // ---------------------------------------------------------------------------
  // Bases
  // ---------------------------------------------------------------------------
  // The Burrow: a tree-stump fortress with a round door and a flag. dmg 0..1 adds cracks.
  function burrowCanvas(dmg) {
    const P = new Painter(54, 72);
    const bark = tones('#9a6a4a'), wood = tones('#e8c08a'), leaf = tones('#38b764');
    // Trunk.
    P.rect(9, 26, 36, 46, bark.base);
    for (let x = 12; x < 44; x += 4) P.rect(x, 27, 1, 44, bark.dark);
    P.rect(9, 26, 3, 46, bark.dark); P.rect(42, 26, 3, 46, bark.light);
    // Canopy over the top of the trunk.
    P.ball(27, 20, 23, 14, leaf);
    P.ball(12, 27, 10, 7, leaf); P.ball(42, 27, 10, 7, leaf);
    for (const [x, y] of [[14, 14], [33, 11], [44, 22], [22, 26], [8, 24]]) { P.set(x, y, '#a7f070'); P.set(x + 1, y, '#a7f070'); }
    for (const [x, y] of [[20, 16], [36, 22], [30, 30]]) P.ell(x, y, 1.4, 1.4, '#ff6b8a');
    // Roots.
    P.tri(4, 72, 12, 62, 14, 72, bark.dark); P.tri(40, 72, 43, 62, 51, 72, bark.dark);
    // Door and windows.
    P.ell(27, 62, 7, 9, wood.base); P.rect(20, 62, 14, 10, wood.base); P.ell(27, 62, 5, 7, wood.dark); P.rect(22, 62, 10, 10, wood.dark);
    P.line(27, 55, 27, 71, wood.base); P.set(30, 65, '#ffcd4d');
    P.ell(16, 48, 3, 3, '#ffe9a0'); P.ell(16, 48, 2, 2, '#ffcd75'); P.line(16, 45, 16, 51, bark.dark); P.line(13, 48, 19, 48, bark.dark);
    P.ell(38, 46, 3, 3, '#ffe9a0'); P.ell(38, 46, 2, 2, '#ffcd75'); P.line(38, 43, 38, 49, bark.dark); P.line(35, 46, 41, 46, bark.dark);
    // Flag.
    P.rect(27, 0, 1, 8, '#e8dcc0');
    P.tri(28, 0, 37, 2, 28, 5, '#3b5dc9'); P.set(31, 2, '#ffcd75');
    // Battle damage.
    if (dmg > 0.33) { P.line(12, 44, 16, 52, '#3a2a1a'); P.line(16, 52, 14, 58, '#3a2a1a'); }
    if (dmg > 0.66) { P.line(40, 52, 36, 60, '#3a2a1a'); P.line(36, 60, 38, 66, '#3a2a1a'); P.ell(33, 16, 4, 3, null); }
    P.outline();
    return P.canvas();
  }

  // The Gloom Tower: a crooked spire with a glowing eye, tinted per region.
  const TOWER_TINT = ['#5a4a7a', '#8a6a5a', '#6a7a9a', '#4a5a4a', '#5a3a3a', '#5a6478', '#6a6a9a', '#3a2a5a'];
  function towerCanvas(theme, dmg) {
    const P = new Painter(54, 80);
    const T = tones(TOWER_TINT[theme % TOWER_TINT.length]);
    const glow = ['#ff6bd0', '#ffcd4d', '#73eff7', '#a7f070', '#ef7d57', '#ff5a5a', '#ffe066', '#ff6bd0'][theme % 8];
    P.tri(6, 80, 48, 80, 27, 8, T.base);
    P.tri(6, 80, 22, 80, 27, 8, T.dark);
    P.tri(34, 80, 48, 80, 27, 8, T.light);
    for (let y = 24; y < 80; y += 8) P.line(14 + (80 - y) * 0.05, y, 40 - (80 - y) * 0.05, y + 1, T.deep);
    // Spikes.
    P.tri(9, 50, 13, 46, 2, 40, T.dark); P.tri(41, 50, 45, 46, 52, 38, T.light); P.tri(12, 68, 16, 64, 3, 60, T.dark); P.tri(38, 68, 42, 64, 51, 58, T.light);
    // Eye.
    P.ell(27, 38, 7, 5, '#1a0a2a'); P.ell(27, 38, 5, 3.6, glow); P.ell(27.5, 38, 1.6, 3, '#1a0a2a');
    P.line(19, 31, 34, 33, '#1a0a2a');
    // Crystal.
    P.tri(23, 10, 31, 10, 27, -1, glow); P.tri(23, 10, 27, 10, 27, -1, mix(glow, '#ffffff', 0.4)); P.tri(24, 10, 30, 10, 27, 16, mix(glow, '#1a0a2a', 0.4));
    // Gate.
    P.ell(27, 72, 6, 7, '#1a0a2a'); P.rect(21, 72, 12, 8, '#1a0a2a');
    for (let x = 23; x < 32; x += 3) P.rect(x, 66, 1, 14, T.deep);
    if (dmg > 0.33) { P.line(15, 50, 20, 58, '#140a1e'); P.line(20, 58, 17, 64, '#140a1e'); }
    if (dmg > 0.66) { P.line(37, 26, 33, 34, '#140a1e'); P.line(36, 56, 40, 66, '#140a1e'); P.tri(40, 18, 46, 24, 44, 14, null); }
    P.outline('#0a0614');
    return P.canvas();
  }

  // ---------------------------------------------------------------------------
  // Eggs, icons
  // ---------------------------------------------------------------------------
  const RARITY_HEX = ['#c3cfdb', '#41a6f6', '#a884f3', '#ffc23d', '#ff6fd0'];
  function eggCanvas(rarity, crack) {
    const P = new Painter(20, 24);
    const T = tones(['#f4efe0', '#9fd0ff', '#c9b3ff', '#ffd36b', '#ff9fd8'][rarity]);
    P.ell(10, 13.5, 8, 10, function (nx, ny) { const l = -(nx * 0.55 + ny * 0.7); return l > 0.5 ? T.light : l < -0.4 ? T.dark : T.base; });
    P.set(6, 8, T.spec); P.set(7, 7, T.spec);
    const spot = RARITY_HEX[rarity];
    for (const [x, y, r] of [[13, 9, 1.6], [7, 16, 1.4], [12, 18, 1.2], [9, 11, 0.9]]) P.ell(x, y, r, r, mix(spot, '#ffffff', 0.15));
    if (rarity >= 3) { P.rect(4, 13, 13, 1, GOLD); P.set(10, 12, '#ffffff'); }
    if (crack) { P.line(3, 12, 6, 14); P.line(6, 14, 8, 11, INK); P.line(8, 11, 11, 15, INK); P.line(11, 15, 13, 12, INK); P.line(13, 12, 17, 14, INK); }
    P.outline();
    return P.canvas();
  }

  const ICONS = {
    coin: (P) => { const T = tones('#ffcd4d'); P.ball(8, 8, 6, 6, T); P.ell(8, 8, 3.6, 3.6, T.dark); P.ell(8, 8, 2.8, 2.8, T.base); P.rect(7, 5, 2, 6, T.light); },
    gem: (P) => { P.tri(2, 6, 14, 6, 8, 15, '#41a6f6'); P.rect(4, 3, 8, 3, '#73eff7'); P.tri(2, 6, 4, 3, 4, 6, '#73eff7'); P.tri(12, 3, 14, 6, 12, 6, '#3b5dc9'); P.tri(5, 6, 11, 6, 8, 13, '#9ff6ff'); P.set(5, 4, '#ffffff'); },
    silver: (P) => { const T = tones('#c9d2e3'); P.ell(8, 9, 5.5, 6.8, function (nx, ny) { const l = -(nx * 0.55 + ny * 0.7); return l > 0.5 ? T.light : l < -0.4 ? T.dark : T.base; }); P.set(6, 5, '#ffffff'); P.ell(10, 8, 1, 1, '#94b0c2'); },
    gold: (P) => { const T = tones('#ffcd4d'); P.ell(8, 9, 5.5, 6.8, function (nx, ny) { const l = -(nx * 0.55 + ny * 0.7); return l > 0.5 ? T.light : l < -0.4 ? T.dark : T.base; }); P.set(6, 5, '#ffffff'); P.rect(3, 9, 11, 1, '#ef7d57'); },
    seed: (P) => { P.ell(8, 10, 4, 5, '#a0704a'); P.ell(7, 9, 2, 3, '#c8905a'); P.line(8, 5, 8, 2, '#38b764'); P.ell(10, 2.5, 2, 1.2, '#a7f070'); P.ell(6, 3, 1.6, 1, '#38b764'); },
    fruit: (P) => { const T = tones('#ffcd4d'); P.ball(8, 9, 5.5, 5.5, T); P.line(8, 4, 9, 1, '#8a5a3a'); P.ell(11, 2.5, 2.2, 1.2, '#38b764'); for (const [x, y] of [[6, 7], [10, 10], [7, 12]]) P.set(x, y, '#fff6c8'); P.set(5, 6, '#ffffff'); },
    acorn: (P) => { const T = tones('#c8804a'); P.ball(8, 10, 4.6, 5, T); P.ell(8, 5.5, 5.5, 2.6, '#7a5a3a'); for (let x = 4; x < 13; x += 2) P.set(x, 5, '#5a3a2a'); P.line(8, 3, 9, 1, '#5a3a2a'); },
    pouch: (P) => { const T = tones('#b07a4a'); P.ball(8, 10, 6, 5, T); P.rect(5, 4, 6, 2, T.dark); P.tri(4, 3, 7, 5, 4, 6, T.base); P.tri(12, 3, 9, 5, 12, 6, T.base); P.ell(8, 10, 1.6, 1.6, '#ffcd4d'); },
    roar: (P) => { P.ell(6, 8, 4, 4, '#ffcd4d'); P.ell(6, 8, 2.4, 2.4, '#ef7d57'); for (let i = 0; i < 3; i++) { P.line(10 + i * 2, 3 + i, 10 + i * 2, 13 - i, i % 2 ? '#ffcd75' : '#ffffff'); } },
    charge: (P) => { P.tri(9, 1, 3, 9, 8, 9, '#ffcd4d'); P.tri(7, 7, 13, 7, 6, 15, '#ffcd4d'); P.line(9, 2, 5, 8, '#fff0b0'); },
    burrow: (P) => { P.ball(8, 6, 6, 4, tones('#38b764')); P.rect(4, 8, 8, 7, '#9a6a4a'); P.ell(8, 12, 2, 2.5, '#5a3a2a'); P.rect(6, 12, 4, 3, '#5a3a2a'); },
    train: (P) => { P.rect(1, 7, 3, 3, '#566c86'); P.rect(12, 7, 3, 3, '#566c86'); P.rect(3, 5, 2, 7, '#94b0c2'); P.rect(11, 5, 2, 7, '#94b0c2'); P.rect(5, 8, 6, 1, '#c9d2e3'); },
    clock: (P) => { P.ball(8, 8, 6, 6, tones('#f4f4f4')); P.line(8, 8, 8, 4, INK); P.line(8, 8, 11, 9, INK); P.rect(7, 1, 2, 1, '#ef7d57'); },
    start: (P) => { P.tri(3, 2, 13, 8, 3, 14, '#a7f070'); P.tri(4, 4, 9, 8, 4, 12, '#d6ffb8'); },
    star: (P) => { P.tri(8, 0, 11, 6, 5, 6, '#ffcd4d'); P.tri(1, 6, 15, 6, 8, 11, '#ffcd4d'); P.tri(8, 9, 3, 15, 5, 8, '#ffcd4d'); P.tri(8, 9, 13, 15, 11, 8, '#ffcd4d'); P.set(8, 4, '#fff6c8'); },
    starOff: (P) => { P.tri(8, 0, 11, 6, 5, 6, '#333c57'); P.tri(1, 6, 15, 6, 8, 11, '#333c57'); P.tri(8, 9, 3, 15, 5, 8, '#333c57'); P.tri(8, 9, 13, 15, 11, 8, '#333c57'); },
    rush: (P) => { ICONS.acorn(P); P.line(13, 2, 13, 7, '#ffcd4d'); P.line(11, 4, 15, 4, '#ffcd4d'); },
    armor: (P) => { P.tri(2, 3, 14, 3, 8, 15, '#94b0c2'); P.rect(2, 2, 12, 3, '#c9d2e3'); P.tri(4, 5, 8, 5, 8, 12, '#c9d2e3'); },
    charm: (P) => { for (const [x, y] of [[5, 5], [11, 5], [5, 10], [11, 10]]) P.ball(x, y, 3, 3, tones('#38b764')); P.line(8, 9, 10, 15, '#257179'); },
    trophy: (P) => { const T = tones('#ffcd4d'); P.rect(4, 2, 8, 6, T.base); P.ell(8, 7, 4, 3, T.base); P.rect(4, 2, 2, 6, T.light); P.set(2, 3, T.dark); P.set(2, 4, T.dark); P.set(13, 3, T.dark); P.set(13, 4, T.dark); P.rect(7, 10, 2, 3, T.dark); P.rect(5, 13, 6, 2, '#9a6a3a'); },
    gift: (P) => { P.rect(2, 6, 12, 9, '#ef4f6b'); P.rect(1, 4, 14, 3, '#ff6b8a'); P.rect(7, 4, 2, 11, '#ffd36b'); P.tri(4, 1, 8, 4, 4, 4, '#ffd36b'); P.tri(12, 1, 8, 4, 12, 4, '#ffd36b'); },
    map: (P) => { P.rect(1, 3, 14, 11, '#e8d8b0'); P.rect(1, 3, 14, 1, '#c8b890'); P.line(3, 11, 6, 7, '#b13e53'); P.line(6, 7, 9, 9, '#b13e53'); P.line(9, 9, 12, 5, '#b13e53'); P.rect(11, 4, 3, 3, '#38b764'); },
    tower: (P) => { P.tri(3, 15, 13, 15, 8, 1, '#5a4a7a'); P.tri(3, 15, 7, 15, 8, 1, '#3a2a5a'); P.ell(8, 8, 2, 1.4, '#ff6bd0'); },
    event: (P) => { P.rect(2, 3, 12, 11, '#f4f4f4'); P.rect(2, 3, 12, 3, '#ef4f6b'); P.rect(4, 1, 1, 3, '#566c86'); P.rect(11, 1, 1, 3, '#566c86'); P.rect(5, 8, 2, 2, '#41a6f6'); P.rect(9, 8, 2, 2, '#ffcd4d'); P.rect(5, 11, 2, 2, '#a7f070'); },
    medal: (P) => { P.tri(4, 0, 8, 0, 8, 7, '#3b5dc9'); P.tri(8, 0, 12, 0, 8, 7, '#b13e53'); P.ball(8, 10, 4.6, 4.6, tones('#ffcd4d')); P.set(8, 10, '#fff6c8'); },
    book: (P) => { P.rect(2, 2, 12, 12, '#3b5dc9'); P.rect(4, 2, 10, 12, '#41a6f6'); P.rect(5, 4, 7, 1, '#f4f4f4'); P.rect(5, 6, 5, 1, '#f4f4f4'); P.rect(2, 2, 2, 12, '#29366f'); },
    army: (P) => { P.ball(8, 9, 5, 5, tones('#e8a35f')); P.ell(5, 4.5, 1.6, 1.6, '#e8a35f'); P.ell(11, 4.5, 1.6, 1.6, '#e8a35f'); P.rect(6, 8, 1, 2, INK); P.rect(9, 8, 1, 2, INK); },
    lab: (P) => { P.rect(6, 1, 4, 5, '#dff6ff'); P.ell(8, 11, 5, 4.5, '#dff6ff'); P.ell(8, 12, 4, 3, '#a7f070'); P.set(6, 11, '#ffffff'); P.rect(5, 1, 6, 1, '#9a6a3a'); },
    nest: (P) => { P.ell(8, 12, 7, 3, '#9a6a3a'); for (let x = 2; x < 15; x += 2) P.set(x, 11, '#c8905a'); P.ell(8, 7, 3.6, 4.6, '#ffd36b'); P.set(7, 5, '#ffffff'); },
    gear: (P) => { for (let a = 0; a < 6.28; a += 0.785) P.rect(Math.round(8 + Math.cos(a) * 5.5) - 1, Math.round(8 + Math.sin(a) * 5.5) - 1, 3, 3, '#94b0c2'); P.ball(8, 8, 4.5, 4.5, tones('#94b0c2')); P.ell(8, 8, 1.6, 1.6, INK); },
    sound: (P) => { P.rect(2, 6, 3, 4, '#f4f4f4'); P.tri(5, 6, 9, 2, 9, 14, '#f4f4f4'); P.line(11, 5, 11, 11, '#f4f4f4'); P.line(13, 3, 13, 13, '#f4f4f4'); },
    lock: (P) => { P.ell(8, 5, 3.5, 3.5, '#9aa3b2'); P.ell(8, 5, 2, 2, null); P.rect(3, 7, 10, 7, '#ffcd4d'); P.rect(3, 7, 10, 1, '#fff0b0'); P.rect(7, 9, 2, 3, '#7a5a20'); },
    skull: (P) => { P.ball(8, 7, 5.5, 5, tones('#f4f4f4')); P.rect(5, 11, 6, 3, '#f4f4f4'); P.rect(5, 6, 2, 2, INK); P.rect(9, 6, 2, 2, INK); P.set(6, 12, INK); P.set(9, 12, INK); }
  };
  function iconCanvas(k) { const P = new Painter(16, 16); ICONS[k](P); P.outline(); return P.canvas(); }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------
  const cache = {};
  function makeCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  let HEROES = {}, ENEMIES = {};
  function setContent(ct) { ct.HEROES.forEach((h) => { HEROES[h.id] = h; }); ct.ENEMIES.forEach((e) => { ENEMIES[e.id] = e; }); }

  // Names: 'hero_<id>_<form>_<frame>', 'enemy_<id>_<frame>', 'burrow_<d>', 'tower_<theme>_<d>', 'egg_<r>[_c]', 'icon_<k>'.
  function get(name) {
    if (cache[name]) return cache[name];
    let c, m;
    if ((m = /^hero_(\w+)_(\d)_(\d)$/.exec(name))) c = heroCanvas(HEROES[m[1]], Number(m[2]), Number(m[3]));
    else if ((m = /^enemy_(\w+)_(\d)$/.exec(name))) c = enemyCanvas(ENEMIES[m[1]], Number(m[2]));
    else if ((m = /^burrow_(\d)$/.exec(name))) c = burrowCanvas(Number(m[1]) / 3);
    else if ((m = /^tower_(\d)_(\d)$/.exec(name))) c = towerCanvas(Number(m[1]), Number(m[2]) / 3);
    else if ((m = /^egg_(\d)(_c)?$/.exec(name))) c = eggCanvas(Number(m[1]), !!m[2]);
    else if ((m = /^icon_(\w+)$/.exec(name))) c = iconCanvas(m[1]);
    else throw new Error('unknown sprite ' + name);
    cache[name] = c;
    return c;
  }

  const urlCache = {};
  function url(name) {
    if (urlCache[name]) return urlCache[name];
    const c = get(name);
    urlCache[name] = c ? c.toDataURL() : '';
    return urlCache[name];
  }
  // <img> of a sprite at an integer scale (crisp pixels).
  function img(name, scale, cls) {
    const s = get(name);
    const k = scale || 2;
    return '<img class="px ' + (cls || '') + '" src="' + url(name) + '" width="' + Math.round(s.width * k) + '" height="' + Math.round(s.height * k) + '" alt="">';
  }
  function heroImg(id, form, scale, cls) { return img('hero_' + id + '_' + (form || 0) + '_0', scale, cls); }
  function enemyImg(id, scale, cls) { return img('enemy_' + id + '_0', scale, cls); }

  root.AWSprites = { PAL, tones, mix, RARITY_HEX, get, url, img, heroImg, enemyImg, setContent, HERO_ART, ENEMY_ART, ICONS: Object.keys(ICONS) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
