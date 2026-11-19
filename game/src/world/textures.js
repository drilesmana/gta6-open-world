// Every surface texture is painted at load time into a canvas: no image files, no network.
// Marisol Bay's palette is sun-bleached pastel concrete, terracotta, mint and coral, with big
// windows that catch the late light. Textures are cached and shared across the whole city.
// Initialize the renderer filter before building the city so cached textures inherit the same setting.

const THREE = globalThis.THREE;

const cache = new Map();

// The renderer's best angle-dependent filtering, set once at boot: asphalt seen down a long
// road at a grazing angle turns to static at anisotropy 4.
let ANISO = 4;
export function setAnisotropy(n) {
  ANISO = Math.max(1, n | 0);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Stable pseudo-random from a string and two indices: the same window always gets the same
// balcony, however often the texture is rebuilt.
function hashish(text, a, b) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ a, 16777619);
  h = Math.imul(h ^ b, 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

function noise(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = Math.random() * 2 + 0.5;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '40,32,28'},${alpha})`;
    ctx.fillRect(x, y, s, s);
  }
}

// A building facade: 4 floors of windows over a shopfront, weathered by sea air.
export function facadeTexture(palette, floors = 6, shops = true) {
  const key = 'facade:' + palette.name + floors + shops;
  if (cache.has(key)) return cache.get(key);
  const w = 256;
  const h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = palette.wall;
  ctx.fillRect(0, 0, w, h);

  // Bleaching bands and hairline cracks.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,246,232,${0.04 + Math.random() * 0.08})`;
    ctx.fillRect(0, Math.random() * h, w, 2 + Math.random() * 26);
  }
  ctx.strokeStyle = 'rgba(60,44,38,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 20 - 10, y + 20 + Math.random() * 50);
    ctx.stroke();
  }
  noise(ctx, w, h, 2600, 0.15);

  const shopH = shops ? 96 : 0;
  if (shops) {
    // Ground floor glass, awning stripes and a door.
    ctx.fillStyle = '#2a3340';
    ctx.fillRect(8, h - shopH + 22, w - 16, shopH - 30);
    ctx.fillStyle = 'rgba(150,210,225,0.35)';
    for (let x = 16; x < w - 16; x += 42) ctx.fillRect(x, h - shopH + 28, 30, shopH - 44);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, h - shopH, w, 20);
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x, h - shopH, 16, 20);
    }
    ctx.fillStyle = 'rgba(30,26,24,0.75)';
    ctx.fillRect(w / 2 - 22, h - 34, 44, 34);
  }

  const usable = h - shopH - 18;
  const step = usable / floors;
  for (let f = 0; f < floors; f++) {
    const y = 14 + f * step;
    const cols = 4;
    for (let cix = 0; cix < cols; cix++) {
      const x = 14 + cix * ((w - 28) / cols);
      const ww = (w - 28) / cols - 10;
      const wh = Math.min(step - 14, 46);
      ctx.fillStyle = 'rgba(178,205,214,0.85)';
      ctx.fillRect(x, y, ww, wh);
      ctx.fillStyle = 'rgba(30,42,54,0.5)';
      ctx.fillRect(x, y, ww, wh * 0.35);
      ctx.strokeStyle = 'rgba(250,244,232,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, ww, wh);
      // Salt-stained sills.
      ctx.fillStyle = 'rgba(255,250,240,0.5)';
      ctx.fillRect(x - 2, y + wh, ww + 4, 3);
      // A third of the windows carry a split unit and a rail: the block has people in it.
      if (hashish(palette.name, f, cix) < 0.34) {
        ctx.fillStyle = 'rgba(190,190,182,0.95)';
        ctx.fillRect(x + ww - 20, y + wh + 5, 17, 11);
        ctx.fillStyle = 'rgba(70,70,66,0.55)';
        ctx.fillRect(x + ww - 18, y + wh + 8, 13, 2);
        ctx.strokeStyle = 'rgba(60,54,48,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 2, y + wh * 0.72);
        ctx.lineTo(x + ww + 2, y + wh * 0.72);
        ctx.stroke();
        for (let rx = x + 3; rx < x + ww; rx += 11) {
          ctx.beginPath();
          ctx.moveTo(rx, y + wh * 0.72);
          ctx.lineTo(rx, y + wh);
          ctx.stroke();
        }
      }
    }
  }

  // Rooftop parapet.
  ctx.fillStyle = 'rgba(255,247,235,0.8)';
  ctx.fillRect(0, 0, w, 10);

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

// Roof detail: gravel, vents, water tank shadows, painted numbers.
export function roofTexture(tint) {
  const key = 'roof:' + tint;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 5000, 0.22);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(90,84,78,${Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 40, 6 + Math.random() * 40);
  }
  ctx.strokeStyle = 'rgba(70,64,60,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 232, 232);
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

// Cache stats for debug: number of textures and total memory estimate.
export function textureStats() {
  let bytes = 0;
  for (const [, t] of cache) {
    if (t.image?.width && t.image?.height) {
      bytes += t.image.width * t.image.height * 4;
    }
  }
  return { count: cache.size, approxBytes: bytes };
}

// Asphalt with a faded centre line, for the long road ribbons.
export function roadTexture() {
  if (cache.has('road')) return cache.get('road');
  const c = canvas(256, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4e4d4c';
  ctx.fillRect(0, 0, 256, 512);
  // Speckle at a third of the old density: at road scale the old grain read as television snow.
  noise(ctx, 256, 512, 3000, 0.13);
  // Tyre polish down each lane: two darker, slightly shiny bands where wheels actually run.
  for (const lane of [70, 186]) {
    const g = ctx.createLinearGradient(lane - 26, 0, lane + 26, 0);
    g.addColorStop(0, 'rgba(38,36,38,0)');
    g.addColorStop(0.5, 'rgba(38,36,38,0.22)');
    g.addColorStop(1, 'rgba(38,36,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lane - 26, 0, 52, 512);
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(30,28,30,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 512, 10 + Math.random() * 60, 8 + Math.random() * 40);
  }
  // Tar snakes: the repairs a council makes and never smooths.
  ctx.strokeStyle = 'rgba(24,22,24,0.5)';
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 30, y + 40, x - 20, y + 90, x + 10, y + 140);
    ctx.stroke();
  }
  // Double centre line, sun-faded.
  ctx.fillStyle = 'rgba(240,214,150,0.5)';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(120, y, 6, 38);
    ctx.fillRect(134, y, 6, 38);
  }
  const tex = toTexture(c);
  cache.set('road', tex);
  return tex;
}

export function sidewalkTexture() {
  if (cache.has('walk')) return cache.get('walk');
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b9ada0';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 4000, 0.2);
  // Dark gum spots and a couple of cracked slabs, so the pavement is not a clean grid.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(70,64,60,${0.05 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, 7);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(96,88,82,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y + 10);
    ctx.lineTo(x + 26, y + 34);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(110,100,94,0.4)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = toTexture(c);
  cache.set('walk', tex);
  return tex;
}

export function sandTexture() {
  if (cache.has('sand')) return cache.get('sand');
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#efd9ac');
  g.addColorStop(1, '#dcc094');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 12000, 0.25);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = 'rgba(150,126,92,0.25)';
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 0, Math.PI);
    ctx.stroke();
  }
  const tex = toTexture(c, 8, 8);
  cache.set('sand', tex);
  return tex;
}

export function grassTexture() {
  if (cache.has('grass')) return cache.get('grass');
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7f9455';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 9000, 0.3);
  for (let i = 0; i < 500; i++) {
    ctx.strokeStyle = `rgba(${120 + Math.random() * 50},${140 + Math.random() * 50},70,0.5)`;
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 4 - 2, y - 4 - Math.random() * 5);
    ctx.stroke();
  }
  const tex = toTexture(c, 6, 6);
  cache.set('grass', tex);
  return tex;
}

export function waterTexture() {
  if (cache.has('water')) return cache.get('water');
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2c8fa6';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.14})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 20, y - 6, x + 40, y + 6, x + 64, y);
    ctx.stroke();
  }
  const tex = toTexture(c, 22, 22);
  cache.set('water', tex);
  return tex;
}

// Shop signs: a lit rectangle with thick painted letters.
export function signTexture(text, bg, fg) {
  const key = 'sign:' + text + bg + fg;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = fg;
  ctx.font = 'bold 74px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function billboardTexture(title, sub, bg, fg) {
  const key = 'bill:' + title;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(512, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, bg);
  g.addColorStop(1, '#f7e2c0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 256, 30 + Math.random() * 70, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.font = 'bold 58px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 118);
  ctx.font = 'bold 32px Helvetica, Arial, sans-serif';
  ctx.fillText(sub, 256, 176);
  ctx.strokeStyle = 'rgba(20,20,20,0.6)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 246);
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function crosswalkTexture() {
  if (cache.has('cross')) return cache.get('cross');
  const c = canvas(256, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4b4a4a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(248,246,238,0.85)';
  for (let x = 6; x < 256; x += 40) ctx.fillRect(x, 6, 24, 116);
  const tex = toTexture(c);
  cache.set('cross', tex);
  return tex;
}
