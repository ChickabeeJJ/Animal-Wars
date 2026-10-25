/* Animal Wars: attack styles. Every hero and every Gloom gets its own attack: a body motion (how the sprite moves
 * while it winds up and strikes) and a hit effect (what bursts where the blow lands); ranged fighters also get a
 * projectile. Choices follow the unit's role and element, and no two units share the same motion + effect pair.
 * Pure data, no DOM: the renderer draws them (js/render.js) and the tests check they are all different. */
(function (root) {
  'use strict';
  // Body motions, played over the wind-up (e.at < fore) and the strike that follows.
  const MOTIONS = ['lunge', 'hop', 'spin', 'rear', 'stomp', 'dash', 'recoil', 'charge', 'float', 'bounce', 'crouch', 'backstep', 'pulse', 'shove', 'sway', 'flip'];
  // Hit effects, drawn where the blow lands.
  const EFFECTS = ['slash', 'cross', 'claw', 'star', 'ring', 'spikes', 'sparks', 'petals', 'bubbles', 'snow', 'flames', 'bolt', 'twinkle', 'leaves', 'shards', 'ink',
    'hearts', 'notes', 'feathers', 'sand', 'drops', 'embers', 'smoke', 'beam', 'runes', 'quake', 'shatter', 'vortex'];
  // Projectiles for fighters with long reach.
  const PROJECTILES = ['orb', 'arrow', 'shuriken', 'bolt', 'rock', 'bubble', 'leaf', 'fireball', 'icicle', 'beam', 'boomerang', 'feather', 'note', 'comet', 'spore', 'dart', 'ring', 'skull', 'crescent', 'seed'];

  const BY_ELEMENT = {
    ember: ['flames', 'embers', 'sparks', 'star', 'smoke', 'ring'], frost: ['snow', 'shatter', 'shards', 'twinkle', 'ring', 'cross'],
    thorn: ['leaves', 'spikes', 'claw', 'petals', 'slash', 'quake'], storm: ['bolt', 'sparks', 'ring', 'cross', 'vortex', 'beam'],
    shadow: ['ink', 'smoke', 'runes', 'vortex', 'claw', 'cross'], tide: ['bubbles', 'drops', 'ring', 'vortex', 'slash', 'shatter'],
    stone: ['quake', 'shards', 'spikes', 'sand', 'star', 'ring'], sun: ['beam', 'star', 'twinkle', 'sparks', 'feathers', 'cross'],
    moon: ['runes', 'twinkle', 'notes', 'ring', 'beam', 'smoke'], bloom: ['petals', 'hearts', 'leaves', 'notes', 'drops', 'twinkle']
  };
  const PROJ_BY_ELEMENT = {
    ember: ['fireball', 'comet', 'dart', 'orb'], frost: ['icicle', 'orb', 'shuriken', 'crescent'], thorn: ['leaf', 'seed', 'dart', 'spore'],
    storm: ['bolt', 'beam', 'shuriken', 'orb'], shadow: ['skull', 'crescent', 'orb', 'shuriken'], tide: ['bubble', 'orb', 'ring', 'boomerang'],
    stone: ['rock', 'boomerang', 'seed', 'dart'], sun: ['beam', 'comet', 'arrow', 'ring'], moon: ['crescent', 'note', 'orb', 'comet'],
    bloom: ['spore', 'note', 'leaf', 'seed']
  };
  function motionPrefs(u) {
    if (u.boss) return ['pulse', 'stomp', 'rear', 'shove', 'charge', 'sway'];
    if (u.rng >= 50) return ['recoil', 'float', 'charge', 'pulse', 'sway', 'backstep', 'crouch'];
    if (u.area) return ['stomp', 'spin', 'rear', 'hop', 'shove', 'flip'];
    if (u.spd >= 26) return ['dash', 'lunge', 'flip', 'backstep', 'bounce'];
    if (u.hp >= u.atk * 25) return ['shove', 'stomp', 'sway', 'crouch', 'bounce'];
    return ['lunge', 'hop', 'bounce', 'crouch', 'spin', 'sway'];
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // Assigns styles to every unit: preferred motion × preferred effect first, then any free pair, never a repeat.
  function build(CT) {
    const used = {}, usedProj = {}, out = { hero: {}, enemy: {} };
    const units = CT.HEROES.map((h) => ({ side: 'hero', id: h.id, el: h.el, rng: h.rng, area: h.area, spd: h.spd, hp: h.hp, atk: h.atk, col: h.look.a || h.look.c, col2: h.look.c, boss: false }))
      .concat(CT.ENEMIES.map((e) => ({ side: 'enemy', id: e.id, el: e.el, rng: e.rng, area: e.area, spd: e.spd, hp: e.hp, atk: e.atk, col: e.look.c, col2: e.look.c, boss: !!CT.REGIONS.find((R) => R.boss === e.id) })));
    for (const u of units) {
      const h = hash(u.side + u.id);
      const mp = motionPrefs(u), ep = (BY_ELEMENT[u.el] || EFFECTS).slice();
      // Rotate the preference lists by the unit's hash so neighbours in the roster spread out.
      const rot = (a, k) => a.slice(k % a.length).concat(a.slice(0, k % a.length));
      const ms = rot(mp, h).concat(MOTIONS), es = rot(ep, h >>> 8).concat(rot(EFFECTS, h >>> 16));
      let pick = null;
      for (const m of ms) { for (const f of es) if (!used[m + '+' + f]) { pick = [m, f]; break; } if (pick) break; }
      used[pick[0] + '+' + pick[1]] = u.side + ':' + u.id;
      const st = { motion: pick[0], fx: pick[1], col: u.col, col2: u.col2, seed: h };
      if (u.rng >= 50) {
        const pp = rot(PROJ_BY_ELEMENT[u.el] || PROJECTILES, h >>> 4).concat(PROJECTILES);
        // Projectile + effect together stay unique too (the motion pair already is).
        st.proj = pp.find((p) => !usedProj[p + '+' + st.fx]) || pp[0];
        usedProj[st.proj + '+' + st.fx] = 1;
      }
      out[u.side][u.id] = st;
    }
    return out;
  }

  const AW_FX = { MOTIONS: MOTIONS, EFFECTS: EFFECTS, PROJECTILES: PROJECTILES, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = AW_FX;
  root.AW_FX = AW_FX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
