// Velora Heat — HUD (chunk 3, written from the spec only).
// createHud() takes no arguments and drives the DOM defined in index.html:
// health, money, wanted stars, speed, objective, message banner, title
// screen, mission brief screen and finish screen.
//
// The exact element ids live in another chunk's file, so this module looks
// each element up under many candidate ids (plus data-hud attributes) and,
// when an element is genuinely absent, builds a styled fallback element so
// the game still shows every HUD value. Nothing here throws.

const CANDIDATES = {
  // Leaf value ids first: writing textContent into a container id (e.g.
  // #money wrapping #money-value) would wipe its label/children.
  health: ['health-value', 'healthValue', 'hp', 'health', 'health-text'],
  healthFill: ['health-fill', 'healthFill', 'hud-health-fill', 'health-bar-fill', 'hp-fill'],
  healthBar: ['health-bar', 'healthBar', 'hud-health-bar', 'hp-bar'],
  money: ['money-value', 'moneyValue', 'cash-value', 'cashValue', 'money', 'hud-money', 'cash'],
  wanted: ['wanted-stars', 'wantedStars', 'wanted-value', 'wantedValue', 'stars', 'wanted', 'hud-wanted'],
  speed: ['speed-value', 'speedValue', 'speedometer', 'speed-text', 'speed', 'hud-speed'],
  objective: ['objective-text', 'objectiveText', 'mission-objective', 'missionObjective', 'current-objective', 'currentObjective', 'objective', 'hud-objective'],
  banner: ['message', 'banner', 'hud-banner', 'message-banner', 'messageBanner', 'toast', 'notification', 'hud-message'],
  title: ['title-screen', 'titleScreen', 'title', 'start-screen', 'startScreen', 'hud-title', 'title-overlay'],
  brief: ['brief-screen', 'briefScreen', 'brief', 'mission-brief', 'missionBrief', 'hud-brief', 'brief-overlay'],
  finish: ['finish-screen', 'finishScreen', 'finish', 'story-finish', 'end-screen', 'endScreen', 'game-over', 'complete-screen', 'hud-finish', 'finish-overlay'],
  hud: ['hud', 'hud-root', 'hud-container', 'ui', 'game-ui'],
};

const BUTTON_CANDIDATES = {
  start: ['start-button', 'startButton', 'start-btn', 'play-button', 'playButton', 'btn-start', 'title-start'],
  brief: ['continue-button', 'continueButton', 'brief-continue', 'begin-button', 'beginButton', 'btn-continue', 'brief-button'],
  finish: ['restart-button', 'restartButton', 'play-again', 'again-button', 'btn-restart', 'finish-restart', 'replay-button'],
};

function findOne(names) {
  if (typeof document === 'undefined') return null;
  for (const name of names) {
    const el = document.getElementById(name);
    if (el) return el;
  }
  return null;
}

function findByAttr(kind) {
  if (typeof document === 'undefined') return null;
  try {
    return document.querySelector('[data-hud="' + kind + '"]')
      || document.querySelector('[data-' + kind + ']');
  } catch (_err) {
    return null;
  }
}

function findScreen(kind) {
  return findOne(CANDIDATES[kind]) || findByAttr(kind);
}

function makeEl(tag, id, cssText, text) {
  const el = document.createElement(tag);
  if (id) el.id = id;
  el.style.cssText = cssText || '';
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

const INK = '#1d1a16';
const CREAM = '#fdf6e3';
const CORAL = '#ff6b5e';
const GOLD = '#f5b942';
const TEAL = '#2a9d8f';

function styleHudBar(el) {
  el.style.cssText = 'position:fixed;top:12px;left:12px;z-index:40;display:flex;flex-direction:column;gap:6px;font-family:system-ui,Arial,sans-serif;color:' + CREAM + ';pointer-events:none;';
}

function stylePill(el) {
  el.style.cssText = 'background:rgba(20,16,12,0.72);border:1px solid rgba(245,185,66,0.55);border-radius:8px;padding:6px 10px;font-size:14px;font-weight:600;letter-spacing:0.02em;width:max-content;max-width:46vw;';
}

function styleButton(el) {
  el.style.cssText = 'pointer-events:auto;cursor:pointer;background:' + CORAL + ';color:' + CREAM + ';border:none;border-radius:10px;padding:12px 28px;font-size:17px;font-weight:700;letter-spacing:0.04em;font-family:system-ui,Arial,sans-serif;';
}

function styleScreen(el, hidden) {
  el.style.cssText = 'position:fixed;inset:0;z-index:60;display:' + (hidden ? 'none' : 'flex') + ';flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(ellipse at center,rgba(40,26,10,0.88),rgba(12,8,5,0.96));color:' + CREAM + ';font-family:system-ui,Arial,sans-serif;text-align:center;padding:24px;';
}

export function createHud() {
  const doc = typeof document !== 'undefined' ? document : null;
  const callbacks = { start: null, brief: null, finish: null };
  let bannerTimer = null;
  let visibleScreen = null;

  const els = {};
  if (doc) {
    els.health = findOne(CANDIDATES.health) || findByAttr('health');
    els.healthFill = findOne(CANDIDATES.healthFill) || findByAttr('health-fill');
    els.healthBar = findOne(CANDIDATES.healthBar) || findByAttr('health-bar');
    els.money = findOne(CANDIDATES.money) || findByAttr('money');
    els.wanted = findOne(CANDIDATES.wanted) || findByAttr('wanted');
    els.speed = findOne(CANDIDATES.speed) || findByAttr('speed');
    els.objective = findOne(CANDIDATES.objective) || findByAttr('objective');
    els.banner = findOne(CANDIDATES.banner) || findByAttr('banner');
    els.title = findScreen('title');
    els.brief = findScreen('brief');
    els.finish = findScreen('finish');
    els.hudRoot = findOne(CANDIDATES.hud) || findByAttr('hud');
    // Sub-elements inside the shell's screens (title/brief/finish text
    // slots live under their own ids, not inside the screen element).
    els.briefTitle = doc.getElementById('brief-title');
    els.briefText = doc.getElementById('brief-text');
    els.briefObjective = doc.getElementById('brief-objective');
    els.briefReward = doc.getElementById('brief-reward');
    els.finishStats = doc.getElementById('finish-stats');
    els.finishSubtitle = doc.getElementById('finish-subtitle');
  }

  // Build fallback HUD values when the page shell did not define them.
  // Health counts as covered when either a text node or a fill bar
  // exists — do not duplicate a bar the shell already draws.
  const healthCovered = !!(els.health || els.healthFill);
  if (doc && (!healthCovered || !els.money || !els.wanted || !els.speed || !els.objective)) {
    let root = els.hudRoot;
    if (!root) {
      root = makeEl('div', 'vh-hud');
      styleHudBar(root);
      doc.body.appendChild(root);
      els.hudRoot = root;
    }
    if (!healthCovered) {
      const bar = makeEl('div', 'vh-health-bar');
      bar.style.cssText = 'background:rgba(20,16,12,0.72);border:1px solid rgba(245,185,66,0.55);border-radius:8px;padding:6px 10px;width:170px;';
      const fill = makeEl('div', 'vh-health-fill');
      fill.style.cssText = 'height:10px;border-radius:5px;background:' + TEAL + ';width:100%;';
      const label = makeEl('div', 'vh-health', '', 'HP 100');
      label.style.cssText = 'font-size:12px;font-weight:700;margin-top:4px;';
      bar.appendChild(fill);
      bar.appendChild(label);
      root.appendChild(bar);
      els.healthBar = bar;
      els.healthFill = fill;
      els.health = label;
    }
    if (!els.money) {
      els.money = makeEl('div', 'vh-money', '', '$0');
      stylePill(els.money);
      root.appendChild(els.money);
    }
    if (!els.wanted) {
      els.wanted = makeEl('div', 'vh-wanted', '', '☆☆☆☆☆');
      stylePill(els.wanted);
      els.wanted.style.color = GOLD;
      root.appendChild(els.wanted);
    }
    if (!els.speed) {
      els.speed = makeEl('div', 'vh-speed', '', '0 km/h');
      stylePill(els.speed);
      root.appendChild(els.speed);
    }
    if (!els.objective) {
      els.objective = makeEl('div', 'vh-objective', '', '');
      els.objective.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:40;background:rgba(20,16,12,0.72);border:1px solid rgba(245,185,66,0.55);border-radius:8px;padding:8px 14px;font-size:14px;font-weight:600;color:' + CREAM + ';font-family:system-ui,Arial,sans-serif;max-width:60vw;text-align:center;pointer-events:none;';
      doc.body.appendChild(els.objective);
    }
  }

  if (doc && !els.banner) {
    els.banner = makeEl('div', 'vh-banner', '', '');
    els.banner.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:50;display:none;background:' + GOLD + ';color:' + INK + ';border-radius:8px;padding:10px 18px;font-size:16px;font-weight:700;font-family:system-ui,Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.45);max-width:80vw;text-align:center;';
    doc.body.appendChild(els.banner);
  }

  // Fallback screens when the page shell did not define them.
  function ensureScreen(kind, build) {
    if (els[kind]) return els[kind];
    const el = makeEl('div', 'vh-' + kind + '-screen');
    styleScreen(el, true);
    build(el);
    doc.body.appendChild(el);
    els[kind] = el;
    return el;
  }

  if (doc) {
    ensureScreen('title', (el) => {
      const h = makeEl('div', null, 'font-size:56px;font-weight:900;letter-spacing:0.06em;color:' + GOLD + ';', 'VELORA HEAT');
      const sub = makeEl('div', null, 'font-size:18px;opacity:0.9;max-width:520px;', 'Dario must save his sister Nia\u2019s garage from debt. Drive, steal, outrun the law — and pull off the big score.');
      const btn = makeEl('button', 'vh-start-button', '', 'START ENGINE');
      styleButton(btn);
      btn.addEventListener('click', () => { if (callbacks.start) callbacks.start(); });
      const hint = makeEl('div', null, 'font-size:13px;opacity:0.75;', 'WASD drive / walk \u00b7 E enter or leave a car \u00b7 Shift run \u00b7 Space handbrake \u00b7 Enter to start');
      el.appendChild(h);
      el.appendChild(sub);
      el.appendChild(btn);
      el.appendChild(hint);
      els.startButton = btn;
    });
    ensureScreen('brief', (el) => {
      const t = makeEl('div', 'vh-brief-title', 'font-size:30px;font-weight:800;color:' + GOLD + ';', '');
      const b = makeEl('div', 'vh-brief-text', 'font-size:17px;max-width:560px;line-height:1.5;', '');
      const o = makeEl('div', 'vh-brief-objective', 'font-size:15px;font-weight:700;color:' + TEAL + ';', '');
      const r = makeEl('div', 'vh-brief-reward', 'font-size:15px;font-weight:700;', '');
      const btn = makeEl('button', 'vh-brief-button', '', 'LET\u2019S GO');
      styleButton(btn);
      btn.addEventListener('click', () => { if (callbacks.brief) callbacks.brief(); });
      el.appendChild(t);
      el.appendChild(b);
      el.appendChild(o);
      el.appendChild(r);
      el.appendChild(btn);
      els.briefTitle = t;
      els.briefText = b;
      els.briefObjective = o;
      els.briefReward = r;
      els.briefButton = btn;
    });
    ensureScreen('finish', (el) => {
      const h = makeEl('div', null, 'font-size:40px;font-weight:900;color:' + GOLD + ';', 'THE GARAGE IS SAVED');
      const s = makeEl('div', 'vh-finish-stats', 'font-size:18px;line-height:1.7;max-width:560px;', '');
      const btn = makeEl('button', 'vh-finish-button', '', 'PLAY AGAIN');
      styleButton(btn);
      btn.addEventListener('click', () => { if (callbacks.finish) callbacks.finish(); });
      el.appendChild(h);
      el.appendChild(s);
      el.appendChild(btn);
      els.finishStats = s;
      els.finishButton = btn;
    });
  }

  // Wire buttons that already exist in the page shell.
  function wireButton(kind, names, cbKey) {
    if (!doc) return;
    const btn = findOne(names) || els[cbKey + 'Button'];
    if (!btn) return;
    els[cbKey + 'Button'] = btn;
    btn.addEventListener('click', () => { if (callbacks[cbKey]) callbacks[cbKey](); });
  }
  wireButton('start', BUTTON_CANDIDATES.start, 'start');
  wireButton('brief', BUTTON_CANDIDATES.brief, 'brief');
  wireButton('finish', BUTTON_CANDIDATES.finish, 'finish');

  // Enter key advances whichever screen is showing.
  if (doc) {
    doc.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      if (visibleScreen === 'title' && callbacks.start) callbacks.start();
      else if (visibleScreen === 'brief' && callbacks.brief) callbacks.brief();
      else if (visibleScreen === 'finish' && callbacks.finish) callbacks.finish();
    });
  }

  function showOnly(kind) {
    const screens = { title: els.title, brief: els.brief, finish: els.finish };
    for (const key of Object.keys(screens)) {
      const el = screens[key];
      if (!el) continue;
      const show = key === kind;
      el.style.display = show ? 'flex' : 'none';
      // The shell hides screens with a `hidden` class whose CSS beats an
      // inline display value — keep the class in sync with the display.
      if (el.classList) {
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    }
    visibleScreen = kind;
  }

  function hideScreens() {
    for (const key of ['title', 'brief', 'finish']) {
      if (els[key]) {
        els[key].style.display = 'none';
        if (els[key].classList) els[key].classList.add('hidden');
      }
    }
    visibleScreen = null;
  }

  function moneyText(v) {
    const n = Math.round(Number(v) || 0);
    return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return {
    els,
    setHealth(value, max) {
      const v = Math.max(0, Math.round(Number(value) || 0));
      const m = Math.max(1, Math.round(Number(max) || 100));
      const pct = Math.max(0, Math.min(100, (v / m) * 100));
      if (els.healthFill) els.healthFill.style.width = pct + '%';
      if (els.healthFill) els.healthFill.style.background = pct > 50 ? TEAL : (pct > 25 ? GOLD : CORAL);
      if (els.health) els.health.textContent = 'HP ' + v;
      if (els.healthBar) els.healthBar.setAttribute('aria-valuenow', String(v));
    },
    setMoney(value) {
      if (els.money) els.money.textContent = moneyText(value);
    },
    setWanted(stars) {
      const n = Math.max(0, Math.min(5, Math.round(Number(stars) || 0)));
      if (els.wanted) els.wanted.textContent = '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
      if (els.wanted) els.wanted.style.color = n === 0 ? CREAM : (n < 3 ? GOLD : CORAL);
    },
    setSpeed(kmh) {
      const v = Math.max(0, Math.round(Number(kmh) || 0));
      // The page shell already prints a static "km/h" unit next to the
      // value span — writing the unit again would double it. Only the
      // fallback element built here carries its own unit.
      if (els.speed) {
        const mine = els.speed.id && els.speed.id.indexOf('vh-') === 0;
        els.speed.textContent = mine ? v + ' km/h' : String(v);
      }
    },
    setObjective(text) {
      if (els.objective) els.objective.textContent = text || '';
    },
    showBanner(text, ms) {
      if (!els.banner) return;
      els.banner.textContent = text || '';
      els.banner.style.display = text ? 'block' : 'none';
      if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
      if (text) {
        bannerTimer = setTimeout(() => { els.banner.style.display = 'none'; }, ms || 2600);
      }
    },
    showTitle() { showOnly('title'); },
    showBrief(mission) {
      const m = mission || {};
      if (els.briefTitle) els.briefTitle.textContent = m.title || 'Next job';
      // When the shell has no dedicated objective/reward slots, fold them
      // into the brief text so the player still sees them.
      let briefText = m.brief || '';
      if (els.briefText) {
        if (!els.briefObjective && m.objective) briefText += '\nObjective: ' + m.objective;
        if (!els.briefReward && m.reward) briefText += '\nReward: ' + moneyText(m.reward);
        els.briefText.textContent = briefText;
      }
      if (els.briefObjective) els.briefObjective.textContent = m.objective ? ('Objective: ' + m.objective) : '';
      if (els.briefReward) els.briefReward.textContent = m.reward ? ('Reward: ' + moneyText(m.reward)) : '';
      // If the page shell's brief screen has its own text slots, fill them too.
      if (doc && els.brief && !els.briefTitle) {
        const t = els.brief.querySelector('[data-brief-title], .brief-title, h1, h2');
        if (t) t.textContent = m.title || 'Next job';
        const b = els.brief.querySelector('[data-brief-text], .brief-text, p');
        if (b) b.textContent = m.brief || '';
      }
      showOnly('brief');
    },
    showFinish(stats) {
      const s = stats || {};
      const lines = [];
      lines.push('Story complete — Nia\u2019s garage is safe.');
      if (typeof s.money === 'number') lines.push('Money: ' + moneyText(s.money));
      if (typeof s.bestScore === 'number') lines.push('Best score: ' + moneyText(s.bestScore));
      if (typeof s.missionsDone === 'number') lines.push('Missions finished: ' + s.missionsDone + ' / 4');
      if (typeof s.timePlayed === 'number') {
        const mins = Math.floor(s.timePlayed / 60);
        const secs = Math.floor(s.timePlayed % 60);
        lines.push('Time: ' + mins + 'm ' + String(secs).padStart(2, '0') + 's');
      }
      if (els.finishStats) els.finishStats.innerHTML = lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
      else if (doc && els.finish) {
        const p = els.finish.querySelector('p, [data-finish-stats]');
        if (p) p.textContent = lines.join('  ');
      }
      showOnly('finish');
    },
    hideScreens,
    onStart(cb) { callbacks.start = cb; },
    onBrief(cb) { callbacks.brief = cb; },
    onFinish(cb) { callbacks.finish = cb; },
    // Back-compat alias names main.js may use.
    onContinue(cb) { callbacks.brief = cb; },
    onRestart(cb) { callbacks.finish = cb; },
    currentScreen() { return visibleScreen; },
  };
}
