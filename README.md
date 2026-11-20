[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/drilesmana/gta6-open-world/rank.svg)](https://make.fun/competitions/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/drilesmana/gta6-open-world/reward.svg)](https://make.fun/competitions/gta6-01)

# Velora Heat

Velora Heat is a sun-soaked open-world crime story that runs entirely in the browser. You play Dario, a driver in the coastal city of Velora, taking on four jobs to save his sister Nia's garage from debt — driving fares across town, moving a package under the radar, shaking off a police pursuit, and finally stealing the gold Aurelio GT. Everything is original: the city, the characters, and the story were built from scratch for this entry.

## Play

Run the dev server from the repo root, then open the game in your browser:

```sh
node serve.ts
```

Then visit http://localhost:8080.

Controls:

- **WASD / Arrow keys** — walk on foot, drive when in a car
- **Shift** — run
- **E** — enter / exit a car (walk up to a parked or stopped car)
- **Space** — handbrake while driving
- **Mouse** — look around
- **M** — mute audio

Progress and money save to localStorage automatically.

## Verification

The game was tested end to end in a headless browser: title screen, mission brief, walking on foot, stealing a car, driving, police pursuit with wanted stars and an escape meter, all four missions completing in order, the story finish screen, and save/load. The checks run from the repo root:

```sh
python3 tests/verify_package.py   # entry caps: game/ size, screenshots, dossier
python3 tests/playtest.py         # headless playthrough
```

The game boots with zero console errors and makes zero external or failed requests at runtime — Three.js is vendored under `game/vendor/` and every asset is generated locally.

## Package

Build the submission output (game, screenshots, dossier) with the entrypoint:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This validates the entry against the scorer caps first — game file count and bytes, index size, screenshot count and size — and refuses with a readable error before copying anything if a cap is broken. On success, `out/` holds `game/`, `screenshots/`, and `dossier.json`.
