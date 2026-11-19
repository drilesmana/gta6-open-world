# Marisol Heat — verification

## Browser

`python3 tests/playtest.py` uses Chromium with Python Playwright and the static server on port 8080. The renderer uses `?lite=1`; `?qa=1` exposes state to the suite only. The suite drives game input and runs the real simulation with fixed steps. It positions the player and vehicles around the larger map instead of driving every route from start to finish.

The report in `tests/last-run.json` covers the briefings, on-foot movement, driving and carjacking, punch/fire/reload, police dispatch and loss of heat, all three story chapters through the ending, load after completion, death/recovery, mission retry, audio lifecycle and request errors.

The four submitted JPEGs are existing captures from the construction session, retained after the resumed build. Verification decodes the actual files, checks nonflat pixels, dimensions, sizes, cover order and dossier byte equality. The resumed VM timed out recapturing with software rendering; these are not new screenshots of the final code revision. The resume changes did not replace any city art.

## Hand-in

Run `MAKEFUN_OUTPUT_DIR=out node main.ts`, then `python3 tests/verify_package.py out` with Pillow. This verifies copied bytes, directory and dossier limits, filenames and image integrity. `node main.ts` also writes the same packet directly to `/output`.

No fresh manual end-to-end drive or hardware GPU performance benchmark was performed. This local verification does not certify the competition's transcript, recording or GitHub intake checks.
