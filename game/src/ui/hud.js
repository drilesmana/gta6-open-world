// The HUD: DOM panels for money, stars, health, armour, ammo, speed, the job line and the
// subtitles, plus the minimap it drives. Every write goes through here so the screen has one
// owner and the game code never touches markup.
// Objective prose comes from the mission state machine; this layer owns its presentation, not its progression.

import { Minimap } from './minimap.js';

const fmt = (n) => Math.max(0, Math.round(n)).toLocaleString('en-US');
// Opacity to two places, so the HUD does not write a long float every frame.
const U01 = (v) => Math.round(v * 100) / 100;

export class Hud {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');
    this.money = $('money');
    this.stars = $('stars');
    this.health = $('hp').firstElementChild;
    this.armor = $('ar').firstElementChild;
    this.stamina = $('st')?.firstElementChild ?? null;
    this.escape = $('escape');
    this.escapeWrap = $('escapeWrap');
    this.staminaRow = $('staminaRow');
    this.lastPrompt = '';
    this.lastSub = '';
    this.ammo = $('ammo');
    this.weapon = $('weapon');
    this.speedo = $('speedo');
    this.speed = $('speed');
    this.gear = $('gear');
    this.objective = $('objective');
    this.objectiveText = $('objective-text');
    this.objectiveSub = $('objective-sub');
    this.objectiveHead = $('objective-head');
    this.prompt = $('prompt');
    this.toasts = $('toasts');
    this.subs = $('subs');
    this.crosshair = $('crosshair');
    this.clock = $('clock');
    this.district = $('district');
    this.dmg = $('dmg');
    this.bigmap = $('bigmap');
    this.map = new Minimap($('minimap'), $('bigmapCanvas'), game.city);
    this.stars.innerHTML = '<span>&#9733;</span>'.repeat(5);
    this.starEls = [...this.stars.children];
    this.subQueue = [];
    this.subTimer = 0;
    this.dmgTimer = 0;
    this.lastStars = 0;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setMoney(n) { this.money.textContent = fmt(n); }

  setHealth(h, max) {
    this.health.style.width = `${Math.max(0, (h / max) * 100)}%`;
  }

  setArmor(a) { this.armor.style.width = `${Math.max(0, a)}%`; }

  // The sprint tank only shows while it is being spent or refilling, so a full bar is not clutter.
  setStamina(v, tired) {
    if (!this.stamina) return;
    this.stamina.style.width = `${Math.round(v * 100)}%`;
    this.staminaRow?.classList.toggle('hidden', v > 0.99 && !tired);
    this.stamina.style.background = tired ? 'linear-gradient(90deg,#c9603f,#e89a5c)' : '';
  }

  setStars(level) {
    for (let i = 0; i < this.starEls.length; i++) this.starEls[i].classList.toggle('on', i < level);
    this.lastStars = level;
  }

  wantedFlash() {
    this.stars.classList.add('flash');
    setTimeout(() => this.stars.classList.remove('flash'), 260);
  }

  setSpeed(kmh, gear, driving) {
    this.speedo.classList.toggle('hidden', !driving);
    if (!driving) return;
    this.speed.textContent = String(Math.round(kmh));
    this.gear.textContent = gear;
  }

  setWeapon(armed, ammo, reserve) {
    this.weapon.classList.toggle('hidden', !armed);
    this.crosshair.classList.toggle('hidden', !armed);
    if (armed) this.ammo.innerHTML = `${ammo}<small> / ${reserve}</small>`;
  }

  updateAmmo() {
    const p = this.game.player;
    this.setWeapon(p.armed, p.ammo, p.reserve);
  }

  setObjective(head, text, sub, urgent = false) {
    if (!text) { this.objective.classList.add('hidden'); return; }
    this.objective.classList.remove('hidden');
    this.objective.classList.toggle('urgent', urgent);
    this.objectiveHead.textContent = head;
    this.objectiveText.textContent = text;
    this.objectiveSub.textContent = sub ?? '';
    this.objectiveSub.style.color = urgent ? '#ff9b83' : '';
  }

  clearObjective() {
    this.objective.classList.add('hidden');
    this.objective.classList.remove('urgent');
    this.objectiveText.textContent = '';
    this.objectiveSub.textContent = '';
    this.objectiveSub.style.color = '';
  }

  setRadio(on) {
    const el = document.getElementById('radioName');
    if (el) el.textContent = on ? 'RADIO 88 · ON AIR' : 'RADIO 88 · OFF';
    const btn = document.getElementById('btnRadio');
    if (btn) btn.textContent = `Radio: ${on ? 'On' : 'Off'}`;
  }

  setPrompt(text) {
    if (!text) {
      if (this.lastPrompt) { this.prompt.classList.add('hidden'); this.lastPrompt = ''; }
      return;
    }
    // Nothing writes markup unless the sentence changed: this runs every frame at a car's door.
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.prompt.classList.remove('hidden');
    this.prompt.innerHTML = text;
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  say(who, line, seconds = 4.5) {
    // Radio chatter queues up, but a burst of callouts should not run for a minute after.
    this.subQueue.push({ who, line, seconds });
    if (this.subQueue.length > 3) this.subQueue.shift();
  }

  damageFlash() {
    this.dmg.style.opacity = '1';
    this.dmgTimer = 0.45;
  }

  setClock(minutesOfDay) {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const day = days[Math.floor(minutesOfDay / 1440) % 7];
    const hh = String(Math.floor((minutesOfDay % 1440) / 60)).padStart(2, '0');
    const mm = String(Math.floor(minutesOfDay % 60)).padStart(2, '0');
    this.clock.textContent = `${day} ${hh}:${mm}`;
  }

  toggleBigMap(force) {
    const open = force ?? this.bigmap.classList.contains('hidden');
    this.bigmap.classList.toggle('hidden', !open);
    return open;
  }

  update(dt) {
    const g = this.game;
    this.setHealth(g.player.health, g.player.maxHealth);
    this.setArmor(g.player.armor);
    this.setStamina(g.player.stamina ?? 1, !!g.player.tired);
    this.setStars(g.wanted.level);
    // The stars drain while the coast is clear: the ring under them is the escape clock.
    this.stars.style.opacity = g.wanted.level > 0 && g.wanted.unseenFor > 0
      ? String(U01(1 - Math.min(1, g.wanted.unseenFor / 9) * 0.8))
      : '1';
    // And a bar fills as the coast stays clear, so a player hiding knows how long is left.
    if (this.escape) {
      const clear = g.wanted.level > 0 ? Math.min(1, g.wanted.unseenFor / 9) : 0;
      this.escape.style.width = `${Math.round(clear * 100)}%`;
      this.escapeWrap?.classList.toggle('hidden', g.wanted.level === 0);
    }
    this.setSpeed(g.player.vehicle ? g.player.vehicle.speedKmh : 0, g.player.vehicle && g.player.vehicle.forwardSpeed < -0.4 ? 'R' : 'D', !!g.player.vehicle);
    this.setWeapon(g.player.armed && !g.player.vehicle, g.player.ammo, g.player.reserve);
    this.district.textContent = this.map.districtFor(g.player.x, g.player.z);
    const marker = g.missions.marker;
    document.getElementById('navigation').textContent = marker ? `${marker.label} · ${Math.round(Math.hypot(marker.x - g.player.x, marker.z - g.player.z))} m` : 'Explore Marisol Bay';
    document.getElementById('pursuit').textContent = g.wanted.level ? (g.wanted.unseenFor > 2 ? 'SEARCHING · KEEP OUT OF SIGHT' : 'PURSUIT ACTIVE') : 'COAST CLEAR';
    this.setClock(g.clockMinutes);
    this.map.draw(g, dt);
    if (g.bigMapOpen) this.map.drawBig(g);

    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) this.dmg.style.opacity = '0';
    }

    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0 && this.lastSub) { this.subs.innerHTML = ''; this.lastSub = ''; }
    } else if (this.subQueue.length) {
      const item = this.subQueue.shift();
      const html = `${item.who ? `<span class="who">${item.who}</span>` : ''}${item.line}`;
      if (html !== this.lastSub) { this.subs.innerHTML = html; this.lastSub = html; }
      this.subTimer = item.seconds;
    }
  }
}
