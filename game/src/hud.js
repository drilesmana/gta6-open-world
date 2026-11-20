// hud.js — Velora Heat HUD.
// Manipulates the DOM elements defined in index.html. Because the exact
// element ids are owned by the page shell, every lookup tries several
// likely ids and, when nothing matches, creates a fallback element so the
// HUD still works. No Three.js import here; this module is pure DOM.

// Find an element by any of the given ids, or null.
function findEl(ids) {
  if (typeof document === 'undefined') return null;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// Find an element, or create a fallback div with the first id and a
// sensible class, appended to the body (or to the hud container).
function needEl(ids, cls) {
  const found = findEl(ids);
  if (found) return found;
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = ids[0];
  if (cls) el.className = cls;
  document.body.appendChild(el);
  return el;
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function showEl(el) {
  if (el) el.style.display = '';
}

function hideEl(el) {
  if (el) el.style.display = 'none';
}

// createHud(): no arguments. Returns the HUD controller.
export function createHud() {
  const healthEl = needEl(['health', 'hud-health', 'hp', 'health-bar'], 'hud-health');
  const moneyEl = needEl(['money', 'hud-money', 'cash'], 'hud-money');
  const wantedEl = needEl(['wanted', 'hud-wanted', 'wanted-stars', 'stars'], 'hud-wanted');
  const speedEl = needEl(['speed', 'hud-speed', 'speedo'], 'hud-speed');
  const objectiveEl = needEl(['objective', 'hud-objective', 'mission-objective'], 'hud-objective');
  const bannerEl = needEl(['message', 'banner', 'hud-message', 'message-banner'], 'hud-message');
  const titleEl = needEl(['title', 'title-screen', 'screen-title'], 'screen-title');
  const briefEl = needEl(['brief', 'brief-screen', 'mission-brief'], 'screen-brief');
  const finishEl = needEl(['finish', 'finish-screen', 'screen-finish'], 'screen-finish');
  // The game-HUD container (holds money/health/wanted/speed/objective/
  // minimap). It starts with class "hidden" in the page shell; it must
  // be un-hidden when play starts and re-hidden on the overlay screens.
  // findEl only — never create a second #hud.
  const hudEl = findEl(['hud', 'hud-container', 'game-hud']);

  let bannerTimer = null;

  function showHudContainer() {
    if (hudEl) {
      hudEl.classList.remove('hidden');
      hudEl.style.display = '';
    }
  }

  function hideHudContainer() {
    if (hudEl) hudEl.classList.add('hidden');
  }

  function hideScreens() {
    hideEl(titleEl);
    hideEl(briefEl);
    hideEl(finishEl);
  }

  function setHealth(value) {
    const hp = Math.max(0, Math.min(100, Math.round(value)));
    setText(healthEl, 'HP ' + hp);
    if (healthEl) {
      healthEl.style.width = '';
      healthEl.dataset.value = String(hp);
    }
  }

  function setMoney(value) {
    setText(moneyEl, '$' + Math.round(value).toLocaleString('en-US'));
  }

  function setWanted(level) {
    const stars = Math.max(0, Math.min(5, Math.round(level)));
    let text = '';
    for (let i = 0; i < 5; i++) text += i < stars ? '★' : '☆';
    setText(wantedEl, text);
    if (wantedEl) wantedEl.dataset.value = String(stars);
  }

  // Alias used by some callers.
  function setWantedStars(level) {
    setWanted(level);
  }

  function setSpeed(mps) {
    const kmh = Math.round(Math.abs(mps) * 3.6);
    setText(speedEl, kmh + ' km/h');
  }

  function setObjective(text) {
    setText(objectiveEl, text || '');
  }

  function showMessage(text, ms) {
    setText(bannerEl, text || '');
    showEl(bannerEl);
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => hideEl(bannerEl), ms || 2600);
  }

  function showTitle() {
    hideScreens();
    hideHudContainer();
    showEl(titleEl);
  }

  function showBrief(title, text) {
    hideScreens();
    hideHudContainer();
    if (briefEl) {
      const titleNode = briefEl.querySelector('[data-brief-title]') || briefEl.querySelector('h2') || briefEl.querySelector('h1');
      const textNode = briefEl.querySelector('[data-brief-text]') || briefEl.querySelector('p');
      if (titleNode) titleNode.textContent = title || '';
      if (textNode) textNode.textContent = text || '';
      if (!titleNode && !textNode) briefEl.textContent = (title ? title + ' — ' : '') + (text || '');
    }
    showEl(briefEl);
  }

  function showFinish(stats) {
    hideScreens();
    hideHudContainer();
    if (finishEl) {
      const s = stats || {};
      const money = typeof s.money === 'number' ? s.money : 0;
      const missions = typeof s.missions === 'number' ? s.missions : 0;
      const textNode = finishEl.querySelector('[data-finish-text]') || finishEl.querySelector('p');
      const line = 'Story complete — ' + missions + '/4 missions, $' + Math.round(money).toLocaleString('en-US') + ' saved. Nia\u2019s garage is safe.';
      if (textNode) textNode.textContent = line;
      else if (!finishEl.querySelector('h1') && !finishEl.querySelector('h2')) finishEl.textContent = line;
    }
    showEl(finishEl);
  }

  // Hide every overlay screen (game is playing).
  function showGame() {
    hideScreens();
    showHudContainer();
    hideEl(bannerEl);
  }

  return {
    setHealth,
    setMoney,
    setWanted,
    setWantedStars,
    setSpeed,
    setObjective,
    showMessage,
    showTitle,
    showBrief,
    showFinish,
    showGame,
    hideScreens,
  };
}
