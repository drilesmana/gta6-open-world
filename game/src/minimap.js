// Velora Heat — minimap.
// A round canvas that draws the street grid, the beach and the water from the
// config constants, then blips: player (gold arrow), police (flashing red),
// mission marker (gold diamond), traffic (grey dots), pedestrians (faint dots).
// The full map reuses the same painter at a bigger scale.
import { STREETS, BLOCKS, CITY_HALF, BEACH_START, WATER_START } from './config.js';

const RANGE = 240; // world metres shown across the map

export function drawMap(ctx, size, cx, cz, opts) {
  const scale = size / (RANGE * 2);
  const toX = (x) => size / 2 + (x - cx) * scale;
  const toY = (z) => size / 2 + (z - cz) * scale;
  ctx.clearRect(0, 0, size, size);
  // Water + sand at the south edge.
  ctx.fillStyle = '#1d5a6b';
  ctx.fillRect(0, toY(WATER_START), size, size - toY(WATER_START));
  ctx.fillStyle = '#e8cf9e';
  ctx.fillRect(0, toY(BEACH_START), size, toY(WATER_START) - toY(BEACH_START));
  // City base.
  ctx.fillStyle = '#2c3438';
  ctx.fillRect(0, 0, size, size);
  // Blocks.
  ctx.fillStyle = '#4a4640';
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      ctx.fillRect(toX(bx - 20), toY(bz - 20), 40 * scale, 40 * scale);
    }
  }
  // Roads.
  ctx.fillStyle = '#7d838a';
  for (const s of STREETS) {
    ctx.fillRect(toX(s - 6), toY(-CITY_HALF), 12 * scale, 2 * CITY_HALF * scale);
    ctx.fillRect(toX(-CITY_HALF), toY(s - 6), 2 * CITY_HALF * scale, 12 * scale);
  }
  // Mission marker: a gold diamond that pulses so it is easy to spot.
  if (opts.marker) {
    const mx = toX(opts.marker.x);
    const my = toY(opts.marker.z);
    const pulse = 1 + 0.18 * Math.sin(performance.now() / 280);
    const r = 9 * pulse;
    ctx.fillStyle = '#f2b705';
    ctx.beginPath();
    ctx.moveTo(mx, my - r);
    ctx.lineTo(mx + r * 0.9, my);
    ctx.lineTo(mx, my + r);
    ctx.lineTo(mx - r * 0.9, my);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#23190c';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Traffic dots.
  ctx.fillStyle = 'rgba(200,205,210,0.8)';
  for (const c of opts.traffic || []) {
    ctx.beginPath();
    ctx.arc(toX(c.x), toY(c.z), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police: flashing red/blue.
  if (opts.police) {
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a1a' : '#2244ff';
    for (const c of opts.police) {
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.z), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Player arrow, rotated to the heading.
  const px = toX(opts.player.x);
  const py = toY(opts.player.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(opts.player.heading);
  ctx.fillStyle = '#f2b705';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#23190c';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(state) {
    drawMap(this.ctx, this.canvas.width, state.player.x, state.player.z, state);
  }
}
