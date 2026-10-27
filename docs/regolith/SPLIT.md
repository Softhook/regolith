# Splitting Regolith from Cubic

Two games come out of this repository:

- **Regolith**, a fully standalone game in its own repository (`~/Documents/GitHub/regolith`, remote
  `github.com/Softhook/regolith`, empty for now), deployed to `softhook.github.io/regolith`. It shares nothing
  with Cubic at runtime or build time and has no Quantum modes: only its own two, **Basic** (no cards, for
  learning) and **Regolith** (the full game).
- **Cubic**, this repository, which keeps **Basic, Classic and Community** and nothing of Regolith. It is
  called Cubic throughout, in place of the `quantum` names it carries today.

The rules of Regolith stay in [PROTOTYPING.md](PROTOTYPING.md) and its cards and look in
[REGOLITH.md](REGOLITH.md). Both move with it.

## Decided (2026-10-26)

| | |
|---|---|
| Regolith | Its own repo, app, packages, docs and history. Two modes: **Basic**, Regolith's rules without cards, for learning; **Regolith**, the full game with its deck. |
| Cubic | This repo. Basic, Classic and Community only. Renamed from `quantum` to `cubic` in packages, storage and the dev hooks. |
| How Regolith starts | A **copy of Cubic's `main` with its history**, taken before Regolith is removed here, so `git blame` on its rules and rulings still works. Cubic is tagged `regolith-split` at that point. |
| Old games | Saved and online Regolith games from Cubic aren't carried over (no users; online games are disposable). |
| Credit | Regolith's rules come from Quantum's, so its lobby and manual still credit Quantum (Eric Zimmerman) and the Community Edition. |

## What makes it cheap

[REGOLITH.md §1](REGOLITH.md#1-the-rename) kept Regolith apart. The engine reaches it only through
`RULESETS.regolith` ([rulesets.ts](../../packages/engine/src/rulesets.ts)). Its folder
([packages/engine/src/regolith/](../../packages/engine/src/regolith)) uses the engine only through the
prototype kit ([prototype.ts](../../packages/engine/src/prototype.ts)). The rest of the code asks the rule set
(`contestedOrbit`, `words`, `look`, …), and `regolith.test.ts` checks it. Removing a mode means deleting
its rule set and following the type errors.

### Prepared already

The app's identity is now set in one place each, so each repo changes one line:

| What | Where | Cubic | Regolith |
|---|---|---|---|
| Browser storage: every localStorage and sessionStorage key, the IndexedDB name and the service worker's font cache | `APP_ID` in [apps/web/src/appId.ts](../../apps/web/src/appId.ts) | `quantum` → `cubic` | `regolith` |
| The name players see: the lobby and top bar, the share sheet, the manual, print PDFs and sheets, and every saved file (`cubic-manual.html`, `cubic-tiles.zip`) | `GAME_NAME` in [apps/web/src/appId.ts](../../apps/web/src/appId.ts) | `Cubic` | `Regolith` |
| Online namespace: relay tags and game keys are derived under it | `NAMESPACE` in [packages/online/src/codec.ts](../../packages/online/src/codec.ts) | `cubic` | `regolith` |
| The lobby's first mode | `DEFAULT_MODE` in [rulesets.ts](../../packages/engine/src/rulesets.ts) | `community` | `regolith` |

Nothing else names the app: console messages are tagged `[game]`, the dev hooks are `window.__game` and
`window.__gameOnline`, and the browser scripts build storage keys with `appKey` (as `replay-check.ts` does).

Tests that run every mode (golden games, legal-action consistency, malformed-action fuzzing, power usage,
board highlights) loop over `MODES`, and the hex consistency games over the modes whose `mapGroups` have
`hex`, so deleting a rule set drops its cases in either repo without editing the tests. Tests that need just
some game use `basic` or `DEFAULT_MODE`, not Regolith. The AI's Regolith positions are in their own file,
`packages/ai/test/regolith.test.ts`. Regolith cases still inside shared files: four card scenarios
(`card-scenarios.test.ts`, kept there for its coverage check), two in `highlights.test.ts`, the
over-conquest ones in `conquerTap.test.ts`.

Both apps are served from `softhook.github.io`, **one origin**, so with the same storage names they would
read each other's saved game, lobby choices and online identity. Cache Storage is per origin too: Workbox
names its precache after the service worker's scope, and the font cache is named after `APP_ID`, so the
offline caches don't collide (check with `npm run pwa:check` after the first deploy of each).

## Where each file goes

Packages and the app split by the phases below; docs, scripts and the reference material go like this.
"Both" means both repos keep it, each edited to its own game.

| | Both | Regolith only | Cubic only |
|---|---|---|---|
| Docs | AI.md, ARCHITECTURE.md, GRAPHICS.md, MOBILE.md, MULTIPLAYER.md, CODE-REVIEW.md | `docs/regolith/` (with `card-ideas.yaml`, `card-text-ideas.yaml`), `docs/moodboards/regolith/`, HEX.md, HEX-CONCEPTS.md | RULES.md, OPEN-QUESTIONS.md, RULE-SUGGESTIONS.md, card-benchmark.md, ROADMAP.md, VISUAL-IDEAS.md |
| Scripts | `ab`, `args`, `pool`, `sprt`, `ai-match`, `build-data.mjs`, `card-audit`, `selfplay-cards`, `skill-ab`, `mobile-*`, `online-sim`, `perf-probe`, `zoom-probe`, `fullscreen-check`, `relay-check`, `replay-check`, `pwa-check`, `cmyk-table`, `press.icc`, `ui-check` | `power-ab`, `power-usage`, `stall-probe`, `interaction`, `regolith-card-picks.*`, `hex-check`, `ground-check` | `basic-sweep` (Quantum's Basic rules) |
| Reference | | | `reference/`: Quantum's rulebooks and cards, which only Quantum's modes and their tests cite |

In Regolith, `perf-probe` and `zoom-probe` time a Regolith game in place of a 4-player Community one, and
`card-audit` and `selfplay-cards` play its decks.

## The order

Regolith has to be copied out before Cubic deletes it:

1. **Seed Regolith** (Phase 1), from Cubic as it is now.
2. **Regolith on its own** (Phases 2–3), in the Regolith repo, until it deploys.
3. **Cubic without Regolith** (Phases 4–5), in this repo. It can start as soon as Phase 1 is done.

## Phase 1: seed the Regolith repo

1. In Cubic: commit, `git tag regolith-split`, push the tag.
2. In `~/Documents/GitHub/regolith`: `git pull ../cubic main`, then `git push -u origin main`.
3. `npm install && npm run check` there must pass before anything is deleted, so there's a known-good start.

## Phase 2: Regolith's identity

One commit, no rule changes:

- `APP_ID = 'regolith'`, `NAMESPACE = 'regolith'`, `DEFAULT_MODE = 'regolith'`, `GAME_NAME = 'Regolith'`.
- Packages `@quantum/*` → `@regolith/*` (every `package.json`, every import), root package `name`.
  The browser scripts' dev hooks are `window.__game` and `window.__gameOnline` in both apps, so they stay.
- [index.html](../../apps/web/index.html) `<title>`, [manifest.webmanifest](../../apps/web/public/manifest.webmanifest)
  name, colours (the ground palette, not `#050813`), icons and favicon from the mood board, the lobby's credit
  line. The file names in `apps/web/test/print.test.ts` follow `GAME_NAME` (`regolith-manual.html`, …).
- README for Regolith: **Regolith, a game by Christian Nold**, inspired by *Quantum* (Eric Zimmerman, FunForge 2013)
  and its fan-made Community Edition (stolksdorf/quantum and contributors), with links to both. It says what
  Regolith is (mechs on the ice of Mars and its moons, on hex maps), plays in the browser and prints. Keep the
  Develop section's commands; drop "working title" and the Quantum doc table.
- Enable Pages on the repo. The Pages workflow carries over as is, its `layout` and `pwa` jobs included.

## Phase 3: Regolith sheds Quantum

Regolith's two modes become the engine's only rule sets. One commit per step, `npm run check` green at each:

1. **Two rule sets.** Delete Quantum's `basic`, `original` and `community`. Inline `regolithMode(COMMUNITY)`
   into a plain `RuleSet`, `regolith`, and make Regolith's own `basic` from it with `cards: null`: the same mechs,
   powers, zones of control, contested orbits and hex maps, without research, the market or a starting skill.
   It is today's `REGOLITH_CARDS = false`, as a mode in the lobby rather than a switch, so the switch goes.
   `GameMode = 'basic' | 'regolith'`, `MODES = [basic, regolith]` (Basic first, as a learning mode),
   `DEFAULT_MODE = 'regolith'`. The lobby's mode menu stays, with two entries. Delete the tests that pin
   Quantum's modes, and give Basic its own golden games.
2. **Cards.** `data/cards.yaml`, the Original and Community decks, the holo card renderer
   (`packages/art/src/card.ts`, `scenes/`) and the Redesigns view go. Regolith's cards keep their `effect` ids
   (they are its rules now). `from` stays as a note of where a card started, but
   [build-data.mjs](../../scripts/build-data.mjs) stops checking it against Community's deck. The `*-original`
   effects, `ingenious`, `refresh` and every `CardRules` switch Regolith doesn't use go.
3. **Maps.** Keep the `hex`, `open` and `drift` groups. Drop the square maps, `drift-square` and the BGA and
   CE groups.
4. **Switches become rules.** `contestedOrbit`, `contestedDeploy`, `homeShipyard`, `maxMovement`,
   `startingMissiles`, `reconfigure: 'unseen'`, `look: 'ground'`, `cards.look`: always on, so the "off" branches
   go. `REGOLITH_OVER_CONQUEST` stays as a switch while PROTOTYPING.md still tries it. Switches that differ
   between Basic and Regolith (`cards`, maybe `startingMissiles`) stay on the `RuleSet`.
5. **No boundary.** The prototype kit and `regolith.test.ts`'s import checks only kept Regolith away from
   Quantum. Fold `src/regolith/` into the engine (`powers/` stays, one file a power), keep `ShipHooks` as the
   way powers plug in.
6. **Words at the source.** Write the log, rule errors and card text in Regolith's words ("mech",
   "objective", "control"), then drop `REGOLITH_WORDS`, `reword` and `useSay`. Code identifiers (`Die`, `ship`,
   `planet`) can stay; renaming them is last, and only if wanted.
7. **Square grid.** Regolith is hex only, so the square paths in `board.ts`, the art and the web board go,
   after the Tile Lab stops printing square tiles (step 10).
8. **AI.** Every term and value the AI keeps must still mean something: `cardValues.ts` keyed by Regolith's
   `effect` ids only (its cards keep Community's values through them, `science` its own), Quantum-only
   effects gone. `ai.test.ts`'s full games play **Basic and Regolith** at every level, with invariants;
   `ai:match` defaults to Regolith, not Basic. See *Done when* below.
9. **Manual.** Rewrite `rulebook/Manual.tsx` (the in-game "How to play" and the printable `#rulebook`) for
   Regolith: its turn, mechs and their powers, zones of control, contested orbits, the deck, and Basic as
   "the game without cards". Diagrams in `diagrams.tsx` drawn on hex tiles on the ground, not 3 × 3 square
   tiles in space. The rule set table compares Basic and Regolith. Credits as in the README.
10. **Player aid and maps.** Remake the player aid (`art/src/aid.ts`, `AidEdition` = `basic | regolith`):
   the mech table with each power, the turn, contested orbits and zones of control, in the ground palette.
   The Tile Lab prints only what Regolith plays: hex tiles on Phobos, Deimos and Mars (no square tiles, no
   space look), and a sheet of each map's layout (which tiles, where) for setting up at a table.
11. **Docs.** As in *Where each file goes*: the shared docs edited to Regolith, the Cubic-only ones and
   `reference/` dropped. Write a Regolith rulebook and player aid (REGOLITH.md §9 step 6), and a roadmap from
   REGOLITH.md §9 in place of ROADMAP.md.

### Phase 3 is done when

Each is checked before Regolith's first deploy, not just at the end:

- **AI.** `npm test` plays full AI games on Basic and Regolith at every level. `npm run ai:match` shows each
  level beating the one below on both modes (the levels were measured on Quantum's modes, not these), and
  `selfplay:stalls` shows no stalled games. The AI uses every power and the barrier.
- **Art Lab** (`#lab`). Every page opens and exports: tiles (single, ZIP, PDF sheets, CMYK press sheets),
  cards (Regolith's decks in the screenprint look, the backs, the ZIP and press sheets), the player aid and
  the proof page. `npm run ground:check` is clean. No Original or Community deck, and no Redesigns view.
- **Manual and player aid.** Remade (steps 9–10), both read in Regolith's words, and the manual's downloaded
  file is `regolith-manual.html`.
- **The rest.** `npm run check`, `ui:check`, `hex:check`, `mobile:play` and `pwa:check` pass.

## Phase 4: Cubic without Regolith

In this repo, once Phase 1 is pushed. Everything Regolith brought goes, not just the mode, so the engine
is back to the three modes' rules. One commit per row group, `npm run check` green each time, and **the golden
games for Basic, Classic and Community unchanged**, which proves Cubic still plays as before.

| Area | Goes |
|---|---|
| Mode | `src/regolith/`, `RULESETS.regolith`, `'regolith'` in `GameMode`, `data/regolith.yaml` and its `build-data.mjs` step, `regolith.test.ts` in the engine and the AI, and the Regolith cases left in other tests (see *Prepared already*) |
| Ship powers | `prototype.ts`, `ShipHooks`, `hooksOf`, `modeHasHook`, the `power` action, zones of control (`stopZone`); `ShipDef.hooks` |
| Engine state | `GameState.barriers`, `addBarrier`, `barrierAt`, `barrierSpaces`, the `placeBarrier` and `kineticShunt` pendings and actions, their invariants; `homeShipyard` on players |
| Rule switches | `maxMovement`, `overConquest`, `contestedOrbit`, `contestedDeploy`, `homeShipyard`, `words`, `look: 'ground'`, `cards.look`, `cards.expansion`, `experimental` |
| Card effects | `barrier`, `kinetic-shunt`, `sabotage-double`, `science`; `CardDef` fields `from`, `status`, `brief`; `addCards` for a mode's own decks |
| Words | `words.ts`, `reword`, `say` / `useSay`: Cubic speaks Quantum's words only |
| AI | barrier and `threatens` terms in `evaluate.ts`, `greedy.ts`, `search.ts`, `candidates.ts`; Regolith's entries in `cardValues.ts` |
| Art | `packages/art/src/screenprint/`, and the ground tiles in `art/src/regolith/` (`REGOLITH_SHADOW`, `REGOLITH_GROUND_PX`, `mapLook.ts`, the Tile Lab's worlds) |
| Hex | No Cubic mode plays a hex map, so Cubic is square only again: the `hex`, `open`, `drift` and `drift-square` map groups and `offset-hex`, `grid` on maps, the hex paths in `board.ts`, `art/src/tile/` and the web board, and their tests. Last, as it is the widest |
| Web | `BarrierBubble`, the zone-of-control tint, power and shunt controls, the `ground` screen palette in styles.css, the mode's decks in `art/cards.ts` and the Card Lab's Regolith edition |
| Scripts | `regolith-card-picks.*`, `power-ab`, `stall-probe`, `power-usage`, `interaction`, `hex-check`, `ground-check`, and their npm scripts (`regolith:picks`, `selfplay:powers`, `selfplay:stalls`, `power:usage`, `interaction`, `hex:check`, `ground:check`); `ui-check`'s over-conquest and contested-orbit checks; knip.json's `prototype.ts` and `powers/` entries |
| Docs | `docs/regolith/`, `docs/moodboards/regolith/` (in the Regolith repo now), HEX.md, HEX-CONCEPTS.md; the README and ARCHITECTURE.md lose their Regolith lines and gain one pointing to the Regolith repo |

Start with the mode and data, then follow the type errors and knip's unused-export report until both are clean.

## Phase 5: Cubic is called Cubic

One commit, no rule changes:

- Packages `@quantum/*` → `@cubic/*`, root package `"name": "quantum"` → `"cubic"`.
- `APP_ID = 'cubic'` (storage keys `cubic.*`, IndexedDB `cubic-art`). Saved games under `quantum.*` are dropped:
  there are no users.
- The README stops saying "working title". The lobby and manual already say Cubic.
- "Quantum" stays where it names the original game: the credits, the rulebook, `Quantum Entanglement`.

## Open decisions

- **Missiles in Regolith's Basic:** Quantum's Basic has none (they came with the Community Edition). Leave
  them out to keep the learning game smallest, or keep them so Basic plays exactly like Regolith minus the
  cards. Leaning: keep them, so what a player learns carries over unchanged.
- **AI on Basic:** the AI plays every card-free mode, but its levels haven't been measured on Regolith
  without cards; check them with `npm run ai:match` before the first deploy.

## Afterwards

- The Card Picks page and the mood board canvas sync with the Regolith repo, not Cubic.
- This file moves to the Regolith repo as its history. Cubic keeps only the README's pointer.

## Done (2026-10-27)

The split is finished. Regolith is pushed to its own repository and deploys to
[softhook.github.io/regolith](https://softhook.github.io/regolith/). Cubic went through Phase 4 (the mode and
rules, the art, hex, the docs) and Phase 5 (the rename), with its golden games for Basic, Classic and
Community unchanged throughout. This file stays here as the split's history; Cubic keeps only a pointer to
this repository in its README and ARCHITECTURE.md.
