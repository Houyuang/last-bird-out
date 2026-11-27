# LAST BIRD OUT — v2 changes (Round 2)

v1 placed 278 / 4,864. Every change below exists to move one of the judging
criteria — in the judges' own order: **complete & playable > depth of fun >
feel & polish > original look > code structure**. No churn: v1's course,
art plates, chase model and juice are untouched except where noted.

## 1. Combo system — depth (criterion 2), feel (3)

- New `Combo` in `game/js/systems.js`: consecutive corn within **2.5 s**
  builds a streak; every 2 corn raises the multiplier one step, **×1…×5**.
  Damage or timeout resets it. Corn now scores `100 × multiplier`;
  distance scoring is unchanged, so a clean, greedy line is worth far
  more than a safe one — the run has a skill ceiling v1 lacked.
- HUD: `COMBO xN` line with a gold timer bar under the score panel, so
  the decay is readable at a glance. Popups show the multiplied value
  (`+300 x3`); losing a ×3+ streak to a hit fires a `STREAK LOST` popup.
- Audio: a rising `combo(mult)` blip whose pitch climbs with the tier.

## 2. Near-miss bonus — depth (2), feel (3)

- New `NearMiss` in `game/js/systems.js`: when the farmer's or the dog's
  screen gap crosses into a close radius **without a catch**, the game
  pays **+150**, pops `CLOSE! +150`, plays a whoosh, and drops into
  **0.35× slow motion for 0.25 s** — long enough to feel, short enough
  to never steal control. Once per enemy per 2 s (crossing-triggered,
  so parking next to an enemy farms nothing).
- It converts the chase from pure threat into a scoring opportunity:
  skilled players now *want* the farmer close before they break away.

## 3. The Woods has weather now — depth (2), look (4)

- New `Wind` in `game/js/systems.js`, active in zone 4 only: a calm
  period, a **1.1 s warning** (leaves start drifting across the screen),
  then a **2.6 s gust** that pushes the run ±16 % — tailwind one cycle,
  headwind the next, alternating. Speed changes flow through the same
  `speedNow` the jump physics already use, so gusts change jump arcs
  honestly instead of teleporting anything.
- HUD: a wind chip under the right panel while in the Woods —
  `CALM` / `RISING` (flashing) / `TAILWIND >>>` (green) /
  `<<< HEADWIND` (orange). Leaves are a new particle type in
  `particles.js` that inherits the gust direction.
- The final 600 m stops being "the same run, dawn palette" and becomes
  the zone with its own verb: *ride the wind*.

## 4. WIN screen results breakdown — completeness (1), look (4)

- `drawWinOverlay` now closes the run with a clean stat block:
  **Final score · 3,000 m / Time · Corn · Feathers / Near misses ·
  Best combo / Hits taken**, plus a `FLAWLESS RUN!` line on a no-hit
  finish. This required tracking feather pickups as a first-class stat
  (`G.feathers`), which v1 scored but never counted.
- The ending now proves the new systems exist and gives the player a
  scorecard worth beating — and it is the screen in screenshot 4.

## 5. Difficulty fix, 2003–2015 m flame pair — completeness (1)

- The Kitchen's flame-jet pair (ground jet at 2002.9 m, overhead jet at
  2024.1 m) left 21.2 m between a forced slide and a forced jump —
  inside the standard player's reaction envelope once the 0.5 s
  telegraph is honoured. The overhead jet (and its warning sign and
  corn arc) moved **+3 m to 2027.1 m**: 24.2 m of recovery, the next
  obstacle still 26.1 m clear behind it. It remains the hardest moment
  of the run — the standard bot still dies on this jet — it is now
  *fair*, not a coin flip.

## 6. Screenshot set — look (4)

- Replaced v1's seven loose PNGs with the four required frames,
  rendered by the game itself at 1280×720, JPEG, all ≤ 256 KiB:
  `1-menu.jpg` (cover), `2-run.jpg` (Farmyard action, staged clear of
  the 800 m plate-crossfade band and with no vector windmill in frame
  to double the painted one — a v1 framing flaw), `3-kitchen.jpg`
  (night zone, slide under pressure), `4-win.jpg` (the new breakdown,
  with the combo meter and wind chip visible behind it).

## Tuning pass (one number, measured)

- **Near-miss radii: farmer 150 → 200 px, dog 120 → 150 px.**
  First implementation used 150/120 and *never fired once* across a
  full smoke suite plus 12 standard-bot runs. Measurement showed why:
  the chase economy caps real proximity peaks at ~55 (a hit adds +25,
  the stumble carries ~+5, clean running drains the rest), and
  150 px == proximity 71 — a number only a perfect storm reaches.
  200 px == proximity ~51 sits just under the measured peak, so the
  bonus now rewards genuinely close chases that actually happen —
  confirmed live: standard-bot runs recorded near misses after the
  change, with zero errors. The 2.5 s combo window was left exactly
  as specified (it is the spec, and corn spacing already suits it).

## Testing

- Full existing suite (`test/smoke.js`): godmode **WIN, 0 page errors**;
  frame-perfect driver 2 wins / 1 caught (course still bites);
  standard bot **WIN recorded** (seed 41, 1 heart left), 4/6 runs into
  the Woods in the same batch. Across 24 standard-bot runs on v2:
  1 win, 9 Woods finishes-or-better, 0 errors — statistically level
  with v1's own calibration batch (1 win / 6, 2 Woods), with deeper
  average runs. Every non-winning run ends in CAUGHT: death works.
- The bot samples vary a lot run-to-run (its key release is wall-clock
  timed); the one systematic effect found — near-miss slow motion can
  desync the *bot's* timed key release — does not apply to human
  input, which is state-based.
- New systems were also unit-verified in Node: wind alternation and
  ±15 % speed factors, combo tier sequence to ×5 with timeout/damage
  resets, near-miss crossing semantics (fires on entry, never while
  parked inside, per-enemy cooldown).
- Still `file://` offline-playable, zero external assets, same module
  layout — the new systems live in one aptly named module,
  `game/js/systems.js` (`Combo`, `NearMiss`, `Wind`).

## Cut

- Nothing from the upgrade list. The only removals are v1's stale
  screenshot PNGs, superseded by the four required JPEGs.
