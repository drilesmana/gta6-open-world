// Velora Heat — entrypoint for the make.fun gta6-01 bounty.
// Validates the entry against the scorer caps, copies game/ and screenshots/
// into the output directory, and writes dossier.json via the kit library.
// Node 22 standard library only, plus ./vendor/makefun-game.ts.
import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  gameMaxFiles: 993,
  gameMaxBytes: 48 * 1024 * 1024,
  pathMaxBytes: 1000,
  indexMaxBytes: 1024 * 1024,
  dossierTextMaxBytes: 163840,
  maxScreenshots: 4,
  minScreenshots: 3,
  screenshotMaxBytes: 256 * 1024,
};

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function walkGameFiles(dir, root, out, counts) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = full.slice(root.length + 1);
    if (Buffer.byteLength(rel, 'utf8') > CAPS.pathMaxBytes) {
      fail(`game path too long (${Buffer.byteLength(rel, 'utf8')} bytes > ${CAPS.pathMaxBytes}): ${rel}`);
    }
    // The cap counts every path under game/, directories included.
    counts.paths += 1;
    if (entry.isDirectory()) {
      await walkGameFiles(full, root, out, counts);
    } else if (entry.isFile()) {
      const info = await stat(full);
      out.push({ rel, bytes: info.size });
    }
  }
  return out;
}

async function main() {
  const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
  const repoRoot = resolve(import.meta.dirname);
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');

  // --- Validation (before copying anything) ---

  // game/index.html must exist.
  let indexStat;
  try {
    indexStat = await stat(join(gameDir, 'index.html'));
  } catch {
    fail('game/index.html not found');
  }
  if (!indexStat.isFile()) fail('game/index.html is not a file');
  if (indexStat.size > CAPS.indexMaxBytes) {
    fail(`game/index.html is ${indexStat.size} bytes, over the ${CAPS.indexMaxBytes} byte cap`);
  }

  // game/ caps: at most 993 paths (files + directories), at most 48 MiB total.
  const counts = { paths: 0 };
  const gameFiles = await walkGameFiles(gameDir, gameDir, [], counts);
  if (counts.paths > CAPS.gameMaxFiles) {
    fail(`game/ holds ${counts.paths} paths, over the ${CAPS.gameMaxFiles} path cap`);
  }
  const gameBytes = gameFiles.reduce((sum, f) => sum + f.bytes, 0);
  if (gameBytes > CAPS.gameMaxBytes) {
    fail(`game/ is ${gameBytes} bytes, over the ${CAPS.gameMaxBytes} byte cap`);
  }

  // screenshots/: 3 or 4 visible regular image files, each at most 256 KiB.
  let shotEntries;
  try {
    shotEntries = await readdir(shotsDir, { withFileTypes: true });
  } catch {
    fail('screenshots/ directory not found');
  }
  const shots = [];
  for (const entry of shotEntries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const lower = entry.name.toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    if (!IMAGE_EXTS.has(ext)) {
      fail(`screenshots/${entry.name} is not a jpg/jpeg/png image`);
    }
    const info = await stat(join(shotsDir, entry.name));
    if (info.size > CAPS.screenshotMaxBytes) {
      fail(`screenshots/${entry.name} is ${info.size} bytes, over the ${CAPS.screenshotMaxBytes} byte cap`);
    }
    shots.push({ name: entry.name, bytes: info.size });
  }
  if (shots.length < CAPS.minScreenshots || shots.length > CAPS.maxScreenshots) {
    fail(`screenshots/ holds ${shots.length} images, need ${CAPS.minScreenshots} to ${CAPS.maxScreenshots}`);
  }
  const shotsBytes = shots.reduce((sum, s) => sum + s.bytes, 0);

  // --- Copy + dossier ---
  await mkdir(outputDir, { recursive: true });
  await cp(gameDir, join(outputDir, 'game'), { recursive: true });
  await cp(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

  const dossier = await buildDossier(outputDir, {
    text_max_bytes: CAPS.dossierTextMaxBytes,
    max_screenshots: CAPS.maxScreenshots,
    screenshot_max_bytes: CAPS.screenshotMaxBytes,
    game_max_files: CAPS.gameMaxFiles,
    game_max_bytes: CAPS.gameMaxBytes,
    path_max_bytes: CAPS.pathMaxBytes,
  });
  await writeFile(join(outputDir, 'dossier.json'), dossier);

  const totalBytes = gameBytes + shotsBytes;
  console.log(
    `done: game ${gameFiles.length} files (${counts.paths} paths), ${gameBytes} bytes; ` +
    `screenshots ${shots.length} files, ${shotsBytes} bytes; ` +
    `total ${totalBytes} bytes; dossier.json written to ${outputDir}`,
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
