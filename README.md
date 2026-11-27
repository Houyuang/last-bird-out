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
