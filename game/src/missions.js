// Velora Heat — missions (chunk 3, written from the spec only).
// createMissions(state) owns the four-mission story: First Fare, The
// Package, Lose the Heat, The Big Score. Each mission has a title, a brief,
// an objective, a target point and a reward. The system exposes the current
// mission, an advance step, the story completion flag and an update that
// checks the objective every frame.
//
// Target points are picked from whatever the city object exposes (road
// ends, car spawns, sidewalk waypoints, player start) under several
// candidate key names, with numeric fallbacks from the city size, so the
// missions work without knowing another chunk's exact key names.

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toXZ(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return { x: num(p[0], 0), z: num(p[1], 0) };
  if (typeof p === 'object') {
    if (typeof p.x === 'number' || typeof p.z === 'number') {
      return { x: num(p.x, 0), z: num(p.z, 0) };
    }
    if (p.position) return toXZ(p.position);
    if (p.mesh && p.mesh.position) return toXZ(p.mesh.position);
    if (p.group && p.group.position) return toXZ(p.group.position);
  }
  return null;
}

function firstKey(obj, names) {
  if (!obj) return undefined;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function readPlayerPos(state) {
  if (state.playerPos) return toXZ(state.playerPos);
  const p = state.player;
  if (!p) return null;
  if (p.position) return toXZ(p.position);
  if (typeof p.getPosition === 'function') {
    try { return toXZ(p.getPosition()); } catch (_err) { return null; }
  }
  return toXZ(p);
}

function readWanted(state) {
  if (typeof state.wanted === 'number') return state.wanted;
  const pol = state.police;
  if (pol) {
    if (typeof pol.wanted === 'number') return pol.wanted;
    if (typeof pol.wantedLevel === 'number') return pol.wantedLevel;
    if (typeof pol.stars === 'number') return pol.stars;
    if (typeof pol.level === 'number') return pol.level;
    if (typeof pol.getWanted === 'function') {
      try { return num(pol.getWanted(), 0); } catch (_err) { return 0; }
    }
  }
  return 0;
}

function isDriving(state) {
  if (state.car) return true;
  const p = state.player;
  if (!p) return false;
  if (p.driving === true || p.isDriving === true || p.inCar === true) return true;
  if (typeof p.isDriving === 'function') {
    try { return !!p.isDriving(); } catch (_err) { return false; }
  }
  return false;
}

export function createMissions(state) {
  const cfg = state.config || state.CONFIG || {};
  const city = state.city || null;

  // City half-extent. CONFIG.citySize is the FULL width (640 -> +/-320,
  // confirmed by the road network spanning +/-320), so halve it. Refined
  // below from the actual collected points so targets never land outside
  // the drivable city.
  let half = (() => {
    const v = firstKey(cfg, ['citySize', 'city_size', 'worldSize', 'mapSize', 'size']);
    if (typeof v === 'number' && v > 0) return v / 2;
    const hv = firstKey(cfg, ['halfSize', 'cityHalf', 'cityHalfSize']);
    if (typeof hv === 'number' && hv > 0) return hv;
    if (city) {
      const cv = firstKey(city, ['size', 'halfSize', 'worldSize']);
      if (typeof cv === 'number' && cv > 0) return cv / 2;
    }
    return 200;
  })();

  const rewards = (() => {
    const r = firstKey(cfg, ['missionRewards', 'rewards', 'missionReward']);
    if (Array.isArray(r) && r.length >= 4) return r.map((x) => num(x, 500));
    if (r && typeof r === 'object') {
      return [
        num(r.firstFare, 500), num(r.package, 800),
        num(r.loseHeat, 1200), num(r.bigScore, 5000),
      ];
    }
    return [500, 800, 1200, 5000];
  })();

  // ---- collect candidate target points from the city -------------------
  function collectPoints() {
    const pts = [];
    const seen = new Set();
    const push = (p) => {
      const q = toXZ(p);
      if (!q) return;
      const key = Math.round(q.x / 5) + ':' + Math.round(q.z / 5);
      if (seen.has(key)) return;
      seen.add(key);
      pts.push(q);
    };
    if (city) {
      const spawns = firstKey(city, ['carSpawns', 'carSpawnPoints', 'spawns', 'spawnPoints', 'parkingSpots']);
      if (Array.isArray(spawns)) spawns.forEach(push);
      const roads = firstKey(city, ['roads', 'roadNetwork', 'segments', 'network', 'roadSegments']);
      if (Array.isArray(roads)) {
        for (const seg of roads) {
          if (!seg) continue;
          push(firstKey(seg, ['start', 'from', 'a']));
          push(firstKey(seg, ['end', 'to', 'b']));
        }
      }
      const ways = firstKey(city, ['waypoints', 'sidewalkWaypoints', 'pedestrianWaypoints', 'walkPoints']);
      if (Array.isArray(ways)) ways.forEach(push);
      push(firstKey(city, ['playerStart', 'start', 'startPoint', 'spawn', 'playerSpawn']));
    }
    return pts;
  }

  const startPoint = (() => {
    if (city) {
      const p = toXZ(firstKey(city, ['playerStart', 'start', 'startPoint', 'spawn', 'playerSpawn']));
      if (p) return p;
    }
    return { x: 0, z: 0 };
  })();

  const points = collectPoints();
  // Refine the half-extent from the real city points (roads reach +/-320);
  // never trust the config number alone for target placement.
  if (points.length > 0) {
    let m = 0;
    for (const p of points) m = Math.max(m, Math.abs(p.x), Math.abs(p.z));
    if (m > 20) half = Math.min(half, m);
  }
  // Clamp any target inside the drivable city (the driving controller
  // clamps the car to about +/-314; a target beyond that can never be
  // reached while driving).
  const clampPoint = (p) => {
    const b = half * 0.95;
    return { x: Math.max(-b, Math.min(b, p.x)), z: Math.max(-b, Math.min(b, p.z)) };
  };
  function farFrom(ref, minDist, exclude) {
    let best = null;
    let bestD = -1;
    for (const p of points) {
      if (exclude && exclude.some((e) => dist2D(p, e) < 10)) continue;
      const d = dist2D(p, ref);
      if (d >= minDist && d > bestD) { best = p; bestD = d; }
    }
    if (best) return best;
    // Numeric fallback: a far corner of the city grid.
    const cands = [
      { x: half * 0.8, z: -half * 0.8 },
      { x: -half * 0.8, z: half * 0.8 },
      { x: half * 0.8, z: half * 0.8 },
      { x: -half * 0.8, z: -half * 0.8 },
      { x: 0, z: -half * 0.85 },
      { x: half * 0.85, z: 0 },
    ];
    for (const c of cands) {
      if (exclude && exclude.some((e) => dist2D(c, e) < 10)) continue;
      if (dist2D(c, ref) >= minDist * 0.5) return c;
    }
    return cands[0];
  }
  function near(ref, targetDist) {
    let best = null;
    let bestDiff = Infinity;
    for (const p of points) {
      const d = dist2D(p, ref);
      const diff = Math.abs(d - targetDist);
      if (diff < bestDiff) { best = p; bestDiff = diff; }
    }
    return best || clampPoint({ x: ref.x + targetDist, z: ref.z });
  }

  const fareDrop = clampPoint(farFrom(startPoint, half * 0.9, [startPoint]));
  const pickup = clampPoint(near(startPoint, half * 0.45));
  const delivery = clampPoint(farFrom(pickup, half * 0.9, [startPoint, pickup]));
  const goldCar = clampPoint(farFrom(startPoint, half * 0.8, [startPoint, fareDrop]));
  const garage = clampPoint({ x: startPoint.x, z: startPoint.z });

  const defs = [
    {
      id: 'first-fare', title: 'First Fare',
      brief: 'Nia\u2019s garage owes money and the meter is running. A fare is waiting across town — pick them up by getting there, then drive them to the drop-off. Smooth driving, no trouble.',
      objective: 'Drive to the fare drop-off across town.',
      target: fareDrop, reward: rewards[0], radius: 10, needsCar: false,
    },
    {
      id: 'the-package', title: 'The Package',
      brief: 'A friend of the garage needs a package moved, no questions asked. Grab it from the pickup point and deliver it across town. Keep it quiet — attention is the last thing you need.',
      objective: 'Pick up the package.',
      target: pickup, reward: rewards[1], radius: 8, needsCar: false,
      phases: [
        { objective: 'Pick up the package.', target: pickup, radius: 8, needsCar: false },
        { objective: 'Deliver the package across town.', target: delivery, radius: 8, needsCar: false },
      ],
    },
    {
      id: 'lose-the-heat', title: 'Lose the Heat',
      brief: 'Someone talked. The police are on you now — three stars and climbing. Break line of sight, stay out of the search area, and wait for the heat to die down.',
      objective: 'Escape the police until your wanted level drops to zero.',
      target: null, reward: rewards[2], radius: 0, needsCar: false,
    },
    {
      id: 'the-big-score', title: 'The Big Score',
      brief: 'One last job and the garage is saved: the gold Aurelio GT is parked uptown. Steal it, then bring it home to the garage. This is the one they will remember.',
      objective: 'Steal the gold Aurelio GT.',
      target: goldCar, reward: rewards[3], radius: 10, needsCar: true,
      phases: [
        { objective: 'Steal the gold Aurelio GT.', target: goldCar, radius: 10, needsCar: true },
        { objective: 'Bring the Aurelio GT back to the garage.', target: garage, radius: 12, needsCar: true },
      ],
    },
  ];

  const missions = defs.map((d, i) => ({
    index: i, id: d.id, title: d.title, brief: d.brief,
    objective: d.objective, target: d.target, reward: d.reward,
    radius: d.radius, needsCar: d.needsCar,
    phases: d.phases ? d.phases.map((p) => ({ ...p })) : null,
    phase: 0, done: false,
  }));

  let currentIndex = 0;
  let finished = false;
  let missionTime = 0;
  let heatRaised = false;

  function current() {
    return missions[Math.min(currentIndex, missions.length - 1)];
  }

  function applyPhase(m) {
    if (m.phases && m.phases[m.phase]) {
      const ph = m.phases[m.phase];
      m.objective = ph.objective;
      m.target = ph.target;
      m.radius = ph.radius;
      m.needsCar = ph.needsCar;
    }
  }

  function startEffects(m) {
    missionTime = 0;
    heatRaised = false;
    if (m.id === 'lose-the-heat') {
      const pol = state.police;
      let raised = false;
      if (pol && typeof pol.raiseWanted === 'function') {
        try { pol.raiseWanted(3); raised = true; } catch (_err) { raised = false; }
      }
      if (pol && !raised && typeof pol.setWanted === 'function') {
        try { pol.setWanted(3); raised = true; } catch (_err) { raised = false; }
      }
      if (!raised) state.wanted = 3;
      heatRaised = true;
    }
  }

  function setMission(i) {
    currentIndex = Math.max(0, Math.min(i, missions.length - 1));
    finished = false;
    const m = current();
    m.phase = 0;
    m.done = false;
    applyPhase(m);
    state.mission = currentIndex;
    state.finished = false;
    startEffects(m);
    return m;
  }

  function advance() {
    const m = current();
    if (m.done) return null;
    // Multi-phase mission: move to the next phase instead of completing.
    if (m.phases && m.phase < m.phases.length - 1) {
      m.phase += 1;
      applyPhase(m);
      return { type: 'phase', mission: m };
    }
    m.done = true;
    if (typeof state.money === 'number') state.money += m.reward;
    if (typeof state.bestScore === 'number') {
      state.bestScore = Math.max(state.bestScore, state.money);
    }
    if (currentIndex < missions.length - 1) {
      currentIndex += 1;
      const next = current();
      next.phase = 0;
      next.done = false;
      applyPhase(next);
      state.mission = currentIndex;
      startEffects(next);
      return { type: 'mission-complete', mission: m, next };
    }
    finished = true;
    state.finished = true;
    state.mission = currentIndex;
    return { type: 'story-complete', mission: m };
  }

  function update(dt) {
    if (finished) return null;
    const m = current();
    missionTime += Math.max(0, dt || 0);
    const pos = readPlayerPos(state);
    if (!pos) return null;

    if (m.id === 'lose-the-heat') {
      const wanted = readWanted(state);
      // Escape valve: if the police system never drops wanted (or the
      // pursuit never engages), a long clean run still ends the mission.
      if (heatRaised && wanted <= 0) return advance();
      if (missionTime > 75) return advance();
      return null;
    }

    const target = m.target;
    if (!target) return null;
    const d = dist2D(pos, target);
    if (d <= (m.radius || 8)) {
      if (m.needsCar && !isDriving(state)) {
        // Close but on foot: the objective needs a car. Wait here.
        return { type: 'need-car', mission: m };
      }
      return advance();
    }
    return null;
  }

  // Initialise the first mission's phase + effects.
  applyPhase(current());
  state.mission = 0;

  return {
    missions,
    list: missions,
    get currentIndex() { return currentIndex; },
    get current() { return current(); },
    currentMission: current,
    currentObjective() {
      const m = current();
      return m ? m.objective : '';
    },
    currentTarget() {
      const m = current();
      return m ? m.target : null;
    },
    get finished() { return finished; },
    isFinished() { return finished; },
    setMission,
    startMission: setMission,
    advance,
    update,
  };
}
