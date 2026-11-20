// save.js — save / load for Velora Heat.
// Stores money, mission progress and best score in localStorage.
// No Three.js import here; this module is pure storage logic.

const KEY = 'velora-heat-save-v1';

// Read a field from the shared state defensively: try several names,
// fall back to the given default. The state object is owned by main.js,
// but other systems may carry the same values under different keys.
function read(state, names, fallback) {
  if (!state) return fallback;
  for (const name of names) {
    const value = state[name];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

// saveGame(state): persist money, mission index and best score.
// Returns true when the write succeeded, false when storage is
// unavailable (private mode, disabled storage, non-browser env).
export function saveGame(state) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const mission = read(state, ['mission', 'missionIndex'], 0);
    const missionIndex = typeof mission === 'object' && mission !== null
      ? read(mission, ['index', 'number'], 0)
      : mission;
    const data = {
      money: read(state, ['money'], 0),
      mission: missionIndex,
      finished: read(state, ['finished', 'storyComplete'], false) ? true : false,
      health: read(state, ['health'], 100),
      best: read(state, ['best', 'bestScore'], 0),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

// loadGame(): read the save back, or null when nothing is saved
// (or storage is unavailable / the data is corrupt).
export function loadGame() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      mission: typeof data.mission === 'number' ? data.mission : 0,
      finished: data.finished === true,
      health: typeof data.health === 'number' ? data.health : 100,
      best: typeof data.best === 'number' ? data.best : 0,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch (err) {
    return null;
  }
}
