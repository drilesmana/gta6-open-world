// The street graph: the city's crossroads, the lanes between them, and helpers that pick a
// random lane near a point. Traffic drives it and the police use it to come in from off-screen.
// The graph is for lane routing, not collision; curbs and buildings are resolved by World.

import * as U from './util.js';

export class RoadGraph {
  constructor(city) {
    this.roadNodes = city.roadNodes;
    this.roadEdges = city.roadEdges;
    this.cells = city.cells ?? Math.round(Math.sqrt(city.roadNodes.length)) - 1;
    this.limit = city.limit;
    this.bag = null;
    this.last = null;
  }

  nodeAt(i, j) {
    if (i < 0 || j < 0 || i > this.cells || j > this.cells) return null;
    return this.roadNodes[i * (this.cells + 1) + j];
  }

  // One lane [from, to] anywhere on the grid. The bag shuffles every lane and pops them in turn,
  // so a spawn ring spreads across the whole city instead of clustering on one street.
  randomEdge() {
    if (!this.roadEdges.length) return null;
    if (!this.bag || !this.bag.length) {
      this.bag = U.shuffle([...this.roadEdges]);
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        [this.bag[this.bag.length - 1], this.bag[0]] = [this.bag[0], this.bag[this.bag.length - 1]];
      }
    }
    const edge = this.bag.pop();
    this.last = edge;
    return edge;
  }

  // A lane whose midpoint sits in the ring around the player, so cars fade in out of sight. When
  // the ring has nothing (a spawner boxed in by buildings), the nearest lane is better than none.
  edgeNear(x, z, minDist, maxDist) {
    for (let i = 0; i < 30; i++) {
      const edge = this.randomEdge();
      if (!edge) return null;
      const { x: mx, z: mz } = this.midpoint(edge);
      const d = U.dist(mx, mz, x, z);
      if (d > minDist && d < maxDist) return edge;
    }
    let best = null;
    let bd = Infinity;
    for (const edge of this.roadEdges) {
      const { x: mx, z: mz } = this.midpoint(edge);
      const d = U.dist(mx, mz, x, z);
      if (d > minDist && d < bd) { bd = d; best = edge; }
    }
    return best;
  }

  midpoint(edge) {
    return { x: (edge[0].x + edge[1].x) / 2, z: (edge[0].z + edge[1].z) / 2 };
  }

  // A point along a lane at `t`, offset into the right-hand lane by `lane` metres. Spawners and
  // the police share it so both sides of the street agree on where a car belongs. `t` is kept
  // inside the block so a spawn never lands in the middle of a crossroads.
  lanePoint(edge, t, lane = 3.6) {
    const [a, b] = edge;
    const k = U.clamp(t, 0.08, 0.92);
    const dir = Math.atan2(b.x - a.x, b.z - a.z);
    return {
      x: U.lerp(a.x, b.x, k) + Math.cos(dir) * lane,
      z: U.lerp(a.z, b.z, k) - Math.sin(dir) * lane,
      dir,
    };
  }

  // Closest crossroads to a point: where a spawn or a bail-out should land.
  nearestNode(x, z) {
    // Mission routing also uses this fallback; an empty graph must fail explicitly.
    if (!this.roadNodes.length) return null;
    let best = this.roadNodes[0];
    let bd = Infinity;
    for (const n of this.roadNodes) {
      const d = U.dist2(n.x, n.z, x, z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Count of edges in the graph: exposed for HUD / debug displays.
  get edgeCount() {
    return this.roadEdges.length;
  }
}
