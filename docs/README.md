# Regolith documentation

Every document about Regolith, grouped by what it is for. Where two disagree, the code and its tests are right,
and the documents are fixed. For the game itself, start with the [project README](../README.md); for where the
project stands, the [roadmap](ROADMAP.md).

## The game

| Doc | What it holds |
|---|---|
| [RULES.md](RULES.md) | Every rule stated once, precisely: setup, the turn, the mechs, combat, cards, winning, and the numbered rulings the engine cites. The player's manual teaches the same rules (`#rulebook` in the app). |
| [REGOLITH-WORLD.md](regolith/REGOLITH-WORLD.md) | The story, the themes, the five sides, the six mechs, the objectives and the game's words. Names are decided here first. |
| [HEX.md](HEX.md) | The hex board: tiles, how the rules read on them, every map group, and how maps are drawn and measured. |
| [Mood board](moodboards/regolith/README.md) | The look: ground, mechs, cards and objectives. Mirrors a design canvas on claude.ai. |

## Status and design

| Doc | What it holds |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Where the project stands, area by area, and what is left. |
| [PROTOTYPING.md](regolith/PROTOTYPING.md) | The rules' design log: the thesis, every rule tried, the experiments and their results. |
| [REGOLITH.md](regolith/REGOLITH.md) | How Regolith is built as a product: its deck, card art, words, and order of work, with open decisions. |
| [card-benchmark.md](card-benchmark.md) | The cards measured in AI self-play: which are blank, which are too strong. |
| [HEX-CONCEPTS.md](HEX-CONCEPTS.md) | Ideas for growing the game from the hex board. None built; a menu to pick from. |

## Engineering

| Doc | What it holds |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The packages and modules, how to add an action, card, rule set or map, and the tests. |
| [AI.md](AI.md) | How each of the five AI ranks chooses, their measured strength, and next steps. |
| [MULTIPLAYER.md](MULTIPLAYER.md) | Serverless online play over Nostr: the protocol, its limits, and the server options. |
| [MOBILE.md](MOBILE.md) | Phone and tablet support: what was measured, what was built, the device checks. |
| [GRAPHICS.md](GRAPHICS.md) | The art package, the Art Lab and the print pipeline: one drawing for screen and paper. |
| [CODE-REVIEW.md](CODE-REVIEW.md) | The two issues a whole-repository review left open on purpose, and what would change that. |

## Records and working files

| Doc | What it holds |
|---|---|
| [SPLIT.md](regolith/SPLIT.md) | How Regolith left Cubic for its own repository, on 27 October 2026. Kept as a record. |
| [card-ideas.yaml](regolith/card-ideas.yaml), [card-text-ideas.yaml](regolith/card-text-ideas.yaml) | Name, art and text candidates for each card, fed to the Card Picks page. |
