// The minimap and the full city map. North-up so the grid reads straight, clipped to a circle,
// with blips for the job marker, the police, the traffic and the cases still out there.
// The baked texture uses world coordinates; dynamic markers are projected on top rather than rebaking the city.

import * as U from '../core/util.js';

const WORLD = { limit: 250, extent: 500 };
const BAKED = 512;

export const DISTRICTS = [
  { name: 'SUNSET STRIP', x: 0, z: 150 },
  { name: 'THE POINT', x: -70, z: 118 },
  { name: 'DOWNTOWN', x: 0, z: 0 },
  { name: 'CALLE OCHO', x: -100, z: -80 },
  { name: 'MARKET ROW', x: 110, z: 40 },
  { name: 'RADIO HILL', x: 110, z: -120 },
];

export class Minimap {
  constructor(canvas, bigCanvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.big = bigCanvas;
    this.bigCtx = bigCanvas?.getContext('2d') ?? null;
    this.base = city.minimap;
    this.bakedScale = (BAKED - 48) / WORLD.extent;
    this.span = 170; // world units across the small map
    this.accum = 0;
  }

  districtFor(x, z) {
    let best = DISTRICTS[0];
    let bd = Infinity;
    for (const d of DISTRICTS) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best.name;
  }

  blips(game) {
    const out = [];
    if (game.missions.marker) out.push({ kind: 'job', ...game.missions.marker });
    for (const c of game.collectibles.list) if (!c.taken) out.push({ kind: 'case', x: c.x, z: c.z });
    for (const car of game.police.cruisers) if (!car.dead) out.push({ kind: 'cop', x: car.x, z: car.z });
    for (const cop of game.police.cops) if (!cop.dead) out.push({ kind: 'cop', x: cop.x, z: cop.z });
    for (const car of game.traffic.all) if (!car.dead && car.driver !== 'player') out.push({ kind: 'car', x: car.x, z: car.z });
    for (const ped of game.peds.all) out.push({ kind: 'ped', x: ped.x, z: ped.z });
    out.push({ kind: 'garage', ...game.city.missionSpots.garage });
    if (game.missions.target) out.push({ kind: 'target', x: game.missions.target.x, z: game.missions.target.z });
    return out;
  }

  draw(game, dt) {
    this.accum += dt;
    if (this.accum < 0.06) return;
    this.accum = 0;
    const ctx = this.ctx;
    const size = this.canvas.width;
    const c = size / 2;
    const p = game.player;
    // The map opens up with speed: a chase needs the next two junctions, a walk needs the kerb.
    const pace = p.vehicle ? Math.min(p.vehicle.speedKmh / 90, 1) : 0;
    this.span = U.damp(this.span, 170 + pace * 70, 2, dt);
    const scale = size / this.span;

    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#16232a';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(c, c);
    ctx.scale(scale, scale);
    ctx.translate(-p.x, -p.z);
    const worldSize = BAKED / this.bakedScale;
    ctx.drawImage(this.base, -worldSize / 2, -worldSize / 2, worldSize, worldSize);
    ctx.restore();

    // A dashed guide from the player to the job marker, so the way reads at a glance even when
    // the marker itself is off the edge of the circle.
    const job = game.missions.marker;
    if (job) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(240,185,60,.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + (job.x - p.x) * scale, c + (job.z - p.z) * scale);
      ctx.stroke();
      ctx.restore();
    }

    // Blips, north-up, culled to the circle.
    const rim = c - 8;
    for (const b of this.blips(game)) {
      const dx = (b.x - p.x) * scale;
      const dz = (b.z - p.z) * scale;
      if (Math.abs(dx) > rim || Math.abs(dz) > rim) continue;
      // Corners of the square are outside the dial: pull them onto the rim rather than clip.
      const len = Math.hypot(dx, dz);
      const fit = len > rim ? rim / len : 1;
      this.blip(ctx, b.kind, c + dx * fit, c + dz * fit);
    }

    // Player: a wedge pointing where he looks.
    const objective = game.missions.marker;
    if (objective) {
      const dx = objective.x - p.x, dz = objective.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > this.span * 0.43) {
        const rim = c - 23;
        this.blip(ctx, 'job', c + dx / distance * rim, c + dz / distance * rim);
      }
    }
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(p.heading + Math.PI);
    ctx.fillStyle = '#f6ecd6';
    ctx.strokeStyle = '#11181c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North tick and ring.
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(246,236,214,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(246,236,214,.85)';
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 26);
  }

  blip(ctx, kind, x, y) {
    switch (kind) {
      case 'job':
      case 'target': {
        const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.08;
        ctx.fillStyle = '#f0b93c';
        ctx.strokeStyle = '#4a3208';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 11 * pulse);
        ctx.lineTo(x + 11 * pulse, y);
        ctx.lineTo(x, y + 11 * pulse);
        ctx.lineTo(x - 11 * pulse, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'cop': {
        ctx.fillStyle = '#e2604a';
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case 'case': {
        ctx.fillStyle = '#8fce6a';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        break;
      }
      case 'car': {
        ctx.fillStyle = 'rgba(246,236,214,.62)';
        ctx.fillRect(x - 2.6, y - 2.6, 5.2, 5.2);
        break;
      }
      case 'garage': {
        ctx.fillStyle = '#5fa8a0';
        ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.fillStyle = '#0d1c1c';
        ctx.font = 'bold 12px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('G', x, y + 4);
        break;
      }
      case 'ped': {
        ctx.fillStyle = 'rgba(220,210,190,.5)';
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  // Full-screen map: whole city, markers, and a legend down the side.
  drawBig(game) {
    const ctx = this.bigCtx;
    if (!ctx) return;
    const size = this.big.width;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.base, 0, 0, size, size);
    ctx.fillStyle = 'rgba(10,16,20,.18)';
    ctx.fillRect(0, 0, size, size);

    const scale = size / BAKED * this.bakedScale;
    const toPx = (v) => size / 2 + v * scale;
    for (const b of this.blips(game)) this.blip(ctx, b.kind, toPx(b.x), toPx(b.z));

    const p = game.player;
    ctx.save();
    ctx.translate(toPx(p.x), toPx(p.z));
    ctx.rotate(p.heading + Math.PI);
    ctx.fillStyle = '#f6ecd6';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(10,16,20,.78)';
    ctx.fillRect(0, size - 44, size, 44);
    ctx.fillStyle = '#f6ecd6';
    ctx.font = '16px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Gold: job     Green: case     Red: police     Teal: garage     Press M to close', 20, size - 16);
  }
}
