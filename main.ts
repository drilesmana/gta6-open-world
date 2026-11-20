// Velora Heat entry packaging: Node standard library only, no build and no network.
// Copy the game and live gameplay screenshots, then generate the judge dossier
// with the competition library and its prescribed byte limits.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps: the text cap shapes the dossier bytes; the rest refuse
// an entry the scorer would refuse, so the package fails here first, with a
// readable reason, instead of at the gate.
const LIMITS = {
  text_max_bytes: 163840,
  dossier_max_bytes: 1572864,
  screenshots: { max: 4, min: 3, max_bytes: 262144, long: 1280, short: 480 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
  index_max_bytes: 1048576,
};

// `game/` has no build step, so the tree is walked by hand: every path has to
// stay inside the entry's own caps before anything is copied.
function walk(dir, base = dir, files = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    const rel = full.slice(base.length + 1);
    if (name.name.startsWith('.')) throw new Error(`Remove hidden entry game/${rel}`);
    if (name.isDirectory()) {
      files.push({ rel, size: 0 });
      walk(full, base, files);
    } else if (name.isFile()) files.push({ rel, size: statSync(full).size });
    else throw new Error(`game/${rel} is not a plain file or directory (no symlinks allowed)`);
  }
  return files;
}

function checkGame() {
  const root = join(here, 'game');
  if (!existsSync(join(root, 'index.html'))) throw new Error('game/index.html is missing');
  const files = walk(root);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (files.length > LIMITS.game_max_files) throw new Error(`game/ holds ${files.length} paths, cap ${LIMITS.game_max_files}`);
  if (total > LIMITS.game_max_bytes) throw new Error(`game/ is ${total} bytes, cap ${LIMITS.game_max_bytes}`);
  for (const f of files) {
    if (new TextEncoder().encode(`game/${f.rel}`).length > LIMITS.game_path_max_bytes) throw new Error(`game/${f.rel} is over the path byte cap`);
  }
  const index = files.find((f) => f.rel === 'index.html');
  if (index.size > LIMITS.index_max_bytes) throw new Error('game/index.html is over 1 MiB');
  return { files: files.length, bytes: total };
}

// The cover is the first screenshot by name, so the folder is checked rather
// than trusted: a placeholder or an over-long edge is worth catching before
// the judge sees the sheet.
function checkShots() {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) throw new Error('screenshots/ is missing');
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.name.startsWith('.'))) {
    throw new Error('screenshots/ must contain only visible, regular image files');
  }
  const names = entries.map((entry) => entry.name).sort();
  if (names.length < LIMITS.screenshots.min || names.length > LIMITS.screenshots.max) {
    throw new Error(`screenshots/ holds ${names.length} images, needs 3 or 4`);
  }
  let shotBytes = 0;
  for (const name of names) {
    const full = join(dir, name);
    const size = statSync(full).size;
    if (size > LIMITS.screenshots.max_bytes) throw new Error(`screenshots/${name} is ${size} bytes, cap 256 KiB`);
    if (!['.png', '.jpg', '.jpeg'].includes(extname(name).toLowerCase())) throw new Error(`screenshots/${name} is not PNG or JPEG`);
    shotBytes += size;
  }
  return { names, bytes: shotBytes };
}

const game = checkGame();
const shots = checkShots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: LIMITS.text_max_bytes,
    screenshots: { max: LIMITS.screenshots.max, max_bytes: LIMITS.screenshots.max_bytes },
    game_max_files: LIMITS.game_max_files,
    game_max_bytes: LIMITS.game_max_bytes,
    game_path_max_bytes: LIMITS.game_path_max_bytes,
  }),
);

// Verify what was written: the dossier must exist and stay under the file cap
// (1.5 MiB); the text field has its own 163,840 B cap, enforced where the
// dossier is built.
const dossierPath = join(out, 'dossier.json');
if (!existsSync(dossierPath)) throw new Error('dossier.json was not written');
const dossierBytes = statSync(dossierPath).size;
if (dossierBytes > LIMITS.dossier_max_bytes) throw new Error(`dossier.json is ${dossierBytes} bytes, cap ${LIMITS.dossier_max_bytes}`);

// One line the entrant can read back: what was packaged, and under which caps.
process.stdout.write(`packaged game/ (${game.files} paths, ${game.bytes} bytes), ${shots.names.length} screenshots (${shots.bytes} bytes), dossier.json (${dossierBytes} bytes)\n`);
