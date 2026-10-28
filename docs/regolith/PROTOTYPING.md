# Regolith's Rules: the Design Log

How we build and evaluate the rules of **Regolith**, our own rule set, with Basic, its cards-free form. The
mode was called Prototyping until October 2026; this log keeps the word for the work, not the mode.

> **Design Thesis: From Arithmetic Sprint to Positional War**  
> In base Quantum, hyper-mobility collapsed geography. Ships with 5–6 movement on compact boards crossed the map with ease, turning battles into isolated teleport raids and conquest into an arithmetic puzzle.  
> **Regolith aims to restore territorial gravity**: the current movement cap creates distance;
> candidate powers and experiments explore zone control, forward logistics, and orbital superiority.

Regolith is becoming its own hex-only game on Phobos, Deimos and Mars, with its own screenprint cards:
[REGOLITH.md](REGOLITH.md).
Nothing here is permanently adopted. Rulings, once decided, go to [RULES.md](../RULES.md#rulings).

> **Status key:** **Current** rules are enabled in the playable Regolith mode and covered by
> [regolith.test.ts](../../packages/engine/test/regolith.test.ts). **Candidates** are described
> design work or partially implemented building blocks; they do not change a Regolith game until
> they are registered in `MECHS` ([ships.ts](../../packages/engine/src/ships.ts)) or `REGOLITH` ([rulesets.ts](../../packages/engine/src/rulesets.ts)).

## Current Regolith baseline

Regolith started as the Community Edition of Quantum and has moved away from it. Its rules today:

| Status | Rule |
|---|---|
| **Current** | **Cards** (Skills, Tactics, research), from Regolith's own decks. Basic is Regolith with `cards: null` ([rulesets.ts](../../packages/engine/src/rulesets.ts)). |
| **Current** | Plays **hex** maps only, including the **off-centre planet** ones (Twin Drift). **Ingenious** ("conquer from the corners") is not in the decks, as hex tiles have no corners (ruling 2026-10-20, [HEX.md](../HEX.md) *Cards*). |
| **Current** | A ship's die value contributes at most **3** movement; skill bonuses apply after that cap. |
| **Current** | **Zones of control:** every ship pickets the 6 spaces sharing a side (not diagonals) as a mode rule, not a ship power. Diagonals were dropped (2026-10-12) because most ships can't attack diagonally from where they stop. An enemy ship that moves into one must stop there (it may still attack from there; one that starts its move there may leave). Friendly ships are never stopped, and a player with the **Devious** skill ignores zones (ruling 2026-10-12; the card text is unchanged). |
| **Current** | The **5 Interceptor** replaces its diagonal Manoeuvre ability with **Shoot**: spend one action to attack the first enemy in a clear straight line (one out of each of its space's 6 sides) without advancing. Shooting is that ship's action for the turn. |
| **Current** | **Contested orbit** (§6.8, since 2026-10-21): a planet can't be conquered while an opponent's ship is in one of its orbital positions. Friendly ships never block, ships beside the orbit don't, and Take Over ignores it. |
| **Current** | **Contested deploy** (§6.8, since 2026-10-21): no deploying into a planet's orbit while an opponent's ship is in it, by any route (Deploy, Expansion, Stealthy), **except to your own home planet** (home shipyard). |
| **Off** | **Over-conquest** (§6.10): replacing an opponent's cube with an orbit of exactly **12**. Off since 2026-10-21; `REGOLITH_OVER_CONQUEST` in [rulesets.ts](../../packages/engine/src/rulesets.ts) turns it back on. |
| **Current** | The **6 Scout** (Wisp) replaces Free Reconfigure with **Barrier** (since 2026-10-24): once a turn, for no action and besides its move, it fires a barrier onto any empty space in a clear straight line out of a side of its space, at any distance (stopped as a shot is). A barrier is permanent and can't be destroyed: no ship moves into or through its space, deploys onto it or shoots through it. It may sit in a planet's orbital position, holding that space, but never counts towards a conquest or contests the orbit. There is no limit on how many barriers are on the map. |
| **Unchanged** | Ships 1–3 keep the abilities they had in Community. The **4 Frigate** retains Modify. |

Picket is active as the default zone-of-control rule for every ship rather than as the 4's power. Contested Orbit (§6.8) is current. Beacon and every other rule below are **candidates**, not current rules.
What the AI self-play says about this baseline is summarised in §8.

---

## Table of Contents

1. [How Modes Work Today](#1-how-modes-work-today)
2. [Worked Example: Movement Cap at 3](#2-worked-example-ships-move-at-most-3)
3. [How to Test a New Mode](#3-how-to-test-a-new-mode)
4. [Engine Refactoring Roadmap](#4-refactoring-in-the-order-it-pays-off)
5. [Candidate Ship Redesign: Powers for the 4, 5, and 6](#5-candidate-ship-redesign-powers-for-the-4-5-and-6)
6. [Future Experiments](#6-future-experiments-a-different-game-not-a-re-tuned-one)
7. [Next Steps](#7-next-steps)
8. [Current Status & Playtest Results](#8-current-status--playtest-results-2026-10-21)
9. [Developer Guide: Working on Regolith](#9-developer-guide-working-on-regolith)

---

## 1. How modes work today

Every rule lives in [`packages/engine`](../../packages/engine). A game is a pure function: take the
state and an action, return the new state. The AI, the web UI, and online play only call
`legalActions()` and `apply()`. Online, every browser replays the same moves through the same engine,
so a new mode needs no network changes as long as it stays deterministic.

```
  Web UI ──┐
  AI ──────┼── legalActions() / apply() ──▶  action handlers ──▶ rule questions ◀── RULESETS
  Online ──┘                                 (actions, combat,   (queries.ts:        (rulesets.ts:
                                              cards, turn)        movementRange,      Basic, Regolith)
                                                                  conquerCheck…)      
```

A mode is one entry in `RULESETS` ([rulesets.ts](../../packages/engine/src/rulesets.ts)). The engine reads it
through `rulesOf(state)` ([rules.ts](../../packages/engine/src/rules.ts)) and never compares mode names. Today a `RuleSet` holds only these:

| Setting | Basic | Regolith |
|---|---|---|
| `cards` (Skills, Tactics, Expansion; starting skill draft, peek, expansion pile) | none | Regolith's decks |
| `actionsPerTurn`, `researchLimit` | 3, 6 | 3, 6 |
| `mapGroups` | hex, open, drift | hex, open, drift |
| `ships` | the mech table with Shoot, Barrier and zone of control | same |
| `overConquest` (§6.10) | off | off |

The movement cap, contested orbit and contested deploy, the home shipyard, missiles and Reconfigure are no
longer switches: Regolith's rules are the engine's rules.

Two patterns make changes cheap:

- **Single choke points.** Each rule question has one function in
  [queries.ts](../../packages/engine/src/queries.ts): `movementRange`, `deployTargets`, `conquerCheck`,
  `combatOutcome`, `breakthroughAt`, `infamyAt`. Change the function and every caller follows.
- **Closed registries.** Actions, decisions, and skill effects are closed TypeScript unions. Add one
  without a handler and the build fails, pointing at the gap.

Skills already work like small plugins: each is a set of hooks in
[skillRules.ts](../../packages/engine/src/skillRules.ts) (`movement`, `combat.modifier`, `startOfTurn`…).
Prototype ship powers use the same pattern: `ShipHooks` (§9).

---

## 2. Worked example: ships move at most 3

*This is how the cap was first planned. It is now built: `MAX_MOVEMENT` in
[queries.ts](../../packages/engine/src/queries.ts), read by `movementRange`. §9 details where
the mode's code lives today.*

A ship's movement is calculated in one place:

```ts
// packages/engine/src/queries.ts
export function movementRange(state: GameState, d: Die): number {
  return d.value + skillRules(state, d.owner).reduce((n, r) => n + (r.movement ?? 0), 0);
}
```

The legal-move search (`moveOptions`, `carryOptions`), board highlights, both AI planners
([greedy.ts](../../packages/ai/src/greedy.ts), [evaluate.ts](../../packages/ai/src/evaluate.ts)), and the
ship panel's "Moves N" label all call it.

A rule that changes with the mode is a field of `RuleSet`, read in one place. The cap began as an optional
`maxMovement` on the rule set, applied in `movementRange` (the mode itself was first added on 2026-10-08, when it
was still called Prototyping).

**Ruling (decided 2026-10-08):** the cap applies to the die value, before skill bonuses and special
powers. A 6 moves 3; a 6 with Agile moves 4. So step 4 is:

```ts
return Math.min(rulesOf(state).maxMovement ?? Infinity, d.value) + skillRules(state, d.owner).reduce((n, r) => n + (r.movement ?? 0), 0);
```

Capping the total instead would make Agile useless on any ship showing 3 or more.

---

## 3. How to test a new mode

1. **Play it by hand.** `npm run dev`, then `localhost:5173/?play=regolith&players=2&seed=7` skips the
   lobby and starts a game against the AI ([devStart.ts](../../apps/web/src/game/devStart.ts)). The same
   seed gives the same dice, so situations can be replayed after each tweak.
2. **Pin each rule with a scenario.** `quickStart(2, 1, 'regolith')` and `arrange()` in
   [test/helpers.ts](../../packages/engine/test/helpers.ts) set up exact positions. One test per rule,
   as in [basic.test.ts](../../packages/engine/test/basic.test.ts) and [regolith.test.ts](../../packages/engine/test/regolith.test.ts).
3. **Check it never breaks the engine.** Add `'regolith'` to the modes in
   [golden.test.ts](../../packages/engine/test/golden.test.ts) and the consistency cross-check: seeded AI
   games run `checkInvariants()` after every action, and `legalActions` and `apply` must agree.
4. **Measure balance with AI self-play.**
   - `npm run ai:match -- 3 3 100 regolith 2`: turns per game and seat win rates. Compare with `basic`.
   - `npm run selfplay:cards -- 50 regolith`: card win, pick, and use rates.
   - `npm run power:usage -- 20 basic,regolith`: how often each ship's power is used, against
     how often it was on offer, per die value.
   - `npm run interaction -- 200 4,4`: how much the players get in each other's way (interaction ratio,
     harm by kind of action, conquests blocked), per mode and map, with and without cards
     ([HEX.md](../HEX.md) *Interaction*).

**Still worth building:** a stats script that writes one CSV row per game: mode, turns, winner seat,
attacks, conquers, and **moves per ship value**. `power:usage` covers power uses; moves per ship value
are what would show whether 4s, 5s and 6s are fielded or reconfigured away.

**Caveat:** the AI plays legally under any rule, but its scoring in `evaluate.ts` is hand-tuned for
the original game. Passive powers (§5) need no AI work. Reactive powers and radical ideas in §6 need AI
changes before self-play results become meaningful.

---

## 4. Refactoring, in the order it pays off

No up-front refactor is needed. Do each step when a rule needs it. Step 2 is done (§8, §9). Contested orbit and over-conquest needed no step 3: each is a `RuleSet` flag read in `conquerCheck`.

| Step | Refactor | Unlocks | Size |
|---|---|---|---|
| 1 | Lift fixed numbers into `RuleSet`: actions per turn and research cap (done); remaining shared track and threshold rules | Variable tweaks | Small (partial) |
| 2 | **Ship table per mode**: `RuleSet.ships` gives each value its name, movement, and power as hooks like `SkillRule` | §5, and factions in §6 | Medium (Done) |
| 3 | Formula hooks on `RuleSet`: `combatOutcome`, `conquerCheck`, `deployTargets` | Supply (§6.2), conquer rules a flag can't express (contested orbit and over-conquest are flags) | Small–medium |
| 4 | Win check as a hook, not fixed in `placeCube` ([core.ts](../../packages/engine/src/core.ts)) | Points, round limits, planet economy (§6.3) | Medium |
| 5 | Mode-owned player state (an extension field, not new fields on every player) | New resources, energy economy | Medium |
| 6 | Mode-gated actions and decisions | Ship activations (§6.9), command dice (§6.4) | Medium–large |
| 7 | AI scoring per mode | Trustworthy self-play evaluation | Medium |
| 8 | UI driven by the rule set: ship names and powers, player tracks, generic decision dialogs | Showing dynamic rule sets on screen | Large |

Step 2 mattered most for ship redesign and is complete. A ship's identity was formerly hard-coded as
`d.value === N` across [abilities.ts](../../packages/engine/src/abilities.ts), `moveOptions`, and
[legal.ts](../../packages/engine/src/legal.ts). Now each mode has a ship table (`RuleSet.ships`): the engine
queries `hasPower(state, d, 'warp')` or reads a prototype's hooks, and the UI reads names and ability texts
through `shipOf(state, value)`.

---

## 5. Candidate ship redesign: powers for the 4, 5 and 6

### 5.1 The problem: hyper-mobility killed geography

| Ship | Moves | Power today | Why it's weak |
|---|:-:|---|---|
| 4 Frigate | 4 | Turn into a 3 or a 5 | A free half-Reconfigure; no identity of its own |
| 5 Interceptor | 5 | Move and attack diagonally | Barely matters at range 5; long range already reaches everything |
| 6 Scout | 6 | Free Reconfigure | A way to stop being a Scout, not a reason to be one |

Quantum's intended trade-off was "small ships fight, big ships travel". But in practice, with 5–6
movement on maps typically only 6–9 spaces across:
- **Geography collapsed.** Travel was essentially free. There was no operational depth, no frontline,
  and no safe rear territory. A 6 could strike almost anywhere in one or two actions.
- **Battles weren't spatial warfare, but isolated dive-bombing.** Instead of contested borders,
  flanking, or territorial control, ships zipped across the void for lone duels. Positioning between
  turns offered no real protection.
- **Conquering was an arithmetic puzzle, not territorial conquest.** A player could construct a cube
  right next to an enemy armada as long as their own ships in orbit hit the target sum. It felt like
  a sudden math sprint rather than a territorial war.
- **Big ships had no purpose of their own.** Beyond rushing to a planet to fill a sum, their powers
  were mostly about rerolling to stop being a big ship.

### 5.2 Design goals: from arithmetic sprint to positional war

- **Cap movement at 3** (§2), so distance and travel time exist again. The board gains scale, and
  positioning becomes a genuine commitment.
- **Give the board territorial gravity.** Candidate powers could project threat and control space:
  - **Zone control:** Frigates (Picket) could wall off lanes and planet approaches.
  - **Ranged pressure:** Interceptors (Shoot, current) threaten space without having to abandon position.
  - **Forward bases:** Scouts (Beacon) could serve as logistics hubs in a world where crossing the map takes time.
  - **Planetary sieges:** Contested Orbit (§6.8) could require players to clear orbital space before
    constructing.
- **Keep the combat trade-off**: big ships still lose most fights (they add 4–6), so their value lies in
  holding space, supporting small fighters, and shaping the battlefield.
- **Prefer passive powers or clean action extensions**, so the AI copes naturally without complex
  scoring overhauls.

### 5.3 Current and candidate ship powers

Only Shoot is active as a ship power. Picket's hook applies to every ship as the zone-of-control rule (2026-10-12),
so it is not a power of the 4. Beacon is a candidate power with a source file and a reusable hook, not assigned to a ship.

| Ship | Current Regolith rule | Candidate | Intended role if activated |
|---|:-:|---|---|
| **4 Frigate** | Move 3; **Modify** remains active | None registered. **Picket** (an enemy ship entering one of the adjacent spaces must stop there) was its candidate; it is now every ship's zone of control. See §5.4 for powers the 4 could get instead. | Formerly: zone control |
| **5 Interceptor** | Move 3; **Shoot** is active | — | Ranged pressure: threatens space without abandoning position |
| **6 Scout** | Move 3; **Free Reconfigure** remains active | **Beacon:** Deploy into empty spaces around the Scout, as if it were a planet with your cube. | Logistics: forward staging ground for reinforcements |

How the current rules and Beacon reshape play:
- **Every ship turns movement into a puzzle** (current, as zones of control). A ring of ships around a
  planet slows enemy approaches by a turn and, with contested orbit, counters "rush the sum" plays.
- **Interceptors control lanes without suicide runs.** Rather than charging into close combat where a 5
  usually loses, Interceptors project ranged area denial.
- **Scouts make the board feel vast** (candidate). With movement capped, a Beacon could make being stranded far from home planets hurt less.
  A forward Scout becomes where destroyed ships redeploy, making its survival crucial.

### 5.4 Alternatives explored per ship

| Ship | Alternative | Note |
|---|---|---|
| 4 | **Escort**: an adjacent friendly ship subtracts 1 from its combat total when defending | Passive, easy; makes formations matter |
| 4 | **Anchor**: in a Conquer sum, counts as 3, 4, or 5, your choice | Restores flexibility as a conquer tool, not a dice fix |
| 5 | **Intercept**: once/round off-turn reaction attack when an enemy ends within 2 spaces | High interactivity; requires off-turn pending prompts |
| 5 | **Pursuit**: after winning an attack, may attack again from the new space (once per turn) | Aggressive; simpler than Intercept |
| 6 | **Jump**: once per turn, move to any empty space within 2 of another of your ships, ignoring blockers | Mobility without long linear moves |
| 6 | **Survey**: at the start of your turn, look at the top Skill card; may swap with a face-up one | Information role; ties Scout to the market |

#### Idea: Rally (replaces the 2 Flagship's Carry)

**Rally:** as part of a Move action, the Flagship may move any other friendly ship that is
adjacent to it, using that ship's normal movement (and attack) rules. Carry is removed.

Is it overpowered? Probably not, but it needs a limit:
- Carry costs the Flagship's move and forbids its attack; the passenger only relocates. Rally lets a
  ship act without spending the Flagship's move, so it is closer to a free extra activation: strictly stronger.
- Under Regolith's move-3 cap, this gives a second ship 3 moves for one action, which erodes the cap's
  purpose and risks the hyper-mobility problem from 5.1.
- Adjacency is a real positional tax, and the Flagship is a single ship, so the effect is bounded.

Tuning options, mildest first: (1) once per turn; (2) the Flagship itself must not move that turn;
(3) the rallied ship moves at most 2 and cannot attack; (4) it replaces the Flagship's own move rather than
adding to it. Suggest testing (1) + (3) first. Needs a Move-action extension hook and a self-play check
on game length and Flagship survival.

### 5.5 Implementation costs

| Power | Engine | AI | UI |
|---|---|---|---|
| Picket | `stopsEnemies` hook; **current** on every ship (zone of control) | Automatic via legal moves | With a ship selected, enemy zones are tinted and moves into one ringed (the ship stops there) |
| Shoot | `action` hook; **current** | Handled via legal actions | Action button and target highlights |
| Beacon | `deployTargets` hook available; candidate not registered | Automatic | Target cell highlights |
| Escort, Anchor | Combat modifier / conquer-sum hook | Automatic | Combat breakdown line |
| Intercept | Off-turn `Pending` reaction hook | Response choice heuristic | Prompt window (like missiles) |
| Survey | Start-of-turn decision hook | Choice heuristic | Card dialog |

### 5.6 Testing & validation

- Shoot and zones of control have scenario coverage (turn limit and line of sight; pass-through, starting
  in a zone, Devious, Warp Gate exits, hexes). Before activating Beacon, add scenarios for Beacon targets
  after a Scout is destroyed.
- Self-play metrics on moves, attacks, and power uses per ship value (`power:usage`, and the CSV script in
  §3). Success criterion: 4s, 5s, and 6s are fielded intentionally rather than reconfigured away.
- Average game length compared with Community Edition: the cap plus zones of control should lengthen games
  slightly, but exceeding a 30% increase suggests adding an action or offensive counterweight. With
  contested orbit, the AI's games already run 23–33% longer (§6.8).

---

## 6. Future experiments: a different game, not a re-tuned one

These candidates fundamentally alter game dynamics. Each is a distinct prototype; do not combine them until
each is evaluated independently.

### Overview by Theme

- **Spatial Control & Geography:**
  - [§6.2 Supply Lines](#62-supply-lines)
  - [§6.8 Contested Orbit (Orbital Blockade)](#68-contested-orbit-orbital-blockade-no-conquering-under-enemy-ships)
- **Action Economy & Fleet Command:**
  - [§6.4 Command Dice](#64-command-dice-instead-of-three-fixed-actions)
  - [§6.9 Pure Ship Activations (The Wargame Model)](#69-pure-ship-activations-the-wargame-model)
  - [§6.3 Planet Economy](#63-planet-economy)
- **Ship Dynamics & Movement:**
  - [§6.1 Kinetic Ships](#61-kinetic-ships-you-become-how-far-you-moved)
  - [§6.6 Asymmetric Factions](#66-asymmetric-factions)
- **Variants & Rulesets:**
  - [§6.5 Neutral Raiders](#65-neutral-raiders-from-the-void)
  - [§6.7 Fog of War](#67-fog-of-war)

---

### 6.1 Kinetic ships: you become how far you moved

**Rule.** After a ship moves, its value becomes the number of spaces it moved. A ship that moves 2
becomes a Flagship. An attack counts the steps taken to reach the space it attacked from. A ship
that doesn't move keeps its value. Reconfigure still exists.

**Why it's different.** Speed and strength stop being fixed by dice rolls. Every move balances
reaching a space against arriving combat-ready: charging across the map leaves you vulnerable on arrival.
Conquer sums become a positional puzzle solved with movement rather than re-rolls.

**Build.** Small: move handler sets `d.value`; `turn.seen` already tracks values. AI copes via legal
actions. Golden tests unaffected.

---

### 6.2 Supply lines

**Rule.** A ship is **in supply** if it is within 3 spaces of a planet with your cube, or of another
in-supply ship of yours (forming a supply chain). Out-of-supply ships cannot attack and add 2 to their
combat total when defending.

**Why it's different.** Transforms the map into fronts and supply corridors rather than isolated raids.
Cutting a chain matters as much as destroying a ship. Integrates naturally with Beacon Scouts (§5) as
mobile supply depots.

**Build.** Medium: BFS `inSupply` query, read by attack legality and `combatTotal`. UI requires a supply
overlay. AI needs a supply term in its evaluation.

---

### 6.3 Planet economy

**Rule.** Each planet with your cube produces energy each turn: 7 → 1, 8 → 1, 9 → 2, 10 → 2. Energy
purchases bonus actions (3 energy), missiles (2), or free Deploys (1). Win condition remains cubes or
becomes "first to N energy banked".

**Why it's different.** Adds an engine-building layer over the conquest race. Early conquests compound,
making timing and target selection matter as much as total cube counts.

**Build.** Medium–large: mode-owned player state (§4 step 5), spend actions, UI track, AI valuation.

---

### 6.4 Command dice instead of three fixed actions

**Rule.** At the start of your turn, roll 3 command dice. Each face corresponds to an action type:
1–2 Move, 3 Attack, 4 Reconfigure, 5 Research, 6 Wild. Conquer costs two matching dice. Spending a missile
re-rolls one command die.

**Why it's different.** Each turn becomes an operational puzzle: making the best of the orders rolled.
Plans must adapt to tactical friction, extending the dice theme into turn structure itself.

**Build.** Medium: seeded turn rolls into `TurnState`, handlers consume matching dice. AI copes via
legal actions. UI requires a command-dice display strip.

---

### 6.5 Neutral raiders from the void

**Rule.** At the end of each round, a neutral raider appears on each void tile and advances toward the
nearest player ship, attacking when adjacent. Destroying a raider yields +1 research. Alternatively, a
co-op variant where players win together by conquering all planets before raiders destroy N ships.

**Why it's different.** Shared threats introduce emergent truce dynamics and board pressure. The co-op
variant represents a distinct game experience.

**Build.** Large: non-player owner, round-end automated behavior, neutral invariants.

---

### 6.6 Asymmetric factions

**Rule.** Each player chooses a faction with its own ship table: unique powers per value and distinct
movement curves (e.g., a **swarm** faction whose 1s and 2s move 2 extra spaces, or a **dreadnought** faction
whose 6 is a fortified bastion with Picket and +1 defense).

**Why it's different.** Dramatic asymmetry expands replayability, making faction matchups the central
strategic dimension.

**Build.** Once §4 step 2 exists, factions are simply per-player ship tables. Balance validation via
AI self-play is the primary investment.

---

### 6.7 Fog of war

**Rule.** Players see only spaces within 2 of their ships and planets; Scouts reveal range 4.

**Why it's different.** Introduces reconnaissance, hidden fleet movements, and ambushes.

**Caution.** Conflicts with Quantum's online architecture where all clients hold full game state
([MULTIPLAYER.md](../MULTIPLAYER.md)). Feasible for hot-seat play, but requires cryptographic commit-reveal
or trusted hosts for online games.

---

### 6.8 Contested orbit (orbital blockade): no conquering under enemy ships

**Status: current since 2026-10-21** (`RuleSet.contestedOrbit`, `orbitBlockers` in
[queries.ts](../../packages/engine/src/queries.ts)), with over-conquest switched off. Rulings as proposed below:
Take Over ignores the blockade, and only opponents' ships in the orbital
positions do. The AI counts each blocker as an attack before the conquest, by a ship of its own (`clearing`
in [evaluate.ts](../../packages/ai/src/evaluate.ts)). The board marks a planet whose orbit makes the sum but is
blocked, and its info and the turn hint say why. With the Sergeant AI in every seat, 200 games per map
(same seeds, against over-conquest without the blockade):

| Map | Rounds | Conquests | Take Over | Attacks | Unfinished |
|---|--:|--:|--:|--:|--:|
| Alpha Sector | 7.5 → 9.8 | 5.8 → 5.1 | 0.4 → 0.7 | 5.2 → 8.3 | 0 |
| Beta Sector | 9.2 → 11.5 | 7.2 → 6.1 | 1.3 → 1.9 | 15.3 → 19.9 | 0 |
| Gamma Sector | 9.9 → 13.2 | 7.5 → 4.7 | 2.4 → 3.6 | 29.4 → 39.7 | 0 |

Most of it is the blockade: with over-conquest off and no blockade, games run as before except on Gamma
(+0.8 rounds). About 40% of Alpha games and 70% of Beta and Gamma ones end on an Take Over cube, against
17–47% without the blockade. The AI barely parks ships in orbit on purpose, so with people, who will,
games may well run longer.

In the interaction measure ([HEX.md](../HEX.md) *Interaction*, Colonel against Colonel on Alpha Sector),
Regolith blocks about one conquest a game (1.00), and about 40% of the harm players do each other comes from moves rather than attacks: zones of control, orbits taken and conquests blocked.

**Rule.** A planet cannot be conquered while any opponent's ship occupies one of its orbital
positions: the 6 spaces around it, and on the off-centre
maps whatever its orbit has (fewer at the map's edge; a space two orbits share blocks both planets). To place a cube you must first clear
orbit, which in practice means destroying every opposing ship there, since nothing forces a ship to
move. Friendly ships never block. The check is made only when conquering: a cube already on the
planet is never lost to ships arriving later.

**Why it's different.** In standard Quantum, enemy ships in orbit only take up space: if your own
ships in the remaining orbital positions hit the exact sum, you can build a cube right next to an
enemy fleet. Requiring a clear orbit changes the dynamics:
- **Defence becomes positional and active.** Any ship parked in orbit, even a weak 6 (combat favours
  the low total), denies conquest without the defender having to beat the attacking fleet.
- **Combat comes before conquest.** Players can no longer rush the sum past the defenders.
  Conquering becomes a two-step effort: win orbit first, then build.

**Implications under the current baseline.**
- **Tempo: a contested planet usually takes two turns.** Attack (1) + Conquer (2) is the full 3
  actions, so a one-turn capture needs the rest of the sum already in orbit and the attack to succeed.
  If the attacker advances into the vacated orbital space, its own value joins the sum, so
  the attack and the conquest have to be planned together. With the movement cap of 3 and zones of
  control, most sieges will take a turn to set up and a turn to resolve.
- **Every space is some planet's orbit**, so every ship, wherever it stands, blocks the planet it orbits
  for every opponent: blocking happens by itself.
- **Orbital spaces touch.** The six form a ring, each next to two others, so a ship in orbit can attack a
  blocker beside it and advance into its space without changing its own sum. Clearing a blocker needs no
  ship from outside, and the 5's **Shoot** can also remove one from range.
- **Blockers support each other.** Two blockers side by side in the ring get Strategic's −2 and zone
  each other's neighbours.
- **Stealthy** (deploy anywhere not next to a ship) lands in an orbit every time: it can block a planet
  for 1 action.
- **Deploy lets defenders re-block for 1 action.** A destroyed blocker goes to its owner's
  scrapyard. If that owner has a cube on the planet, Deploy puts it straight back into an empty
  orbital position. Filling all 6 orbital spaces takes more ships than a fleet has, so the attacker
  can't stop it. Expansion (Tactic) is a free version of the same
  move. This is the main stalemate risk on planets the defender already holds.
- **Over-conquest becomes a real siege** (moot while over-conquest is off, §6.10). The planet over-conquest targets always holds an
  opponent's cube, so that opponent can always Deploy there. A sum of exactly 12 now also requires
  a clear orbit, which may tip over-conquest from "hard" to "almost never". If so, the anti-leader
  lever disappears just when leaders can afford to garrison.
- **Take Over stays the way out.** Each won attack gives +1 dominance, so clearing blockers pushes
  the attacker towards Take Over, which ignores orbital positions. Sieges therefore pay off even when
  the conquest itself fails. Keep Take Over unaffected by the blockade (see rulings below).
- **Cheap denial in multiplayer.** Any opponent blocks, including a third player who has no
  interest in the planet. One spare ship can deny a planet to the leader (good) or to whoever is
  catching up (kingmaking).
- **Skill conquest still needs a clear orbit.** Pioneering, Tyrannical and Intelligent change the
  sum, not the blockade, so a planet with a blocker stays locked whatever they add.

**Rulings** (made as proposed, 2026-10-21, except 4, which is untried).
1. Does **Take Over** ignore the blockade? *Proposed: yes*, since Take Over already ignores orbital
   positions, and it keeps a release valve.
2. Do enemy ships beside the orbit block? *Proposed: no.* Only the orbital positions block, for every
   player, so there is one rule to remember.
3. Does the blockade apply to **over-conquest**? *Proposed: yes* at first, and measure it. If
   over-conquest disappears from games, exempt it or let over-conquest ignore one blocker. *In the
   end over-conquest was switched off with the blockade's arrival; the engine still blocks it when it is
   turned back on.*
4. Softer variant if games stall: block only when the opponent has **at least as many ships** in
   orbit as the conqueror (orbital majority), rather than any single ship.

#### Deploying to a contested planet (current since 2026-10-21)

**The loop it stops.** A defender with a cube on the planet re-deploys a destroyed blocker into the orbit
for 1 action, the same price as the attack that destroyed it, so a planet can be held indefinitely
(*Deploy lets defenders re-block* above).

**Rule.** No deploying into a planet's orbit while an opponent's ship is in it. It covers every way of
deploying (Deploy, Expansion, Unveil the Fleet, Stealthy, Beacon), and a space two orbits share is
closed if either orbit is contested. Contested orbit now reads both ways: an enemy ship in orbit stops
you conquering the planet *and* deploying to it. Built as `RuleSet.contestedDeploy`, read in
`deployTargets` ([queries.ts](../../packages/engine/src/queries.ts)); the deploy hint and planet info say why.

**Self-play** (Sergeant AI in every seat, 200 games per map and setting, the same seeds, 2026-10-21).
*Re-blocks* are deploys into a contested orbit of one's own planet; a *lockout* is a turn starting with
no ships on the board, ships in the scrapyard and nowhere to deploy.

| Map | Players | Rounds | Conquests | Battles | Re-blocks | Games with a lockout | Longest lockout |
|---|--:|--:|--:|--:|--:|--:|--:|
| Alpha Sector | 2 | 9.7 → 9.2 | 4.9 → 5.1 | 10.9 → 9.2 | 0.7 → 0 | 1 | 1 turn |
| Twin Drift | 2 | 11.2 → 10.4 | 6.7 → 6.9 | 11.9 → 9.4 | 1.4 → 0 | 0 | — |
| Beta Sector | 3 | 11.8 → 11.5 | 6.3 → 6.5 | 25.9 → 23.0 | 3.3 → 0 | 0 | — |
| Gamma Sector | 4 | 14.1 → 13.2 | 4.9 → 5.5 | 52.4 → 43.8 | 10.0 → 0 | 80 (40%) | 8 turns |

- **The loop is real, and grows with players:** 0.3 re-blocks a game on Alpha Sector, 8–10 with four
  players. Closing it makes games shorter (up to 10% with four), with more conquests and fewer battles,
  and no game stalled. Without the rule nobody was ever locked out.
- **A player can be shut out completely.** With their whole fleet in the scrapyard and every planet they
  hold (usually only their start) contested, they have no deploy target. In the games looked at, the
  leader parked 1–2 ships in that orbit and the locked player could only research and end turns until
  they left. Being locked out is close to elimination: locked players won 9% of those 4-player games
  (25% is an even share). The AI doesn't seek lockouts on purpose; people would.
- With 2 players it hardly happens, and with 3 rarely. With 4, where every space is an
  orbit and the fleets crowd every planet.

**Home shipyard (current since 2026-10-21).** Your home planet, the start planet you chose, isn't a
normal planet: you may always deploy to it, contested or not. Opponents' ships in its orbit still stop
*other* players conquering it. A home moves with the cube: when a player's last cube on their home
leaves, Relocation takes the home to the planet the cube goes to, and a cube displaced by over-conquest
takes it to another planet with their cube (the first in map order), or none if they have no other.
Neither card is in Regolith today (Relocation is Classic's; over-conquest is off), so this only
matters if they come in. `RuleSet.homeShipyard`; the home is `PlayerState.home`, set when the starting
planet is chosen, moved by `cubeLeft` ([core.ts](../../packages/engine/src/core.ts)) and read through
`homePlanet` ([queries.ts](../../packages/engine/src/queries.ts)).

Same games, with the home shipyard (*off* = no contested deploy; re-blocks at home in brackets):

| Map | Players | Rounds off → shipyard | Battles | Re-blocks (at home) | Games with a lockout |
|---|--:|--:|--:|--:|--:|
| Alpha Sector | 2 | 9.7 → 9.2 | 10.9 → 9.2 | 0.7 (0.0) → 0.0 | 0 |
| Beta Sector | 3 | 11.8 → 11.3 | 25.9 → 23.3 | 3.3 (0.5) → 0.5 | 0 |
| Gamma Sector | 4 | 14.1 → 13.6 | 52.4 → 48.4 | 10.0 (3.9) → 4.1 | 0 |

- **No lockouts on any map**, since every player always holds their home. (Filling all of a home's
  orbit would still shut its owner out, but takes 6 ships; it never happened.)
- **The loop stays only at homes:** 60–85% of re-blocks are gone, and homes become capitals that are hard
  to take a share of. Games land between the two settings.
- **Still to watch:** whether people turtle their home on purpose to deny its spare cube spaces, and
  the off-centre maps, not run with the shipyard yet.

**Other ways out**, if the shipyard turns out wrong (not built):
1. **Landing clause:** a player with no ships on the board may deploy into any empty space that is in no
   contested orbit and next to no ship (Stealthy's test).
2. **Last ship:** a player with no ships on the board ignores the rule. Simplest, but it reopens the loop
   for a defender down to one blocker.
3. **Late arrival instead of a ban:** deploying is allowed, but a ship deployed into a contested orbit
   doesn't block until its owner's next turn. No lockout is possible; it needs a marker per ship.

**Build (done).** `orbitBlockers` in [queries.ts](../../packages/engine/src/queries.ts), read by
`conquerCheck` behind `RuleSet.contestedOrbit`, so only Regolith sees it. Take Over goes through a
separate path and is unaffected. The AI has a term for attacking blockers (`clearing`) but not yet one
for garrisoning its own planets, so self-play still understates the rule.

**Test.** Game length, attacks per conquest, share of conquests made through Take Over,
over-conquest frequency, and how often a player Deploys back into a planet they are defending.
Watch for stalled games where every high-value planet is garrisoned.

---

### 6.9 Pure ship activations: the wargame model

**Rule.** Rather than spending a shared pool of 3 actions, the turn structure splits into **ship activations**
and **command actions**:
- **Ship activations:** Every ship on the board can activate once per turn to perform one tactical
  action: **Move**, **Attack**, or use its **Ship Power**.
- **Command actions:** In addition, the player gets **1 or 2 Command Actions** per turn to spend on
  strategic fleet management: **Deploy** (from scrapyard), **Reconfigure**, **Research**, or **Conquer**.

**Why it's different.** In standard Quantum, expanding your fleet to 4 or 5 ships is often an illusion
or even a liability. With only 3 actions total, advancing a modest battlegroup of 3 ships exhausts your
entire turn, leaving zero actions to attack or conquer. Extra ships sit as inert dice on the board,
acting merely as targets for enemy dominance farming. Under pure activations:
- **No inert ships:** Completely eliminates the feeling of ships being "inert dice sitting on the board".
  Every vessel in play can maneuver, screen, or attack every round.
- **Genuine geographical warfare:** You can advance a multi-ship battle line, hold multiple fronts,
  and stage simultaneous planetary sieges.
- **Fleet expansion matters:** Adding a 4th or 5th ship via Expansion genuinely scales your operational
  bandwidth rather than diluting your 3 actions.
- **Natural synergy with the movement cap:** Because ships move at most 3, having more active ships
  does not lead to hyper-mobile chaos; instead, it enables coordinated fleet movements and tactical
  positioning.

**Consideration.** A bigger departure from Quantum's core rules, but the closest to a genuine
positional wargame.

**Build.** Medium–large: replaces fixed `TurnState.actionsLeft` with tracked ship activations
(`turn.acted: string[]`) and a small command action pool (`turn.commandActionsLeft`), gated by §4 step 6.
AI needs an activation sequencer (ordering moves before attacks). UI needs clear visual states
(e.g. dimmed dice or activation pips) for ships that have already acted this turn.

**Test.** Test with 1 vs 2 command actions. Compare game length and fleet sizes with a run without the rule. Does it
prevent runaway leaders, or does losing ships to the scrapyard create too steep of a tempo swing?

---

### 6.10 Off: over-conquest, a sum of 12 to displace a cube

**Rule (off since 2026-10-21, `REGOLITH_OVER_CONQUEST`).** A player may conquer a planet that holds an opponent's cube by displacing that cube, whether or not the planet is full. A full planet is not locked out: this is the only way to take it. The requirement is one number to remember: the orbiting ships must sum to **exactly 12**, whatever the planet's printed value. (Doubling the value, 14 to 20, was tried first: those sums were too unlikely, and the AI almost never reached them.)
- On a planet with room, the ordinary conquest (printed value) stays available; over-conquest is the alternative that takes an opponent's cube instead of a free location.
- Ships in orbit are still subject to orbital limits and standard conquer restrictions.
- Upon success the player places their cube and chooses which opponent's cube to replace (if there is a choice). The displaced cube is returned to its owner's supply.

**Why it's different.** In standard Quantum, once all cube slots on a planet are occupied, the planet becomes permanently locked down. In the mid-to-late game, this can restrict options, leading to dead zones or forcing players into tedious cross-map journeys to reach remaining open slots:
- **King-of-the-hill territory.** Central and high-value planets remain relevant battlegrounds for the entire game rather than turning into static background terrain once claimed.
- **Direct catch-up and king-slayer lever.** Displacing a cube actively subtracts a victory point from the target player while granting one to the conqueror. This provides an organic check against runaway leaders without requiring dedicated combat cards.
- **Massive fleet commitment.** Assembling a sum of 12 demands at least two heavy ships, usually three (e.g. 6 + 6, or 5 + 4 + 3), simultaneously holding orbital positions. Committing this much fleet power creates an operational bottleneck and leaves the conqueror vulnerable elsewhere, making over-conquest a major deliberate siege rather than an easy opportunistic capture.
- **Target selection & diplomacy.** When multiple players share a full planet, the conqueror decides whose cube to eliminate, introducing tactical target selection.

**Implementation status.** Built and switched off: `RuleSet.overConquest`, checked by `conquerCheck`,
set from `REGOLITH_OVER_CONQUEST` in [rulesets.ts](../../packages/engine/src/rulesets.ts).
Its scenarios in [regolith.test.ts](../../packages/engine/test/regolith.test.ts) run only while the
flag is on. The UI and legal actions offer replacement targets; AI valuation and a dedicated
orbit-requirement display remain possible follow-up work. Worth turning back on only if games under
the blockade end with planets nobody can take.

---

### Which to try first

| Idea | Core Change | How Different | Build Cost | Fits Architecture |
|---|---|---|---|---|
| **6.8 Contested orbit** (current) | No conquer while enemy in orbit | Medium | Small | Built |
| **6.1 Kinetic ships** | Speed equals arrival value | High | Small | Yes |
| **6.2 Supply lines** | Supply chains for attack/defense | High | Medium | Yes |
| **6.4 Command dice** | Rolled order dice replace fixed actions | High | Medium | Yes |
| **6.6 Factions** | Asymmetric ship tables per player | Medium–high | Medium after §4 step 2 | Yes |
| **6.9 Ship activations** | Each ship acts once + 1–2 command actions | High | Medium–large | Needs §4 step 6 |
| **6.3 Planet economy** | Planetary energy production & spending | High | Medium–large | Needs §4 steps 4–5 |
| **6.5 Neutral raiders** | Automated void hostiles / co-op | Very high | Large | Needs neutral player |
| **6.7 Fog of war** | Local vision ranges | Very high | Very large | Conflicts with online model |

**Recommendation:**
1. Keep the live Regolith baseline: **movement cap 3 + Shoot + contested orbit (§6.8)**; over-conquest is off.
2. Test **Kinetic ships (§6.1)** as an independent one-file experiment to explore movement-driven sums.
3. If fleet expansion still feels underwhelming, evaluate **Ship activations (§6.9)** to unlock full
   multi-front command bandwidth.

---

## 7. Next steps

- [x] Rule on the movement cap: caps die value before skill bonuses and powers
- [x] Add Regolith mode with `maxMovement: 3` and scenario tests
- [x] Add Regolith to golden replay and consistency invariants
- [x] Refactor: ship table per mode (§4 step 2)
- [x] Replace the 5's diagonal Manoeuvre ability with Shoot
- [x] Add over-conquest at an orbit sum of 12
- [x] Picket active as the default zone of control for all ships (2026-10-12)
- [x] Hex and off-centre (drift) maps playable in Regolith (2026-10-20)
- [x] Contested Orbit (§6.8), with the AI's `clearing` term and board marks (2026-10-21)
- [x] Over-conquest switched off (2026-10-21)
- [x] Measure interaction across modes and maps (`npm run interaction`, 2026-10-21)
- [x] Contested deploy: no deploying into a contested orbit (2026-10-21)
- [x] Home shipyard, so contested deploy can't lock a player out (2026-10-21)
- [ ] Playtest home turtling with people; run the shipyard on the off-centre maps
- [ ] Playtest contested orbit with people: the AI hardly garrisons, so stalls may be under-measured
- [ ] Give the AI a garrison term for its own planets, then re-measure §6.8
- [ ] Run the interaction measure on Gamma Sector and with 3–4 players
- [ ] Decide the 4's power: nothing registered since Picket became every ship's rule (§5.4)
- [ ] Decide whether to activate Beacon (6); its source file is a candidate only
- [ ] Write per-game stats script (CSV: moves per ship value; `power:usage` covers powers)
- [ ] Prototype Kinetic ships (§6.1) as a separate branch experiment
- [ ] Evaluate Ship Activations (§6.9) if fleet expansion needs more command capacity

---

## 8. Current status & playtest results (2026-10-21)

Regolith is playable in the lobby, on the hex maps. The
authoritative current-rule summary is at the top of this document: a movement
cap of 3, zones of control on every ship, Shoot for the 5, and contested orbit, which also closes the
orbit to the defender's deploys except at their home planet; over-conquest is off.
The 4's Modify is still active; the 6's Free Reconfigure became Barrier (2026-10-24). Beacon is not enabled.

### Rulings established during implementation

- **Shoot** attacks the first ship in any straight line out of one of the 6 sides of its space, at any distance, as
  long as the line is clear: ships (friendly or enemy), planets and the board's edge block it; the void
  does not. (It was first range 1–2, diagonals included, then a free shot alongside the move, then a shot with a separate move.)
  Shooting costs one action and is the ship's one action of the turn, like a move or an attack: a ship
  can't move, attack or shoot again that turn, and can't shoot after moving or attacking. Normal combat, missiles, and re-rolls apply; the
  shooter never advances.
- **Zones of control** cover the 6 spaces sharing a side, not diagonals. A ship stopped
  in a zone may still attack from there, including another enemy beside it, but not with no steps
  left. A ship that starts in a zone may leave it; friendly ships are never stopped; a Warp Gate exit
  in a zone stops the ship there. Devious ignores zones and may pass through enemy ships.
- **Contested deploy**: no deploying into a contested orbit by any route, including Expansion and
  Stealthy; a space two orbits share is closed if either orbit is contested. Your home planet's orbit is
  always open to you (home shipyard).
- **Contested orbit**: only opponents' ships in the orbital positions block; Take Over ignores it; an
  on off-centre maps a space two orbits share blocks both
  planets (§6.8).
- **Over-conquest** (off) is optional alongside an ordinary conquest when an opponent cube is present. It
  requires an orbit sum of exactly 12 and returns the replaced cube to its owner's reserve.

Scenarios live in [regolith.test.ts](../../packages/engine/test/regolith.test.ts).

### Playtest status

All AI self-play; no games with people yet. Earlier figures (Picket and Beacon as ship powers, an
earlier Shoot) measured a different configuration and are not evidence for these rules.

| Date | What | Where | Finding |
|---|---|---|---|
| 2026-10-20 | Cap, zones of control, Shoot, cards, over-conquest; 20 games per map | [HEX.md](../HEX.md) *Measurements* | Zones of control halve the fighting; Gamma Sector no longer runs long; no game stalled. |
| 2026-10-21 | Contested orbit against over-conquest; 200 games per map | §6.8 | Games 2–3 rounds longer, fewer conquests, more attacks and Take Over; no game unfinished. |
| 2026-10-21 | Contested deploy on and off; 200 games per map, 2–4 players | §6.8 | Ends the re-block loop (up to 10 a game with 4 players) and shortens games, but locks players out in 12–40% of 4-player games. With the home shipyard: no lockouts, and 60–85% of the loop still gone. |
| 2026-10-21 | Interaction, Alpha Sector, with and without cards | [HEX.md](../HEX.md) *Interaction* | Interaction ratio 0.44 without cards and 0.39 with; harm comes as much from moves as attacks. Cards make games more solitary. Cards don't change how often the stronger AI wins. |
| 2026-10-25 | Card balance: every Regolith skill against none, with Community as a control; 2,000 drafted games | [card-benchmark.md](../card-benchmark.md) | Defence gets stronger: Unstable Reactor and Entrenched gain ~10 points and lead with Science Survey and Field Refit (75–85%). Remodel and Engineering are worth nothing here; Sneak does nothing. |
| 2026-10-28 | Prepared ground: seven maps that start with an Ice Tunnel and/or barriers; 40 games each against the map each is built on, level 2 | [HEX.md](../HEX.md) *Prepared ground* | A starting tunnel is the strongest map feature: Ice Run cuts a lane game by a fifth with 70% more fighting; barriers lengthen a game as far as they lengthen the walk between homes (Rubble Field +28%) and the AI does not hold a pass. No game unfinished. |

The open risk is stalls: the AI barely garrisons, so it may understate how long games run when people
park ships in orbit on purpose.

---

## 9. Developer guide: working on Regolith

Everything specific to Regolith's mechs lives in [`ships.ts`](../../packages/engine/src/ships.ts) and
[`powers/`](../../packages/engine/src/powers); the mode itself is `REGOLITH` in
[`rulesets.ts`](../../packages/engine/src/rulesets.ts). The core engine and web UI never hard-code its
powers or mode name.

### File Layout

```
packages/engine/src/
  rulesets.ts       Basic and Regolith: REGOLITH, BASIC, REGOLITH_DECKS, REGOLITH_OVER_CONQUEST
  ships.ts          ShipHooks, Power, the MECHS table (which mech has which power) and SHIPS
  powers/picket.ts  Picket's hooks, applied to every ship as the zone-of-control rule
  powers/shoot.ts   power text and hooks for Shoot (5)
  powers/barrier.ts power text and hooks for Barrier (6); the barriers themselves are GameState.barriers
```

| To Change | File to Edit |
|---|---|
| Mode summary, actions per turn, cards, maps | `REGOLITH` in [rulesets.ts](../../packages/engine/src/rulesets.ts) |
| Movement cap | `MAX_MOVEMENT` in [queries.ts](../../packages/engine/src/queries.ts) |
| Over-conquest on/off | `REGOLITH_OVER_CONQUEST` in [rulesets.ts](../../packages/engine/src/rulesets.ts) |
| Contested orbit | `orbitBlockers` in [queries.ts](../../packages/engine/src/queries.ts) |
| Which ship has which power, ship names | `MECHS` in [ships.ts](../../packages/engine/src/ships.ts) |
| A power's rules text, range, or hooks | Power file in [powers/](../../packages/engine/src/powers) |
| Add a power using existing hooks | New file in `powers/`, referenced in `MECHS` |
| Add a new kind of rule hook | Add to `ShipHooks` in [ships.ts](../../packages/engine/src/ships.ts) |

### Defining a Power

A power is a `Power` object (ships.ts) combining UI metadata with optional engine hooks. The current
implementation is [shoot.ts](../../packages/engine/src/powers/shoot.ts); a small passive example
(Beacon, not registered) would be:

```ts
// packages/engine/src/powers/beacon.ts
import { surrounding } from '../board';
import { cellOf } from '../lookups';
import { type Power } from '../ships';

export const beacon: Power = {
  ability: {
    name: 'Beacon',
    text: 'You may deploy into any empty space around this ship.',
  },
  hooks: {
    deployTargets: (state, ship) => surrounding(state.board, cellOf(ship)!),
  },
};
```

### Engine Integration & Hooks

1. **One import.** [rulesets.ts](../../packages/engine/src/rulesets.ts) is the only place importing the ship table
   (ships.ts) to build the rule sets. Engine modules read the rule set
   through `rulesOf` (rules.ts), which imports no mode, so the engine loads the same whichever module comes
   first (`load-order.test.ts`).
2. **Hooks over names.** Ships have built-in official powers (`strike`, `transport`...) or
   `hooks: ShipHooks`. The engine evaluates hooks via `hooksOf(state, die)`:

   | Hook | Evaluated By | Purpose / User |
   |---|---|---|
   | `stopsEnemies` | `stopZone` → `moveIndexes`, `shipReach` | Stops enemy movement when entering zone (Picket) |
   | `deployTargets` | `deployTargets` | Additional valid cells for Deploy action (Beacon) |
   | `action` (`options`, `apply`) | generic `power` action handler | Custom active power button & execution (Shoot, Barrier) |

   Barrier needed one piece of engine state no hook could hold: `GameState.barriers`, which `isEmptySpace`
   (deploys, shots, Tactical, Nomadic, start slots), the move searches (`reach`, `shipReach`), `carryOptions`,
   Warp Gate placement and `checkInvariants` read.

3. **Generic action pipeline.** Powers with an `action` hook produce `{ type: 'power', die, target?, to? }`.
   The UI automatically renders a button with `ability.name`, highlights valid targets, and displays
   `ability.hint` without needing UI code changes.
4. **Cheap when unused.** Active hooks are cached per mode (`modeHasHook`).

### Mode Safety & Invariants

- **Hooks are trusted engine code:** they can mutate `GameState`; there is no sandbox.
- **Golden test protection:** Golden replays change only when a rule does. Update them deliberately
  (`npx vitest run golden -u`) and say why in the commit.

### Adding a New Hook

Only add a new hook when no existing hook fits:
1. Add the optional hook signature to `ShipHooks` in [ships.ts](../../packages/engine/src/ships.ts).
2. Name the hook after the **rule concept** (e.g. `stopsEnemies`), not the specific power name (`picket`).
3. Read the hook via `hooksOf` in the single engine function it affects.
4. Add a scenario test in [regolith.test.ts](../../packages/engine/test/regolith.test.ts).
