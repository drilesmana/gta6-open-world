# QA — Velora Heat (gta6-01)

How the entry was checked, and what is known to be weak. Re-run after any change.

## Chunk 1 checks (foundation + entrypoint)

```sh
node --check game/src/config.js
node --check game/src/util.js
node --check game/src/materials.js
node --check game/src/lighting.js
node --check game/src/sky.js
node --check game/src/city.js
node --check main.ts
```

All must pass with no output.

Entrypoint refusal test (expected to FAIL cleanly at this stage, because
game/ and screenshots/ are not complete yet):

```sh
MAKEFUN_OUTPUT_DIR=/tmp/vh-out node main.ts
```

Expected: a readable `error: ...` line on stderr, exit code 1, and NO files
copied into /tmp/vh-out. A stack trace or a crash here is a bug.

## Chunk 2 checks

- `node --check` every file under game/src, plus serve.ts.
- Load the modules in Node with a throwaway import test to confirm the
  imports resolve (do not keep the test file in the repo).
- `node serve.ts`, then open http://localhost:8080 and confirm the page
  serves with no failed requests.

## Chunk 3 checks (full game)

- Start the dev server, open the game in a headless browser, and play end
  to end: title screen, brief, walk on foot, steal a car, drive, police
  respond with wanted stars and an escape meter, all four missions complete,
  story finish screen, and save.
- Zero console errors, zero failed or external requests.
- `python3 tests/verify_package.py` passes (game caps, screenshots, dossier).
- `python3 tests/playtest.py` reports the playthrough working.
- Run the entrypoint with `MAKEFUN_OUTPUT_DIR=out node main.ts` and confirm
  out/ holds game/, screenshots/, and dossier.json within every cap.

## Known weaknesses

- The `buildDossier` call shape in main.ts (second argument: caps object) was
  written from the spec prose only; the kit library file was copied, never
  opened. If the real signature differs, the entrypoint will fail at the
  dossier step — verify by running it once game/ and screenshots/ are
  complete (chunk 3).
- `index.html` references `./src/main.js`, which does not exist until chunk 3;
  the page cannot boot until then.
- City building counts and lamp counts were chosen for a low-end machine; if
  the frame rate is poor on the target device, reduce tree/lamp density first.
- The minimap canvas in index.html is a fixed 180x180 circle; HUD layout was
  not tested against narrow viewports yet.
