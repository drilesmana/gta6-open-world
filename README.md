[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/drilesmana/gta6-open-world/rank.svg)](https://make.fun/competitions/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/drilesmana/gta6-open-world/reward.svg)](https://make.fun/competitions/gta6-01)

# Velora Heat

Velora Heat is an original open-world crime story that runs entirely in the browser.
You play Dario, a driver in the sun-soaked coastal city of Velora, taking on four jobs
to clear his sister Nia's garage of a $1,500 debt. Walk the streets, steal cars, outrun
the police, and bring the gold Aurelio GT home. Everything in the game — the city, the
characters, the cars, the story — is original and made for this entry.

## Play

Run the development server, then open the game in a browser:

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD to move and drive, Shift to run, E to enter or leave a car, Space for
the handbrake, drag the mouse to look around, M to mute. Your money and mission
progress save to localStorage automatically.

## Verification

The game was tested end to end in a headless browser: title screen, mission brief,
walking on foot, stealing a car, driving, police pursuit with a wanted level and an
escape meter, all four missions, the story finish screen, and save/load. The checks
also confirm the game boots with zero console errors and makes zero failed or external
requests. See QA.md for the full checklist and the latest results.

## Package

Build the entry output with the entrypoint. It validates the game and the screenshots
against the scorer caps first, then copies them and writes the dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The output holds `game/`, `screenshots/` and `dossier.json`, ready to hand in.
