// Velora Heat — save / load.
// Progress (cash, mission index, completed jobs, health, position) lives in
// localStorage under one key. Saving happens on mission complete, on banking
// cash and every 30 seconds of play. Loading is explicit: the title screen
// offers Continue when a save exists.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // Sanitize: an old or hand-edited save must not break the game.
    // Cash stays a non-negative number, health stays in range, and the
    // position falls back to the garage start when it is not finite.
    const clean = { ...data };
    clean.cash = Number.isFinite(+data.cash) ? Math.max(0, +data.cash) : 0;
    clean.missionIndex = Number.isFinite(+data.missionIndex) ? Math.max(0, Math.floor(+data.missionIndex)) : 0;
    clean.health = Number.isFinite(+data.health) ? Math.min(100, Math.max(1, +data.health)) : 100;
    if (!Number.isFinite(+data.x) || !Number.isFinite(+data.z)) {
      clean.x = -26;
      clean.z = 150;
    }
    return clean;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode): the game still plays.
  }
}
