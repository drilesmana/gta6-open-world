# QA — Velora Heat

How the entry was checked, and what is still open. Update this file when a check
runs; never claim a check that did not run.

## Chunk 1 (foundation) — done

- Every chunk 1 file parses: `node --check` passes on all JS files and on main.ts.
- The entrypoint refuses cleanly in a scratch output directory: with game/ and
  screenshots/ incomplete it exits with a readable error (missing index or missing
  screenshots) instead of a crash, and writes nothing.
- The vendored Three.js build and the kit library are present as copies:
  game/vendor/three.min.js, game/vendor/three.LICENSE.txt, vendor/makefun-game.ts.
- The city module exposes the contract the gameplay systems need: a road network
  with start, end and direction per road, sidewalk waypoints, car spawn points,
  the player start in front of the garage, and the garage position.

## Chunk 3 (full playtest) — to run after chunk 3

- Start the dev server and open the game in a headless browser.
- Title screen, then mission brief, then play.
- Walk on foot, steal a car, drive, and confirm the speed readout moves.
- Police respond with wanted stars and an escape meter; escaping lowers wanted.
- All four missions complete in order; the story finish screen shows; progress saves.
- Zero console errors and zero failed or external requests during the whole run.
- Four real gameplay screenshots at 1280x720, each under 256 KiB, cover first.
- Run the entrypoint with MAKEFUN_OUTPUT_DIR set to out and confirm out/ holds
  game/, screenshots/ and dossier.json within every cap.

## Known weak spots

- The city is procedural and the buildings share one window texture, so the look
  is deliberately stylised rather than photoreal.
- The Three.js build is loaded through an import map from the vendored file; if
  the vendored file ever changes format, the import map line in game/index.html
  is the one place to fix.
- Chunk 1 on its own is not playable yet: the player, cars, traffic, police,
  missions, HUD, minimap, audio and the main loop land in chunks 2 and 3.
