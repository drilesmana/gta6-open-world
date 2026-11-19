// Velora Heat — HUD: money, wanted stars, objective, health, speed, prompts,
// toasts and subtitles. Pure DOM over the canvas; the minimap is its own
// canvas module. All ids live in index.html.
export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'money', 'stars', 'objective', 'objective-text', 'objective-sub', 'hp', 'speedo',
      'speed', 'gear', 'prompt', 'toasts', 'subs', 'district', 'saveDot', 'escapeWrap', 'escape',
      'pursuit', 'clock', 'dmg', 'hud',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.starSpans = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      this.el.stars.appendChild(s);
      this.starSpans.push(s);
    }
    this.toastTimer = null;
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }

  setMoney(cash) {
    this.el.money.textContent = cash.toLocaleString('en-US');
  }

  setStars(level, escape01) {
    this.starSpans.forEach((s, i) => s.classList.toggle('on', i < level));
    this.el.stars.classList.toggle('flash', level > 0 && escape01 > 0.5);
    this.el.escapeWrap.classList.toggle('hidden', level === 0);
    if (level > 0) this.el.escape.style.width = `${Math.round(escape01 * 100)}%`;
    this.el.pursuit.textContent = level === 0 ? 'COAST CLEAR'
      : level <= 2 ? 'POLICE ON YOU' : level <= 3 ? 'PURSUIT' : 'FULL HEAT';
  }

  setHealth(hp) {
    this.el.hp.firstElementChild.style.width = `${Math.round(hp)}%`;
  }

  setSpeed(kmh, driving) {
    this.el.speedo.classList.toggle('hidden', !driving);
    if (driving) {
      this.el.speed.textContent = Math.round(kmh);
      // Real gears by speed band, so the speedo reads like a car, not a switch.
      this.el.gear.textContent = kmh < 1 ? 'P'
        : kmh < 25 ? '1' : kmh < 50 ? '2' : kmh < 80 ? '3' : kmh < 110 ? '4' : '5';
    }
  }

  setObjective(head, text, sub = '') {
    this.el.objective.classList.remove('hidden');
    this.el.objective.querySelector('#objective-head').textContent = head;
    this.el['objective-text'].textContent = text;
    this.el['objective-sub'].textContent = sub;
  }

  hideObjective() {
    this.el.objective.classList.add('hidden');
  }

  setDistrict(name) {
    this.el.district.textContent = name;
  }

  setClock(text) {
    this.el.clock.textContent = text;
  }

  prompt(html) {
    if (!html) {
      this.el.prompt.classList.add('hidden');
      return;
    }
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  subtitle(who, text, ms = 4200) {
    const s = this.el.subs;
    s.innerHTML = `<span class="who">${who}</span>${text}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      s.innerHTML = '';
    }, ms);
  }

  damageFlash(strength01) {
    this.el.dmg.style.opacity = String(strength01);
  }

  saveFlash() {
    this.el.saveDot.textContent = '· SAVED';
    setTimeout(() => {
      this.el.saveDot.textContent = '';
    }, 1800);
  }
}
