[![make.fun · turkey-run-game-01](https://make.fun/badge/turkey-run-game-01.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![rank](https://make.fun/badge/turkey-run-game-01/Houyuang/last-bird-out/rank.svg)](https://make.fun/bounty/turkey-run-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)
[![reward](https://make.fun/badge/turkey-run-game-01/Houyuang/last-bird-out/reward.svg)](https://make.fun/bounty/turkey-run-game-01?utm_source=github&utm_medium=readme&utm_campaign=turkey-run-game-01)

# LAST BIRD OUT

A 2D canvas turkey escape runner. Thanksgiving is coming and you are the main course: sprint 3000 metres from the farmyard to the safety of the woods before the farmer — and, from the Barn onwards, his dog — run you down. The escape crosses four zones that shift as you run: the Farmyard by day, the Barn at dusk, the Kitchen at night, and the Woods at dawn. Graze corn and golden feathers, dodge flame vents and puddles, and don't get caught: you have 3 hearts.

## Controls

- **Move / jump:** Arrow keys or WASD — press jump twice for a double jump
- **Slide:** Down arrow / S (also ducks under hazards)
- **Dash:** Shift — burns stamina, smashes straight through fences
- **Hide:** duck into a haystack to break the chase and let the farmer's suspicion cool off
- **M** mute, **P** pause, **R** restart

## Run it

Serve the `game/` folder with any static file server and open `game/index.html` in a desktop browser — it plays fully offline, no build step. Or produce the packaged output (game + screenshots + `dossier.json`) with Node 22:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Tech

Zero dependencies. Everything runs on a plain HTML canvas: all characters, animation and effects are drawn in code, layered over painted storybook backdrop plates (`game/img/plate-*.jpg`) that crossfade between zones. Sound is synthesized at runtime — no audio files, no fonts, no network requests.

## What's new in v2

- **Combo streaks:** chain corn pickups within 2.5 s to raise a ×1–×5 score multiplier, shown live in the HUD; getting hit or letting the timer lapse drops the streak.
- **Near-miss bonuses:** slip past the farmer or the dog at close range for a CLOSE! bonus and a brief slow-motion beat.
- **Woods wind:** the final zone has weather — leaf-drift warnings, then alternating tailwind and headwind gusts that honestly bend your jump arc, with a live wind readout in the HUD.
- **Full results screen:** the WIN screen now breaks down final score, time, corn, feathers, near misses, best combo and hits taken.
- Fairer flame pairing at the 2003–2015 m Kitchen gauntlet (still the hardest moment of the run), and a refreshed screenshot set. Full notes in `V2-CHANGES.md`; the new systems live in `game/js/systems.js` (`Combo`, `NearMiss`, `Wind`).
