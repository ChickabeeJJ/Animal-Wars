/* Animal Wars — platform adapter.
 * Wraps the optional CrazyGames SDK v3 and local storage. Every call is safe whether or not the SDK loaded:
 * the game never waits on it and never breaks without it.
 */
(function (root) {
  'use strict';

  const P = {
    sdk: null,
    env: 'none',          // 'none' | 'local' | 'crazygames' | 'disabled'
    ready: false,
    playing: false,
    adActive: false,
    lastMidgame: 0,
    midgameGap: 180000,   // at most one break ad every 3 minutes
    user: null,
    listeners: { ready: [], mute: [], pause: [], user: [] },

    on: function (name, fn) { this.listeners[name].push(fn); },
    emit: function (name, arg) { this.listeners[name].forEach(function (fn) { try { fn(arg); } catch (e) { /* keep going */ } }); },

    onSdkScript: function (failed) {
      if (failed || this.sdk) return;
      const cg = root.CrazyGames && root.CrazyGames.SDK;
      if (!cg) return;
      const self = this;
      Promise.resolve()
        .then(function () { return cg.init(); })
        .then(function () {
          self.sdk = cg;
          self.env = cg.environment || 'crazygames';
          self.ready = self.env !== 'disabled';
          if (!self.ready) return;
          try {
            const s = cg.game && cg.game.settings;
            if (s && typeof s.muteAudio === 'boolean') self.emit('mute', s.muteAudio);
            if (cg.game && cg.game.addSettingsChangeListener) {
              cg.game.addSettingsChangeListener(function (ns) { if (ns && typeof ns.muteAudio === 'boolean') self.emit('mute', ns.muteAudio); });
            }
          } catch (e) { /* settings are optional */ }
          self.loadUser();
          // Calls made before the SDK was ready are replayed as the current state: still loading, or in a battle.
          if (self.loading) { self.loadingSent = true; self.call('game.loadingStart'); }
          if (self.playing && !self.adActive) self.call('game.gameplayStart');
          self.emit('ready');
        })
        .catch(function () { self.sdk = null; self.ready = false; });
    },

    call: function (path) {
      if (!this.ready || !this.sdk) return;
      try {
        const parts = path.split('.');
        let obj = this.sdk;
        for (let i = 0; i < parts.length - 1; i++) obj = obj && obj[parts[i]];
        const fn = obj && obj[parts[parts.length - 1]];
        if (typeof fn === 'function') fn.call(obj);
      } catch (e) { /* never let the platform crash the game */ }
    },

    // Loading and gameplay are tracked as state, so a call made before the SDK finished init() is not lost and a
    // stop is never sent without its start.
    loading: false,
    loadingSent: false,
    loadingStart: function () { this.loading = true; if (this.ready) { this.loadingSent = true; this.call('game.loadingStart'); } },
    loadingStop: function () { this.loading = false; if (this.loadingSent) { this.loadingSent = false; this.call('game.loadingStop'); } },
    gameplayStart: function () { if (!this.playing && !this.adActive) { this.playing = true; this.call('game.gameplayStart'); } },
    gameplayStop: function () { if (this.playing) { this.playing = false; this.call('game.gameplayStop'); } },
    happytime: function () { this.call('game.happytime'); },

    // Signed-in CrazyGames player, if any (used only to greet them by name).
    loadUser: function () {
      const self = this;
      try {
        if (!this.sdk.user || !this.sdk.user.getUser) return;
        Promise.resolve(this.sdk.user.getUser()).then(function (u) { self.user = u || null; self.emit('user', self.user); }).catch(function () {});
        if (this.sdk.user.addAuthListener) this.sdk.user.addAuthListener(function (u) { self.user = u || null; self.emit('user', self.user); });
      } catch (e) { /* optional */ }
    },

    adsAvailable: function () { return this.ready && this.env === 'crazygames' && !!(this.sdk.ad && this.sdk.ad.requestAd); },
    canRewarded: function () { return this.adsAvailable(); },

    // Plays an ad of `type`; done(true) only if it finished. Audio and gameplay pause while it shows.
    requestAd: function (type, done) {
      if (!this.adsAvailable() || this.adActive) { done(false); return; }
      const self = this;
      let finished = false;
      const wasPlaying = this.playing;
      function end(ok) {
        if (finished) return;
        finished = true;
        self.adActive = false;
        self.emit('pause', false);
        if (wasPlaying) self.gameplayStart();
        done(ok);
      }
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: function () { self.adActive = true; self.gameplayStop(); self.emit('pause', true); },
          adFinished: function () { end(true); },
          adError: function () { end(false); }
        });
      } catch (e) { end(false); }
    },
    rewarded: function (done) { this.requestAd('rewarded', done); },
    // Break ad between battles, never more often than midgameGap.
    midgame: function (done) {
      const now = Date.now();
      if (!this.adsAvailable() || now - this.lastMidgame < this.midgameGap) { done(false); return; }
      this.lastMidgame = now;
      this.requestAd('midgame', done);
    },

    // Leaderboard. Paste the base64 encryption key from the CrazyGames developer portal
    // (your game > Leaderboard settings). Without a key, scores are simply not submitted.
    leaderboardKey: '',
    bestSubmitted: -1,
    canLeaderboard: function () {
      return this.ready && this.env === 'crazygames' && !!this.leaderboardKey &&
        !!(this.sdk.user && this.sdk.user.submitScore) && !!(root.crypto && root.crypto.subtle);
    },
    // Encrypts the score with AES-GCM (random 12-byte IV, sent as base64(IV + ciphertext)) and submits it.
    submitScore: function (score) {
      score = Math.floor(score);
      if (!this.canLeaderboard() || !(score > this.bestSubmitted)) return;
      this.bestSubmitted = score;
      const self = this;
      const raw = Uint8Array.from(atob(this.leaderboardKey), function (c) { return c.charCodeAt(0); });
      const iv = root.crypto.getRandomValues(new Uint8Array(12));
      root.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt'])
        .then(function (key) { return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(String(score))); })
        .then(function (ct) {
          const out = new Uint8Array(12 + ct.byteLength);
          out.set(iv, 0); out.set(new Uint8Array(ct), 12);
          let bin = '';
          for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
          return self.sdk.user.submitScore({ encryptedScore: btoa(bin), score: score });
        })
        .catch(function () { self.bestSubmitted = -1; });
    },

    // Storage: localStorage first; mirrored into the SDK data module when available.
    get: function (key) { try { return root.localStorage.getItem(key); } catch (e) { return null; } },
    getCloud: function (key) {
      if (!this.ready || !this.sdk || !this.sdk.data) return null;
      try { return this.sdk.data.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      let ok = false;
      try { root.localStorage.setItem(key, value); ok = true; } catch (e) { /* storage full or blocked */ }
      if (this.ready && this.sdk && this.sdk.data) { try { this.sdk.data.setItem(key, value); ok = true; } catch (e) { /* ignore */ } }
      return ok;
    },
    remove: function (key) {
      try { root.localStorage.removeItem(key); } catch (e) { /* ignore */ }
      if (this.ready && this.sdk && this.sdk.data) { try { this.sdk.data.removeItem(key); } catch (e) { /* ignore */ } }
    }
  };

  root.AWPlatform = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
