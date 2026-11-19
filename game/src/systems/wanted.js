// The wanted meter. Crimes add heat, heat sets the star level, officers on the scene keep it warm
// and a player who breaks line of sight for a few seconds bleeds it away until the chase ends.
// Story heat pins set a floor under ordinary decay and must be released when a job ends.

import * as U from '../core/util.js';

const THRESHOLDS = [0, 12, 32, 58, 84, 110];

export class Wanted {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.level = 0;
    this.lastSeen = 0;
    this.unseenFor = 0;
    this.pinned = 0; // mission-mandated floor
    this.flash = 0;
    this.sinceCrime = 999;
  }

  get stars() {
    return this.level;
  }

  addCrime(points, announce = true) {
    // Heat accrued while the busted card is up would never be answered by a car, so it waits.
    if (this.game.state !== 'play') return;
    // A burst (a whole magazine into a cruiser) should not empty five stars at once: the same
    // crime repeated inside a second or two is worth less each time. The first crime of a clear
    // coast is always worth full, or a fresh job could not raise a star on its own.
    const scale = this.level === 0 ? 1 : this.sinceCrime < 0.3 ? 0.25 : this.sinceCrime < 1.5 ? 0.55 : 1;
    this.heat = Math.min(THRESHOLDS[5] + 20, this.heat + points * scale);
    this.sinceCrime = 0;
    const before = this.level;
    this.level = this.levelFor(this.heat);
    this.unseenFor = 0;
    if (this.level > before) {
      this.flash = 1.4;
      this.game.audio.stars(this.level);
      this.game.hud.wantedFlash();
    } else if (announce) {
      this.flash = 0.5;
    }
  }

  levelFor(heat) {
    let lvl = 0;
    for (let i = 1; i < THRESHOLDS.length; i++) if (heat >= THRESHOLDS[i]) lvl = i;
    return lvl;
  }

  pin(level) {
    this.pinned = level;
    this.heat = Math.max(this.heat, THRESHOLDS[Math.min(level, 5)]);
    this.level = Math.max(this.level, level);
  }

  unpin() {
    this.pinned = 0;
  }

  clear() {
    this.heat = 0;
    this.level = 0;
    this.unseenFor = 0;
    this.lastSeen = 0;
    this.pinned = 0;
    this.flash = 0;
    // A cleared coast is a clean slate: the next crime is not discounted as a repeat.
    this.sinceCrime = 999;
  }

  // Line of sight from any officer or cruiser, with buildings in the way. Officers see a person
  // on the next corner; a cruiser across the block cannot. With nobody on the street yet the
  // player still counts as seen for a while, or a fresh crime would cool off before the first
  // cruiser can answer it: a call takes the length of a street to arrive.
  seen(ctx) {
    const p = ctx.player;
    if (p.dead) return false;
    const watchers = [];
    for (const cop of ctx.police.cops) if (!cop.dead) watchers.push({ w: cop, far: 55 });
    for (const car of ctx.police.cruisers) if (!car.dead) watchers.push({ w: car, far: 70 });
    // With no officer and no cruiser out yet, the call stands in for eyes for the first dozen
    // seconds of a fresh crime; after that an unanswered level cools like any other.
    if (!watchers.length) return this.sinceCrime < 12;
    for (const { w, far } of watchers) {
      const d = U.dist(w.x, w.z, p.x, p.z);
      if (d > far) continue;
      if (d < 7) return true;
      if (this.hasSight(ctx.world, w.x, w.z, p.x, p.z)) return true;
    }
    return false;
  }

  hasSight(world, ax, az, bx, bz) {
    const steps = Math.ceil(U.dist(ax, az, bx, bz) / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (world.blocked(U.lerp(ax, bx, t), U.lerp(az, bz, t), 0.1)) return false;
    }
    return true;
  }

  update(dt, ctx) {
    if (this.game.state !== 'play') return;
    this.flash = Math.max(0, this.flash - dt);
    this.sinceCrime = Math.min(999, this.sinceCrime + dt);
    const before = this.level;

    if (this.pinned > 0) {
      this.heat = Math.max(this.heat, THRESHOLDS[this.pinned]);
      this.level = Math.max(this.level, this.pinned);
    }

    if (this.level === 0) {
      this.heat = Math.max(0, this.heat - dt * 4);
      return;
    }

    if (this.seen(ctx)) {
      this.unseenFor = 0;
      this.lastSeen = 0;
      // Heat creeps up while they are on you, but slowly: a chase alone does not climb the stars.
      this.heat = Math.min(THRESHOLDS[5] + 20, this.heat + dt * 0.35);
    } else {
      this.unseenFor += dt;
      // A short grace while they are still on the way in, then a bleed that starts slow.
      if (this.unseenFor > 4) {
        const rate = 1.6 + (this.unseenFor - 4) * 0.7;
        this.heat = Math.max(0, this.heat - dt * rate);
        if (this.heat < THRESHOLDS[this.level] - 8) this.level = this.levelFor(this.heat);
      }
    }

    this.heat = Math.max(0, Math.min(THRESHOLDS[5] + 20, this.heat));
    const lvl = Math.max(this.levelFor(this.heat), this.pinned);
    if (lvl !== this.level) this.level = lvl;
    // Once per change, not once per frame: the HUD and siren read this.
    if (this.level !== before) {
      this.game.hud.wantedFlash();
      if (this.level === 0) this.game.onWantedCleared?.();
    }
  }
}
