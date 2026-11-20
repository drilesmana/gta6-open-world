// missions.js — Velora Heat mission system.
// Four missions in order: First Fare, The Package, Lose the Heat,
// The Big Score. Dario must save his sister Nia's garage from debt.
// Reads the shared game state; never imports Three.js here (positions
// are plain {x, z} pairs, converted defensively from whatever the
// player/city objects carry).

import { CONFIG } from './config.js';

// Try several dotted paths on an object, return the first defined value.
function tun(obj, paths, fallback) {
  if (!obj) return fallback;
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur === null || cur === undefined || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return fallback;
}

// Normalise a position to {x, z}.
function pos2(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: p[0], z: p[1] };
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, z: p.y };
  return null;
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// createMissions(state): state is the shared game state object with
// fields player, car, wanted, money, health, mission, finished, and
// (attached by main.js) city, police, driving, goldCar.
export function createMissions(state) {
  const rewards = tun(CONFIG, ['missions.rewards'], [120, 180, 250, 500]);
  const reach = tun(CONFIG, ['missions.reach', 'missionReach', 'reachRadius'], 9);
  // City half-size derives from the block grid (blocks * blockSize / 2).
  const half = (tun(CONFIG, ['city.blocks'], 5) * tun(CONFIG, ['city.blockSize'], 80)) / 2;

  // ---- Derive the map points from the city object, defensively. ----
  const city = tun(state, ['city'], null);
  const start = pos2(tun(city, ['playerStart', 'playerSpawn', 'start'], null)) || { x: 0, z: 0 };
  // Nia's garage has an explicit spot in CONFIG; fall back to the start.
  const garage = {
    x: tun(CONFIG, ['garage.x'], start.x),
    z: tun(CONFIG, ['garage.z'], start.z),
  };

  // A far corner across town, for the fare drop-off.
  const farCorner = { x: half * 0.8, z: -half * 0.8 };
  // A mid-town point for the package pickup.
  const midTown = { x: -half * 0.45, z: half * 0.4 };
  // A delivery point on the far side.
  const farSide = { x: half * 0.7, z: half * 0.65 };

  // Prefer real road/car-spawn points when the city exposes them.
  function farPointFromRoads() {
    const roads = tun(city, ['roads', 'segments', 'roadNetwork'], null);
    if (!Array.isArray(roads) || roads.length === 0) return null;
    let best = null;
    let bestD = -1;
    for (const seg of roads) {
      const a = pos2(tun(seg, ['start', 'a', 'from'], null) || seg);
      const b = pos2(tun(seg, ['end', 'b', 'to'], null) || seg);
      for (const p of [a, b]) {
        if (!p) continue;
        const d = dist2(p, start);
        if (d > bestD) { bestD = d; best = p; }
      }
    }
    return best;
  }

  function spawnPoint() {
    const spawns = tun(city, ['carSpawns', 'carSpawnPoints', 'spawns', 'carSpawns'], null);
    if (Array.isArray(spawns) && spawns.length > 0) {
      const p = pos2(spawns[Math.floor(spawns.length / 2)]) || pos2(spawns[0]);
      if (p) return p;
    }
    return { x: half * 0.3, z: -half * 0.3 };
  }

  const fareTarget = farPointFromRoads() || farCorner;
  const goldSpot = spawnPoint();

  const defs = [
    {
      id: 'first-fare',
      title: 'First Fare',
      brief: 'Nia\u2019s garage is behind on rent. Take a fare across town and earn your first dollars.',
      objective: 'Drive the fare across town to the gold marker.',
      target: fareTarget,
      reward: rewards[0] !== undefined ? rewards[0] : 120,
      needCar: true,
    },
    {
      id: 'the-package',
      title: 'The Package',
      brief: 'A client needs a package moved quietly. Pick it up on foot, then deliver it by car. Keep a low profile.',
      objective: 'Walk to the pickup point.',
      target: midTown,
      reward: rewards[1] !== undefined ? rewards[1] : 180,
      needCar: false,
      stages: [
        { objective: 'Walk to the pickup point.', target: midTown, needCar: false },
        { objective: 'Deliver the package to the far marker.', target: farSide, needCar: true },
      ],
    },
    {
      id: 'lose-the-heat',
      title: 'Lose the Heat',
      brief: 'The police are on to you. Break the pursuit and get your wanted level back to zero.',
      objective: 'Escape the police — get your wanted level to zero.',
      target: garage,
      reward: rewards[2] !== undefined ? rewards[2] : 250,
      needCar: false,
    },
    {
      id: 'the-big-score',
      title: 'The Big Score',
      brief: 'The gold Aurelio GT is parked uptown. Steal it and bring it home to the garage — that car clears the debt.',
      objective: 'Steal the gold Aurelio GT.',
      target: goldSpot,
      reward: rewards[3] !== undefined ? rewards[3] : 500,
      needCar: false,
      stages: [
        { objective: 'Steal the gold Aurelio GT.', target: goldSpot, needCar: false },
        { objective: 'Bring the gold Aurelio GT back to the garage.', target: garage, needCar: true, needGold: true },
      ],
    },
  ];

  const sys = {
    missions: defs,
    index: 0,
    current: defs[0],
    target: defs[0].target,
    finished: false,
    storyComplete: false,
    stage: 0,
    started: false,
    heatOn: false,
    lastCompleted: null,
    advance,
    update,
  };

  function playerPos() {
    const player = tun(state, ['player'], null);
    if (!player) return null;
    return pos2(tun(player, ['position', 'pos'], null) || player);
  }

  function isDriving() {
    const player = tun(state, ['player'], null);
    if (player) {
      const d = tun(player, ['driving'], null);
      if (typeof d === 'boolean') return d;
      if (tun(player, ['currentCar'], null)) return true;
    }
    return !!tun(state, ['car'], null);
  }

  function currentCar() {
    const player = tun(state, ['player'], null);
    if (player) {
      const c = tun(player, ['currentCar', 'car'], null);
      if (c) return c;
    }
    return tun(state, ['car'], null);
  }

  function isGoldCar() {
    const goldCar = tun(state, ['goldCar'], null);
    const car = currentCar();
    if (!car) return false;
    if (goldCar && car === goldCar) return true;
    const kind = tun(car, ['kind', 'type'], '');
    const colour = tun(car, ['colour', 'color'], '');
    return kind === 'gold' || colour === 'gold' || colour === 'golden';
  }

  function wantedLevel() {
    const w = tun(state, ['wanted'], null);
    if (typeof w === 'number') return w;
    const police = tun(state, ['police'], null);
    if (police) {
      const pw = tun(police, ['wanted'], null);
      if (typeof pw === 'number') return pw;
    }
    return 0;
  }

  function escapeProgress() {
    const police = tun(state, ['police'], null);
    if (police) {
      const ep = tun(police, ['escapeProgress', 'escape'], null);
      if (typeof ep === 'number') return ep;
    }
    return tun(state, ['escapeProgress'], 0);
  }

  function raiseWanted(level) {
    const police = tun(state, ['police'], null);
    if (police && typeof police.raiseWanted === 'function') {
      police.raiseWanted(level);
      return;
    }
    state.wanted = level;
  }

  // advance(): complete the current mission, pay the reward, move on.
  // Returns the completed mission, or null when already finished.
  function advance() {
    if (sys.finished) return null;
    const done = sys.current;
    const reward = done.reward || 0;
    state.money = (typeof state.money === 'number' ? state.money : 0) + reward;
    sys.lastCompleted = done;
    sys.index += 1;
    sys.stage = 0;
    sys.started = false;
    sys.heatOn = false;
    if (sys.index >= defs.length) {
      sys.finished = true;
      sys.storyComplete = true;
      sys.current = null;
      sys.target = null;
    } else {
      sys.current = defs[sys.index];
      sys.target = sys.current.target;
    }
    return done;
  }

  // update(dt): check the current objective; advance when met.
  // Returns the mission completed this frame, or null.
  function update(dt) {
    if (sys.finished || !sys.current) return null;
    const p = playerPos();
    const cur = sys.current;

    // Mission 3 setup: the heat starts the moment the mission begins.
    if (cur.id === 'lose-the-heat' && !sys.started) {
      sys.started = true;
      if (wantedLevel() < 2) raiseWanted(2);
    }

    // Two-stage missions: advance the stage, not the mission.
    if (cur.stages && sys.stage < cur.stages.length) {
      const stageDef = cur.stages[sys.stage];
      const target = stageDef.needGold
        ? (pos2(tun(tun(state, ['goldCar'], null), ['position', 'pos'], null)) || cur.target)
        : stageDef.target;
      sys.target = target;
      cur.objective = stageDef.objective;
      if (p && target && dist2(p, target) <= reach) {
        if (stageDef.needCar && !isDriving()) return null;
        if (stageDef.needGold && !isGoldCar()) return null;
        sys.stage += 1;
        if (sys.stage >= cur.stages.length) return advance();
        const next = cur.stages[sys.stage];
        cur.objective = next.objective;
        sys.target = next.target;
        return null;
      }
      return null;
    }

    // Single-stage missions.
    const target = cur.id === 'the-big-score'
      ? (pos2(tun(tun(state, ['goldCar'], null), ['position', 'pos'], null)) || cur.target)
      : cur.target;
    sys.target = target;

    if (cur.id === 'lose-the-heat') {
      // The heat must actually have been on before an escape counts.
      // Otherwise the mission auto-completes on its first frame, before
      // the wanted raise has propagated to the shared state.
      if (wantedLevel() >= 2) sys.heatOn = true;
      if (sys.heatOn && wantedLevel() <= 0) return advance();
      return null;
    }

    if (p && target && dist2(p, target) <= reach) {
      if (cur.needCar && !isDriving()) return null;
      return advance();
    }
    return null;
  }

  return sys;
}
