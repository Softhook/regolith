# Roadmap

Regolith plays in the browser (on a device, against the AI, or online) and prints. What is left, roughly in
order. Done work is in the git history; how the rules got here is in [PROTOTYPING.md](regolith/PROTOTYPING.md).

## Rules

- [ ] **Cards, one by one** ([REGOLITH.md §9](regolith/REGOLITH.md#9-order-of-work) step 5): rename with
      Regolith's words and give each its own scene, then rework or replace the cards
      [card-benchmark.md](card-benchmark.md) finds blank (Remodel, Engineering, Sneak) or too strong
      (Unstable Reactor, Entrenched, Science Survey, Field Refit). Playtest and AI self-play as they land.
- [ ] **Deck size and names**, and whether Reinforcements stays (REGOLITH.md, *Open decisions*).
- [ ] **Playtest with people.** All results so far are AI self-play. Watch for home turtling and stalls on
      contested perimeters: the AI hardly garrisons, so it may understate them.
- [ ] Give the AI a garrison term for its own objectives, then re-measure contested perimeters
      (PROTOTYPING.md §6.8).
- [ ] Run the interaction measure (`npm run interaction`) with 3–4 players.
- [ ] Over-conquest stays off unless a playtest wants it back (`REGOLITH_OVER_CONQUEST`, PROTOTYPING.md §6.10).

## AI

- [ ] Measure the levels on Basic and Regolith (`npm run ai:match`), as they were tuned on the earlier modes.
- [ ] Card values from Regolith's own benchmark, not Community's ([cardValues.ts](../packages/ai/src/cardValues.ts)).
- [ ] Better play with more than 2 players (who attacks whom).

## Print

- [ ] **One look for map and cards:** whether the tiles and dice move further towards the screenprint inks
      (REGOLITH.md, *Open decisions*).
- [ ] **Physical proof:** a tile, a card, the player aid and a map sheet at 100 %, with real dice and cubes.
- [ ] **Vendors:** choose card and tile printers and set trim and bleed to their specs ([GRAPHICS.md](GRAPHICS.md)).
- [ ] **Components:** dice (engraved mechs?), cubes, atomic, barrier and tunnel tokens, box.
- [ ] Tile backs and box art.

## App

- [ ] **Mobile:** the real-device pass on the Moto G55 ([MOBILE.md](MOBILE.md)).
- [ ] **CI:** run `npm run pwa:check` before deploying.
- [ ] Replay viewer: step through a finished game from its seed and actions.
- [ ] Online: a smoke test through the real relays; turn notifications and fair dice need a server
      ([MULTIPLAYER.md](MULTIPLAYER.md)).

## Project

- [ ] **Licence** for the code and the content; there is no LICENSE file yet.
- [ ] **Credit and contact** the Community Edition's authors (stolksdorf, WaterGoesRed).
