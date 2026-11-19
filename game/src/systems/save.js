// Progress in localStorage: money, chapter, unlocked jobs, collected cases, statistics and where
// the player stood. One slot, versioned, and forgiving of a hand-edited or older file.

const KEY = 'marisol-heat.save.v1';

export const EMPTY = {
  v: 1,
  chapter: 0,
  cash: 0,
  armed: false,
  ammo: 0,
  reserve: 0,
  collected: [],
  stats: { driven: 0, walked: 0, wrecks: 0, busted: 0, kills: 0, earned: 0, jobsDone: 0, best: 0, time: 0 },
  pos: { x: -96, z: -96, heading: 0.6 },
  origin: 'garage',
  finished: false,
  savedAt: 0,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    if (!Number.isFinite(data.cash) || !Number.isInteger(data.chapter) || data.chapter < 0 || data.chapter > 3) return null;
    if (!Number.isFinite(data.pos?.x) || !Number.isFinite(data.pos?.z)) return null;
    // A hand-edited file cannot strand the player outside the map or with a negative wallet.
    data.cash = Math.max(0, Math.min(9_999_999, Math.round(data.cash)));
    data.pos.x = Math.max(-240, Math.min(240, data.pos.x));
    data.pos.z = Math.max(-240, Math.min(295, data.pos.z));
    // Statistics from an older build may be missing or non-numeric; a HUD reading NaN is worse
    // than a zero, so every counter is coerced.
    const stats = { ...EMPTY.stats, ...(data.stats ?? {}) };
    for (const k of Object.keys(EMPTY.stats)) if (!Number.isFinite(stats[k])) stats[k] = 0;
    return {
      ...structuredClone(EMPTY),
      ...data,
      armed: !!data.armed,
      finished: !!data.finished,
      chapter: Math.min(3, data.chapter),
      stats,
      // An invalid orientation can poison the camera even when the position is valid.
      pos: { x: data.pos.x, z: data.pos.z, heading: Number.isFinite(data.pos.heading) ? data.pos.heading : EMPTY.pos.heading },
      collected: Array.isArray(data.collected) ? data.collected.filter(Number.isInteger) : [],
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    return true;
  } catch {
    // Private mode or a full quota: the run goes on unwritten rather than throwing.
    return false;
  }
}

// How long ago the slot was written, in minutes, for the title screen's line under Continue.
export function saveAge() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const at = JSON.parse(raw)?.savedAt;
    if (!Number.isFinite(at)) return null;
    return Math.max(0, Math.round((Date.now() - at) / 60000));
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* private mode: nothing to clear */ }
}
