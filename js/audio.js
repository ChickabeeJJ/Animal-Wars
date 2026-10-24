/* Animal Wars — chiptune sound effects and music, all synthesized with Web Audio (no audio files).
 * Music is a tiny step sequencer playing three original themes: home, battle and boss.
 */
(function (root) {
  'use strict';

  function hz(semi) { return 440 * Math.pow(2, (semi - 9) / 12); }   // semi 0 = C4

  // Chords: [root semitone, minor?]. Melodies: 16 steps per bar, '.' = rest, numbers = semitones above the key.
  const SONGS = {
    home: {
      bpm: 96, key: -12, swing: 0.08,
      chords: [[0, 0], [9, 1], [5, 0], [7, 0]],
      melody: [
        '7 . . 4 . 5 7 . 12 . 11 . 9 . 7 .', '9 . . 7 . 4 . . 4 . 5 . 7 . . .', '5 . . 9 . 12 . 9 . 7 . 5 . 4 . .', '2 . 4 . 7 . 11 . 14 . . 12 . 11 . .',
        '7 . . 4 . 5 7 . 12 . 14 . 16 . 14 .', '12 . . 9 . 7 . . 9 . 12 . 16 . . .', '17 . 16 . 14 . 12 . 9 . 12 . 14 . . .', '11 . 12 . 14 . 11 . 7 . . . . . . .'
      ],
      drums: 'soft'
    },
    battle: {
      bpm: 138, key: -10, swing: 0,
      chords: [[0, 0], [9, 1], [5, 0], [7, 0]],
      melody: [
        '0 . 4 7 12 . 7 4 0 . 4 7 11 . 7 .', '9 . 12 9 16 . 12 9 7 . 9 12 14 . 12 .', '5 . 9 12 17 . 12 9 5 . 7 9 12 . 9 .', '7 . 11 14 19 . 14 11 12 . 11 . 9 . 7 .',
        '12 . . 12 11 . 9 . 7 . 9 . 12 . . .', '16 . . 16 14 . 12 . 9 . 12 . 16 . . .', '17 . 16 . 14 . 12 . 14 . 12 . 9 . 12 .', '14 . . 12 . 11 . 7 . 11 . 14 . 19 . .'
      ],
      drums: 'drive'
    },
    boss: {
      bpm: 152, key: -15, swing: 0,
      chords: [[0, 1], [8, 0], [10, 0], [7, 0]],
      melody: [
        '12 . 12 15 . 12 19 . 17 15 . 14 15 . 12 .', '8 . 12 15 . 12 20 . 19 17 . 15 17 . 12 .', '10 . 14 17 . 14 22 . 19 17 . 14 17 . 14 .', '11 . 14 . 19 . 23 . 22 . 19 . 17 . 14 .'
      ],
      drums: 'heavy'
    }
  };
  Object.keys(SONGS).forEach(function (k) { SONGS[k].steps = SONGS[k].melody.map(function (bar) { return bar.split(' ').map(function (t) { return t === '.' ? null : Number(t); }); }); });

  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null, noise: null,
    muted: false, external: false, sfxOn: true, musicOn: true, hidden: false,
    song: null, want: 'home', step: 0, nextT: 0, timer: null, last: {},

    unlock: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume().catch(function () {}); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
        this.master = this.ctx.createGain(); this.master.connect(comp); comp.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
        this.noise = this.makeNoise();
        this.applyGain();
      } catch (e) { this.ctx = null; return; }
      this.startMusic();
    },

    silent: function () { return this.muted || this.external || this.hidden; },
    applyGain: function () {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.silent() ? 0 : 0.55, t, 0.03);
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? 1 : 0, t, 0.03);
      this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.3 : 0, t, 0.2);
    },
    setMuted: function (m) { this.muted = !!m; this.applyGain(); },
    setExternalMute: function (m) { this.external = !!m; this.applyGain(); },
    setSfx: function (on) { this.sfxOn = !!on; this.applyGain(); },
    setMusic: function (on) { this.musicOn = !!on; this.applyGain(); },
    suspend: function () { this.hidden = true; this.applyGain(); if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(function () {}); },
    resume: function () { this.hidden = false; this.applyGain(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(function () {}); },
    ok: function () { return this.ctx && this.ctx.state === 'running' && !this.silent() && this.sfxOn; },

    makeNoise: function () {
      const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) { if (i % 5 === 0) v = Math.random() * 2 - 1; d[i] = v; }
      return buf;
    },

    tone: function (type, f0, f1, dur, gain, when, out, filter) {
      const c = this.ctx, t = (when === undefined ? c.currentTime : when);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
      g.gain.setValueAtTime(gain, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (filter) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
      node.connect(g); g.connect(out || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    hiss: function (dur, gain, freq, when, out, hp) {
      const c = this.ctx, t = (when === undefined ? c.currentTime : when);
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.setValueAtTime(freq, t);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(out || this.sfxGain);
      s.start(t); s.stop(t + dur + 0.02);
    },
    arp: function (notes, step, dur, gain, type) { const t = this.ctx.currentTime; notes.forEach((f, i) => this.tone(type || 'square', f, f, dur, gain, t + i * step, null, 3500)); },
    // Rate-limits a sound so crowds don't turn into noise.
    gate: function (k, gap) { const t = this.ctx.currentTime; if (this.last[k] && t - this.last[k] < gap) return false; this.last[k] = t; return true; },

    // --- Music ---------------------------------------------------------------
    play: function (name) { this.want = name; if (this.ctx && (!this.song || this.song.name !== name)) this.startMusic(); },
    startMusic: function () {
      if (!this.ctx) return;
      const s = SONGS[this.want];
      if (!s) return;
      this.song = { name: this.want, s: s };
      this.step = 0;
      this.nextT = this.ctx.currentTime + 0.1;
      if (!this.timer) this.timer = setInterval(() => this.pump(), 30);
    },
    pump: function () {
      if (!this.ctx || !this.song || this.ctx.state !== 'running') return;
      const s = this.song.s, dt = 60 / s.bpm / 4;
      while (this.nextT < this.ctx.currentTime + 0.15) {
        this.playStep(s, this.step, this.nextT + (this.step % 2 ? s.swing * dt : 0));
        this.nextT += dt;
        this.step++;
      }
    },
    playStep: function (s, i, t) {
      if (this.silent() || !this.musicOn) return;
      const bars = s.steps.length, bar = Math.floor(i / 16) % bars, st = i % 16;
      const ch = s.chords[bar % s.chords.length];
      const out = this.musicGain, dur = 60 / s.bpm / 4;
      const root = s.key + ch[0];
      // Bass.
      if (st % 4 === 0) this.tone('triangle', hz(root - 12), hz(root - 12), dur * 3.2, 0.32, t, out);
      else if (s.drums !== 'soft' && st % 4 === 2) this.tone('triangle', hz(root), hz(root), dur * 1.4, 0.18, t, out);
      // Arpeggio.
      const tri = ch[1] ? [0, 3, 7, 12] : [0, 4, 7, 12];
      if (st % 2 === 1) this.tone('square', hz(root + 12 + tri[(st >> 1) % 4]), 0, dur * 0.9, 0.025, t, out, 2200);
      // Lead.
      const n = s.steps[bar][st];
      if (n !== null && n !== undefined) {
        let len = 1;
        while (st + len < 16 && s.steps[bar][st + len] === null && len < 4) len++;
        this.tone('square', hz(s.key + 12 + n), 0, dur * len * 0.95, 0.06, t, out, 3000);
        this.tone('triangle', hz(s.key + n), 0, dur * len * 0.95, 0.05, t, out);
      }
      // Drums.
      const d = s.drums;
      if (st % 8 === 0 || (d === 'heavy' && st % 8 === 6)) this.tone('sine', 140, 40, 0.14, d === 'soft' ? 0.3 : 0.55, t, out);
      if (d !== 'soft' && st % 8 === 4) this.hiss(0.12, 0.16, 2600, t, out);
      if (st % 2 === 0) this.hiss(0.03, d === 'soft' ? 0.03 : 0.06, 7000, t, out, true);
    },

    // --- Effects --------------------------------------------------------------
    click: function () { if (this.ok()) this.tone('square', 880, 1100, 0.04, 0.03, undefined, null, 3000); },
    deny: function () { if (this.ok()) this.tone('square', 160, 120, 0.1, 0.04, undefined, null, 900); },
    deploy: function () { if (this.ok() && this.gate('dep', 0.04)) { this.tone('square', 520, 780, 0.07, 0.04, undefined, null, 3000); this.hiss(0.05, 0.03, 3000); } },
    hit: function (big) { if (!this.ok() || !this.gate('hit', big ? 0.03 : 0.06)) return; this.hiss(big ? 0.09 : 0.05, big ? 0.07 : 0.035, big ? 1600 : 2600); this.tone('square', big ? 180 : 260, 90, 0.05, 0.025, undefined, null, 1200); },
    crit: function () { if (this.ok() && this.gate('crit', 0.08)) { this.tone('square', 1200, 600, 0.08, 0.04); this.hiss(0.1, 0.06, 4000); } },
    kb: function () { if (this.ok() && this.gate('kb', 0.08)) this.tone('triangle', 220, 70, 0.14, 0.12); },
    pop: function () { if (this.ok() && this.gate('pop', 0.04)) { this.tone('square', 600, 1400, 0.06, 0.03, undefined, null, 3500); } },
    acorn: function () { if (this.ok() && this.gate('acorn', 0.07)) { this.tone('square', 1568, 1568, 0.04, 0.02); this.tone('square', 2093, 2093, 0.06, 0.02, this.ctx.currentTime + 0.04); } },
    heroDown: function () { if (this.ok() && this.gate('down', 0.1)) this.tone('triangle', 500, 200, 0.18, 0.06); },
    pouch: function () { if (this.ok()) this.arp([523, 659, 784, 1047], 0.05, 0.08, 0.04); },
    roar: function () { if (!this.ok()) return; this.tone('sawtooth', 110, 40, 0.9, 0.12, undefined, null, 900); this.tone('square', 220, 55, 0.6, 0.06, undefined, null, 1400); this.hiss(0.9, 0.12, 1200); },
    wave: function () { if (this.ok() && this.gate('wave', 0.12)) { this.hiss(0.25, 0.05, 2400); this.tone('sine', 300, 900, 0.2, 0.04); } },
    boss: function () { if (!this.ok()) return; for (let i = 0; i < 3; i++) this.tone('sawtooth', 90, 70, 0.3, 0.12, this.ctx.currentTime + i * 0.35, null, 700); this.hiss(1, 0.06, 500); },
    tower: function () { if (this.ok() && this.gate('tower', 0.12)) { this.tone('sine', 90, 45, 0.18, 0.2); this.hiss(0.08, 0.05, 900); } },
    freeze: function () { if (this.ok() && this.gate('frz', 0.15)) this.arp([2093, 2637, 3136], 0.03, 0.06, 0.02); },
    win: function () { if (!this.ok()) return; this.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.09, 0.16, 0.05); this.hiss(0.8, 0.03, 5000); },
    lose: function () { if (this.ok()) this.arp([392, 370, 349, 262], 0.22, 0.3, 0.05, 'triangle'); },
    shake: function () { if (this.ok()) this.tone('square', 300, 330, 0.05, 0.025, undefined, null, 2000); },
    crack: function () { if (this.ok()) { this.hiss(0.2, 0.08, 3500); this.tone('square', 900, 300, 0.12, 0.04); } },
    reveal: function (r) {
      if (!this.ok()) return;
      const sets = [[659, 784], [659, 784, 1047], [523, 659, 784, 1047, 1319], [523, 659, 784, 1047, 1319, 1568, 2093], [392, 523, 659, 784, 1047, 1319, 1568, 2093, 2637]];
      this.arp(sets[r], r >= 2 ? 0.07 : 0.06, 0.15, 0.045);
      if (r >= 3) this.hiss(0.8, 0.03, 5000, this.ctx.currentTime + 0.3);
    },
    level: function () { if (this.ok()) this.arp([659, 784, 1047, 1319], 0.045, 0.08, 0.035); },
    claim: function () { if (this.ok()) this.arp([784, 1047, 1319, 1568], 0.05, 0.1, 0.035); },
    star: function (i) { if (this.ok()) this.tone('square', 1047 * Math.pow(1.26, i), 0, 0.15, 0.04, undefined, null, 4000); }
  };

  root.AWAudio = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
