// Velora Heat — save system (chunk 3, written from the spec only).
// Persists money, mission progress and best score to localStorage.
// No imports. Every call is guarded: a missing or blocked localStorage
// must never throw into the game loop.

const SAVE_KEY = 'velora-heat-save-v1';

function readStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (_err) {
    return null;
  }
}

export function saveGame(state) {
  const store = readStorage();
  if (!store || !state) return false;
  const missionIndex = typeof state.mission === 'number'
    ? state.mission
    : (state.missions && typeof state.missions.currentIndex === 'number'
      ? state.missions.currentIndex
      : 0);
  const data = {
    version: 1,
    money: typeof state.money === 'number' ? Math.round(state.money) : 0,
    mission: missionIndex,
    missionIndex,
    bestScore: typeof state.bestScore === 'number' ? Math.round(state.bestScore) : 0,
    health: typeof state.health === 'number' ? Math.round(state.health) : 100,
    finished: !!state.finished,
    savedAt: Date.now(),
  };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (_err) {
    return false;
  }
}

export function loadGame() {
  const store = readStorage();
  if (!store) return null;
  let raw = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch (_err) {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      mission: typeof data.mission === 'number'
        ? data.mission
        : (typeof data.missionIndex === 'number' ? data.missionIndex : 0),
      missionIndex: typeof data.missionIndex === 'number'
        ? data.missionIndex
        : (typeof data.mission === 'number' ? data.mission : 0),
      bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
      health: typeof data.health === 'number' ? data.health : 100,
      finished: !!data.finished,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch (_err) {
    return null;
  }
}

export function clearSave() {
  const store = readStorage();
  if (!store) return false;
  try {
    store.removeItem(SAVE_KEY);
    return true;
  } catch (_err) {
    return false;
  }
}
