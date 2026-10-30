# Status & roadmap

Where Regolith stands, and what is left, roughly in order. Done work is in the git history; how the rules got
here is in [PROTOTYPING.md](regolith/PROTOTYPING.md).

## Where we are

*30 October 2026.* Regolith is a complete game, playable end to end, and in playtesting.

| Area | State |
|---|---|
| **Rules** | Settled for now ([RULES.md](RULES.md)): movement cap 3, zones of control, contested perimeters, the six mechs' powers, Take Over. Measured in AI self-play, not yet in playtests with people. |
| **Modes** | Basic (no cards) and Regolith (the full game). |
| **Cards** | 34 Skills, 11 Tactics and Reinforcements, every one implemented and checked against its text by the card audit. Each has a Regolith name and a screenprint scene; their text and actions are being reworked card by card ([REGOLITH.md §9](regolith/REGOLITH.md#9-order-of-work), step 5). |
| **Maps** | 39, for 2 to 5 players, on Mars, Phobos and Deimos, in four groups: hex, open ground, drift and prepared ground ([HEX.md](HEX.md)). |
| **Players** | 2 to 5, any mix of people and AI. Five players since 28 October, on three maps of their own. |
| **AI** | Five ranks, Cadet to General, each beating the one below in Basic and Regolith ([AI.md](AI.md)). Card values from Regolith's own benchmark and the earlier Community one ([card-benchmark.md](card-benchmark.md)). |
| **Online** | Serverless, live or asynchronous, over public Nostr relays ([MULTIPLAYER.md](MULTIPLAYER.md)). |
| **Learning** | An animated tutorial in the lobby, ending in a practice game; *How to play* in the game; the printable rulebook at `#rulebook`. |
| **Look and sound** | Each world's ground on the tiles; a base for each objective; screenprint cards; synthesised effects and an ambient score for each world. |
| **Devices** | Desktop, phone and tablet, checked in emulation on every deploy; installs as an app and plays offline ([MOBILE.md](MOBILE.md)). |
| **Print** | Tiles, cards, map setup sheets and the player aid export at physical size with bleed and crop marks ([GRAPHICS.md](GRAPHICS.md)). Not yet proofed on paper. |
| **Quality** | Engine tests, golden replays, a legal-move cross-check, a card audit and invariant checks on every step; lint, format, circular-import and dead-code checks; browser checks before every deploy ([ARCHITECTURE.md](ARCHITECTURE.md#tests)). |

## Rules

- [ ] **Cards, one by one** ([REGOLITH.md §9](regolith/REGOLITH.md#9-order-of-work) step 5): rework or replace
      the cards [card-benchmark.md](card-benchmark.md) finds blank (Remodel, Engineering, Sneak) or too strong
      (Unstable Reactor, Entrenched, Science Survey, Field Refit), and settle each card's text (the current
      round of the Card Picks page). Playtest and AI self-play as they land.
- [ ] **Deck size and names**, and whether Reinforcements stays (REGOLITH.md, *Open decisions*).
- [ ] **Playtest with people.** All results so far are AI self-play. Watch for home turtling and stalls on
      contested perimeters: the AI hardly garrisons, so it may understate them.
- [ ] Give the AI a garrison term for its own objectives, then re-measure contested perimeters
      (PROTOTYPING.md §6.8).
- [ ] Run the interaction measure (`npm run interaction`) with 3 to 5 players.
- [ ] Measure the five-player maps' seats (`npm run selfplay:maps`): they are balanced by a mirror, not a turn
      ([HEX.md](HEX.md#five-players)).
- [ ] Over-conquest stays off unless a playtest wants it back (`REGOLITH_OVER_CONQUEST`, PROTOTYPING.md §6.10).

## AI

- [ ] Better play with more than 2 players (who attacks whom), now that tables go up to 5.
- [ ] Re-measure card values as cards are reworked ([cardValues.ts](../packages/ai/src/cardValues.ts)).

## World

- [ ] The objectives' names (Habitat, Refinery, Ice Mine, Reactor) in the game, not only in the tutorial.
- [ ] The five sides in the game: their names on the seats ([REGOLITH-WORLD.md](regolith/REGOLITH-WORLD.md#the-sides)).

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

- [ ] **Licence** for the code and the content; there is no LICENSE file yet, so all rights are reserved.
- [ ] **Credit and contact** the Community Edition's authors (stolksdorf, WaterGoesRed).
