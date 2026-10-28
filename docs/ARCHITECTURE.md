# Architecture

How the code is organised, and where to make the common changes.

## Packages

| Package | Role | Depends on |
|---|---|---|
| [`packages/engine`](../packages/engine) | The rules. A game is `apply(state, action) → state`: pure, deterministic (seeded RNG in the state), serialisable. | — |
| [`packages/ai`](../packages/ai) | AI players in five levels ([AI.md](AI.md)). Chooses among `legalActions(state)`; never sees the real RNG or deck order. | engine |
| [`packages/art`](../packages/art) | Artwork as SVG text: tiles on each world's ground, cards in the screenprint look, the player aid and map sheets ([GRAPHICS.md](GRAPHICS.md)). Plain functions, seeded, in mm; shared by the game and print. | — |
| [`packages/online`](../packages/online) | Online play without a server ([MULTIPLAYER.md](MULTIPLAYER.md)): a game as a log of signed, encrypted posts; `Timeline` replays it with the engine so every browser computes the same game. No network code. | engine |
| [`apps/web`](../apps/web) | React UI. Renders a state, sends actions. Holds no rules of its own: buttons and highlights come from `legalActions` ([`game/legal.ts`](../apps/web/src/game/legal.ts)). The Art Lab is at `#lab` (tiles), `#lab/cards`, `#lab/aid` (player aid), `#lab/maps` (map setup sheets) and `#lab/proof` (press test); the player manual at `#rulebook` (the same `Manual` component as the in-game How to play dialog). | engine, ai, art, online |
| [`data/`](../data) | Cards and maps as YAML, compiled to JSON by `npm run data`. | — |

## Engine modules

| File | Contents |
|---|---|
| `engine.ts` | Public API (`apply`, `tryApply`, `actor`) and the handler registry |
| `rules.ts` | `RuleSet`: everything that differs between Basic and Regolith; `rulesOf()` |
| `rulesets.ts` | `RULESETS`, the rule set of each mode, with the mechs (`ships.ts`). It hands the table to `rules.ts` when it loads, so each module that takes a state from outside (`setup`, `engine`, `invariants`) imports it |
| `actionShape.ts` | `isWellFormed()`: the shape of every action, checked by `apply` before any handler (actions from other browsers are untrusted) |
| `setup.ts` | `createGame` and the setup decisions |
| `actions.ts` | Move/Attack, Deploy, Reconfigure, Research, Conquer, end turn |
| `abilities.ts` | The mechs' powers built into the engine (1–4) |
| `ships.ts`, `powers/` | The mechs by die value, and the powers that plug in through `ShipHooks` (Shoot, Barrier, the zone of control) |
| `combat.ts` | Attacks, missiles, advancing, Take Over |
| `cards.ts` | Card market, Tactic effects, card decisions |
| `effects.ts` | The implemented Skill and Tactic effects, as types |
| `skillRules.ts` | What every skill does: one entry of hooks per skill (`SKILL_RULES`) |
| `skillActions.ts` | Skills used as an action of their own |
| `turn.ts` | Start/end of turn; `settle()` auto-resolves decisions after each action |
| `legal.ts` | `legalActions()` |
| `queries.ts` | Read-only questions: movement, conquer check, combat totals… |
| `lookups.ts` | Where dice are, what is on a space; no rules |
| `core.ts` | Shared helpers: errors, log, dice, dominance/research, cubes |
| `invariants.ts` | `checkInvariants()`: consistency checks every state must pass |
| `board.ts`, `mapStats.ts`, `data.ts`, `rng.ts`, `types.ts`, `undo.ts` | Board geometry, map stats, card/map data, RNG, types, undo policy |

Two ideas hold it together:

- **Actions and decisions.** A player acts by sending an `Action`. When the rules need someone to
  choose (combat, Take Over, picking a card…), a `Pending` decision is queued in `state.pending`; the
  head of the queue must be answered before anything else. The UI and the AI use the same mechanism.
- **Exhaustive registries.** `Handlers` (engine.ts) maps every `Action` type to one handler;
  `DECISION_CANDIDATES` (legal.ts) maps every `Pending` kind to its possible answers. Both are typed so
  that adding an action or a decision without handling it is a compile error. Skill effects, Tactic
  effects and once-per-turn tags are union types too, so a misspelt name doesn't compile, and
  `SKILL_RULES` must have an entry for every skill effect.
- **One source of truth for "may I?".** A handler decides whether an action is legal. `legalActions`
  lists the same actions for the AI and the UI; `consistency.test.ts` checks that the two agree in both
  directions. The UI never re-checks a rule, it asks `legalActions`.

## Web app game modules

In [`apps/web/src/game`](../apps/web/src/game):

| File | Contents |
|---|---|
| `useGame.ts` | The game being played: state, `dispatch`, undo (and Ctrl/Cmd+Z), engine-error reporting |
| `useAiDriver.ts` | Moves for the AI players, with delays so humans can follow; AI responses in combat |
| `aiClient.ts`, `aiWorker.ts` | Runs the AI in a Web Worker, falling back to the main thread |
| `toasts.ts`, `sounds.ts` | The toast and sound for each step, derived from what changed and the new log entries |
| `strike.ts`, `cast.ts`, `useTransient.ts` | Ships destroyed by a step, which card a step is the doing of, and transient step effects |
| `review.ts`, `past.ts` | Looking back at earlier positions from the log |
| `controller.ts` | The human's selection (`Sel`) and what a click on a die, space or planet does |
| `highlights.ts` | `highlightsFor()`: what the board lights up, derived from the legal actions |
| `hints.ts` | The one-line hint for the current decision or selection |
| `legal.ts` | The legal actions indexed by type, for buttons and highlights |
| `view.ts` | `GameView`: a game as the screen sees it, local (`useGame`) or online (`useOnlineGame`) |

In [`apps/web/src/online`](../apps/web/src/online): `useOnlineGame.ts` (the game's posts: loaded,
synced, replayed and posted; catching up on others' moves; moving AI seats), `playback.ts` (which
move to show next while catching up, and when), `relays.ts` (the relay connections), `storage.ts`
(identity and events in localStorage), `games.ts` (the list of this device's online games), `create.ts`,
and `OnlineScreen.tsx`. The game screen itself (`components/GameScreen.tsx`) is shared with local play.

Elsewhere in `apps/web/src`: `art/` (tile and card artwork drawn once to images and kept in
IndexedDB), `lab/` (the Art Lab pages), `print/` (print exports and sheets, shared by every lab page),
`rulebook/` (the manual and its diagrams), `pwa.ts` (the service worker, and checking for updates).

## Finding bugs

- `checkInvariants(state)` lists everything wrong with a state: cube totals, every card in exactly one
  place, dice and board occupancy, track ranges, well-formed decisions. Tests run it after every action
  of full games; the web app runs it after every action in development and logs a violation to the
  console with the action and the prior state (load it back with `window.__game.load(JSON.parse(…))`).
- An engine crash (anything but a `RuleError`) is shown in the UI as "Engine error" and logged the same
  way. When the AI is the one to hit it, the AI's move falls back to the first legal move so the game
  goes on ([aiClient.ts](../apps/web/src/game/aiClient.ts)). Online, a crash while replaying another
  player's move or resolving a battle stops the game (`Replay.crash`) with a message that names it as a
  bug, and is logged once with the state. A crash while rendering shows a reload screen
  ([ErrorBoundary.tsx](../apps/web/src/components/ErrorBoundary.tsx)), not a blank page, and logs the
  last saved position.
- `npm run test:deep` runs the legal-action cross-check exhaustively over more games (minutes).
- `npm run ui:check` checks in Chrome what unit tests can't render: choosing how to conquer a planet, and
  the crash screen. CI runs it with `mobile:shots` before every deploy.
- `npm run replay:check` checks in Chrome looking back at a game from its log: the map, the log and the
  way back to the game, a reload keeping the game's past, and the phone layout. CI runs it with `ui:check`.

## How to…

**Add an action.** Add it to `Action` in `types.ts`, then add its handler to the module it belongs to
and the shape of its fields to `SHAPES` in `actionShape.ts` (the compiler will point you to both). Add it to `actionPhaseOptions` in `legal.ts` so the AI and the UI
can use it, and to `bruteForce` in `consistency.test.ts` so the cross-check covers it.

**Add a decision.** Add it to `Pending`, push it where the rule triggers, handle its answer action,
and add its candidates to `DECISION_CANDIDATES` (`legal.ts`) and every answer worth trying to
`DECISION_BRUTE_FORCE` (`test/decisions.ts`); the compiler asks for both. If it can have no legal answer, add an
`AUTO_RESOLVE` entry in `turn.ts`.

**Add a Tactic.** Add the card to `data/regolith.yaml`, its effect to `TACTIC_EFFECT_IDS` in `effects.ts`,
then its implementation to `TACTIC_EFFECTS` in `cards.ts` (the compiler asks for it). It joins the deck
automatically, and `data.test.ts` drops it from the not-yet-implemented list.

**Add a Skill.** Add the card to `data/regolith.yaml` and its effect to `SKILL_EFFECTS` in `effects.ts`;
the compiler then asks for its entry in `SKILL_RULES` (`skillRules.ts`). An entry is a set of hooks the
rules read — `movement`, `conquer.sums`, `combat.modifier`, `startOfTurn`, `onDestroy`… — so a skill
is defined in one place. If no hook fits, add one to `SkillRule` and read it where the rule lives
(via `skillRules(state, player)`; rules never name a skill). A skill that is an action of its own
sets `activated` and gets a handler in `skillActions.ts`.

**Add a rule set** (e.g. our own edition). Add a `GameMode` and an entry in `RULESETS` (`rulesets.ts`). If
the new rule set changes a rule rather than a parameter, add a field to `RuleSet` and read it where the
rule lives. Don't compare `state.mode` to a name anywhere else.

**Add a map.** Add it to `data/maps.yaml` with its published stats (or `mapStats()`'s, if none are published); [`maps.test.ts`](../packages/engine/test/maps.test.ts) recomputes the stats
from the layout and fails if they disagree. A map's setup sheet for the table comes with it (Art Lab, `#lab/maps`). A map may also start with an Ice Tunnel
or barriers (`start:` in the YAML, group `prepared`): `npm run map:show -- <id>` prints it with every space named as
`row:col:side`, and `--spin=<2|3>@<row:col> --pick=…` lays the turned copies that keep the seats level.
`npm run selfplay:maps -- --maps=<ids>` measures what kind of game it makes (rounds, fights, first-seat wins).

## Tests

| Test | Guards |
|---|---|
| [`basic.test.ts`](../packages/engine/test/basic.test.ts) | Every rule Basic inherits from the 2013 FunForge rulebook, one scenario each, citing its page |
| [`regolith.test.ts`](../packages/engine/test/regolith.test.ts) | Regolith's own rules: the movement cap, zones of control, Shoot, Barrier, contested perimeters |
| [`hex.test.ts`](../packages/engine/test/hex.test.ts), [`offset.test.ts`](../packages/engine/test/offset.test.ts) | Hex geometry; objectives off the middle of their tiles |
| [`engine.test.ts`](../packages/engine/test/engine.test.ts) | Card effects, modes, missiles, undo |
| [`card-audit.test.ts`](../packages/engine/test/card-audit.test.ts) | The card audit ([`audit.ts`](../packages/engine/test/audit.ts)) on its quick games: AI games with skills dealt so every card is held, checking at every step legality, soundness of card decisions, invariants, and each card's effect against its text. `npm run audit:cards` plays the whole matrix (`-- --deep`: level 4 and more maps) and prints each anomaly with the game log, plus card coverage |
| [`card-scenarios.test.ts`](../packages/engine/test/card-scenarios.test.ts) | A scenario per card (every mode), driven through its real trigger; fails if a card has none. At every decision a scenario reaches, the engine accepts no answer `legalActions` doesn't offer ([`decisions.ts`](../packages/engine/test/decisions.ts)), which covers decisions the AI games rarely reach |
| [`card-rulings.test.ts`](../packages/engine/test/card-rulings.test.ts) | Prospectors, Remodel, Stolen Flag, Strategic Plan and Signal Jammer, edge cases included |
| [`consistency.test.ts`](../packages/engine/test/consistency.test.ts) | `legalActions` and `apply` agree (every offered action is accepted; brute force: every accepted action is offered, for every decision's answers ([`decisions.ts`](../packages/engine/test/decisions.ts)) and phase-1 actions on sampled states); invariants after every action |
| [`untrusted.test.ts`](../packages/engine/test/untrusted.test.ts) | Untrusted actions never crash the engine, only get refused with a `RuleError`: random actions of every type (many well formed, so they reach the handlers), legal actions with a field corrupted, and unknown types. Extra keys on a cell change nothing, and an unknown mode (`__proto__` included) is refused by name |
| [`load-order.test.ts`](../packages/engine/test/load-order.test.ts) | The engine works whichever of its modules is imported first, and each entry point (`createGame`, `apply`, `legalActions`, `checkInvariants`) works with only its own module imported |
| [`data.test.ts`](../packages/engine/test/data.test.ts) | Card ids unique; every card effect implemented or on the known-missing list |
| [`golden.test.ts`](../packages/engine/test/golden.test.ts) | Exact replay of seeded AI-vs-AI games in every mode, with invariants checked after every action. Fails on *any* behaviour change. After an intended change, review and run `npx vitest run -u`. |
| [`maps.test.ts`](../packages/engine/test/maps.test.ts) | Map stats match layouts; a map's starting tunnel and barriers sit on spaces, leave each start its room, keep every objective reachable, and play out to a winner |
| [`off-turn.test.ts`](../packages/engine/test/off-turn.test.ts) | Cards taken on someone else's turn (skills, Kill Zone, Forced March); Ice Tunnel, Headhunter and Final Push edge cases; when Science Survey asks |
| [`words.test.ts`](../packages/engine/test/words.test.ts), [`skill-log.test.ts`](../packages/engine/test/skill-log.test.ts), [`stats.test.ts`](../packages/engine/test/stats.test.ts) | The log in Regolith's words; skills that fire by themselves named on it; the players' game stats |
| [`powerUsage.test.ts`](../packages/engine/test/powerUsage.test.ts) | How often each mech power is offered and used (`npm run power:usage` for real numbers) |

Shared helpers (`quickStart`, `aiAction`, `playAiGame`…) are in [`test/helpers.ts`](../packages/engine/test/helpers.ts). `npm run selfplay:cards` (card win, pick and use rates over AI self-play) plays its games through the card audit too, with skills drafted rather than dealt. `npm run check` typechecks
everything (tests included) and runs the tests.
