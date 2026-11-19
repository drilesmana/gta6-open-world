// Velora Heat — shared material library and procedural textures.
// One material per role, reused everywhere: unique material count grows
// faster than geometry count, so roles are shared aggressively. All textures
// are canvas-generated at boot: no external files, no network.
import { PALETTE } from './config.js';

// Draw on a canvas, then wrap it as a repeating sRGB texture.
function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Asphalt with faint warm wear and a gold centre dash baked in.
// The road strips are 12 m wide; the texture repeats every 12 m along a road.
function roadTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#35383d';
    ctx.fillRect(0, 0, w, h);
    // Subtle patch variation.
    for (let i = 0; i < 90; i++) {
      const g = 40 + Math.random() * 26;
      ctx.fillStyle = `rgba(${g},${g + 2},${g + 6},0.25)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 22, 4 + Math.random() * 14);
    }
    // Edge lines.
    ctx.fillStyle = '#c8b98f';
    ctx.fillRect(4, 0, 2, h);
    ctx.fillRect(w - 6, 0, 2, h);
    // Centre dashes: gold, one per lane pair.
    ctx.fillStyle = '#d9a441';
    for (let y = 0; y < h; y += 64) ctx.fillRect(w / 2 - 2, y + 8, 4, 34);
  });
}

// Sidewalk slabs: pale warm concrete with joints and speckle.
function sidewalkTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#bfae90';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,74,58,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 64);
      ctx.lineTo(w, i * 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, h);
      ctx.stroke();
    }
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(80,64,48,${0.05 + Math.random() * 0.09})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
  });
}

// Building facade: plaster with a grid of windows, some lit warm.
// One texture, tinted per building by material colour, so windows read at distance.
function facadeTexture(litRatio = 0.35) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // Faint grime at the base.
    const grad = ctx.createLinearGradient(0, h - 40, 0, h);
    grad.addColorStop(0, 'rgba(90,70,50,0)');
    grad.addColorStop(1, 'rgba(90,70,50,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - 40, w, 40);
    const cols = 5;
    const rows = 8;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22;
        const y = r * ch + ch * 0.2;
        const ww = cw * 0.56;
        const wh = ch * 0.6;
        const lit = Math.random() < litRatio;
        ctx.fillStyle = lit ? '#ffd27a' : '#2c4a5e';
        ctx.fillRect(x, y, ww, wh);
        // Frame and mullion.
        ctx.strokeStyle = 'rgba(40,30,22,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ww, wh);
        ctx.beginPath();
        ctx.moveTo(x + ww / 2, y);
        ctx.lineTo(x + ww / 2, y + wh);
        ctx.stroke();
        if (lit) {
          ctx.fillStyle = 'rgba(255,210,122,0.25)';
          ctx.fillRect(x - 3, y - 3, ww + 6, wh + 6);
        }
      }
    }
  });
}

// Sand with soft ripples.
function sandTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e8cf9e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(160,130,80,${0.06 + Math.random() * 0.1})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(190,160,110,0.5)';
    ctx.lineWidth = 2;
    for (let y = 20; y < h; y += 34) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.06 + y) * 3);
      ctx.stroke();
    }
  });
}

// Billboard art: original, hand-drawn on canvas.
export function billboardTexture(lines, bg, fg) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 84px Trebuchet MS, sans-serif';
    ctx.fillText(lines[0], w / 2, lines[1] ? h / 2 - 42 : h / 2);
    if (lines[1]) {
      ctx.font = '700 40px Trebuchet MS, sans-serif';
      ctx.fillText(lines[1], w / 2, h / 2 + 52);
    }
  });
}

// Radial-gradient blob used as a cheap contact shadow under cars and people.
function blobTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

let MATS = null;

export function createMaterials() {
  if (MATS) return MATS;
  const roadTex = roadTexture();
  const walkTex = sidewalkTexture();
  const facadeTex = facadeTexture(0.35);
  const sandTex = sandTexture();
  const blobTex = blobTexture();
  walkTex.repeat.set(8, 8);
  sandTex.repeat.set(10, 4);

  MATS = {
    textures: { roadTex, walkTex, facadeTex, sandTex, blobTex },
    // Ground.
    asphalt: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.94, metalness: 0 }),
    asphaltPlain: new THREE.MeshStandardMaterial({ color: PALETTE.asphaltWarm, roughness: 0.95 }),
    sidewalk: new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.96 }),
    sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({
      color: PALETTE.water, roughness: 0.22, metalness: 0.1,
      emissive: 0x0e3a44, emissiveIntensity: 0.35,
    }),
    grass: new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
    // Buildings: one plaster material per tint, facade texture shared.
    plaster: PALETTE.plaster.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, map: facadeTex, roughness: 0.88, metalness: 0 }),
    ),
    roof: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }),
    glassDark: new THREE.MeshStandardMaterial({ color: PALETTE.glassDay, roughness: 0.12, metalness: 0.6 }),
    glassLit: new THREE.MeshStandardMaterial({
      color: 0x3a2a18, emissive: PALETTE.glassLit, emissiveIntensity: 1.6, roughness: 0.4,
    }),
    trimDark: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.3 }),
    // Props.
    trunk: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }),
    palmLeaf: new THREE.MeshStandardMaterial({ color: 0x4a7d3a, roughness: 0.9, side: THREE.DoubleSide }),
    lampPole: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.6, metalness: 0.6 }),
    lampGlow: new THREE.MeshStandardMaterial({
      color: 0x201808, emissive: 0xffd27a, emissiveIntensity: 2.2, roughness: 0.4,
    }),
    benchWood: new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.95 }),
    // Cars.
    tire: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.92, metalness: 0, envMapIntensity: 0.35 }),
    hubcap: new THREE.MeshStandardMaterial({ color: 0xaeb4bd, roughness: 0.35, metalness: 1, envMapIntensity: 1.1 }),
    carGlass: new THREE.MeshPhysicalMaterial({
      color: 0x88ccff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32,
      clearcoat: 1, envMapIntensity: 1.5, depthWrite: false,
    }),
    headlight: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2c0, emissiveIntensity: 3 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 2.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.2, metalness: 1, envMapIntensity: 1.2 }),
    // Characters.
    skin: PALETTE.skin.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })),
    shirt: PALETTE.shirt.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
    pants: PALETTE.pants.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    hair: new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1 }),
    // Effects.
    blob: new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
    beacon: new THREE.MeshBasicMaterial({
      color: 0xffc46b, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    }),
  };
  return MATS;
}

// Painted car body: clearcoat paint over a dielectric base.
export function carPaintMaterial(hex) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, metalness: 0, roughness: 0.42,
    clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 1.0,
  });
}
