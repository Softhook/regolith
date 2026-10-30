# Regolith: the rules

The developer reference behind the player's manual ([`Manual.tsx`](../apps/web/src/rulebook/Manual.tsx), the
in-game *How to play* and the printable `#rulebook`). The manual teaches; this file states each rule once,
precisely, with the rulings a rules engine needs and the engine's name for each thing. Where the two disagree,
the engine and its tests ([`packages/engine/test/`](../packages/engine/test)) are right and both texts are fixed.

Regolith was split off from Cubic on 2026-10-27 ([SPLIT.md](regolith/SPLIT.md)). How each rule came to be, and what was tried, is in
[PROTOTYPING.md](regolith/PROTOTYPING.md); the cards, look and words in [REGOLITH.md](regolith/REGOLITH.md).

## Rule sets

| | Basic | Regolith |
|---|---|---|
| Who it is for | Learning: the game without cards | The full game |
| Cards, Research, Sinkhole research | No | Yes |
| Starting skill | No | Draw 2 Skills, keep 1 |
| Everything else | Same | Same |

Both are `RuleSet`s in [`rulesets.ts`](../packages/engine/src/rulesets.ts); Basic is Regolith with `cards: null`.

## Words

The engine keeps its original identifiers; players read Regolith's words (REGOLITH.md §7).

| Players read | Engine | Notes |
|---|---|---|
| mech | ship, `Die` | A die on the map; its face is its kind (1–6) |
| objective | planet | Numbered 7–10 |
| perimeter | orbit, orbital spaces | The 6 spaces next to an objective |
| claim | conquer | |
| drop | deploy | |
| refit | reconfigure | |
| salvage yard | scrapyard | Destroyed mechs, waiting to drop |
| Power | dominance | |
| atomic | missile | |
| Sinkhole | void | A tile with no objective |
| Ice Tunnel | warp gate | Made by the Ice Tunnel tactic |

## Components

Per player: 7 dice (3 mechs to start, 2 in reserve, one each to mark Power and Research), cubes (as many as the
map says, 4 to 7), a player aid, 1 atomic. Shared: hex tiles (one objective or Sinkhole or blank ground
each, laid as the map's setup sheet shows), barrier tokens, and in Regolith the Skill and Tactic decks and the
Reinforcements pile.

## The map

Hex maps of 7-hex tiles ([`data/maps.yaml`](../data/maps.yaml), [HEX.md](HEX.md)). A tile is an objective with
its six spaces, a Sinkhole, or blank ground. An objective may sit off the middle of its tile, and two perimeters
may share a space: a mech there is on both.

- An objective numbered *n* holds *n* − 6 cubes, at most one per player.
- Objectives, mechs and barriers block movement. Mechs move out of a side of their space, never diagonally.
- Starting objectives are marked on the map; each player's is their **home objective**.
- **Prepared ground.** Some maps start with an Ice Tunnel or wormhole (a pair of spaces each) and/or barriers already on them, laid
  as the map's setup sheet shows. They are the same as the ones a game makes: a barrier belongs to
  nobody, and Kinetic Shunt can still push it; the tunnel is moved like any other by the Ice Tunnel tactic; a wormhole is never moved (ruling 15). Each start still has 3 free
  perimeter spaces of its own, and every objective can be reached from every start.

## Setup

1. Lay out the map. In Regolith, shuffle each deck, deal 3 face up beside it, and put players + 1
   Reinforcements cards in a face-up pile.
2. Each player puts a die on 1 on their Power and Research tracks and 2 dice aside as their reserve.
3. Regolith: each player draws 2 Skills, keeps 1 and puts the other at the bottom of the deck.
4. Each player rolls 3 mechs and may re-roll all 3 once.
5. Lowest total goes first; ties roll off. In turn order, each places a cube on a starting objective (their
   home) and their 3 mechs on its perimeter.

## A turn

1. **Start.** Regolith: +1 Research for each of your mechs on a Sinkhole.
2. **Up to 3 actions**, any order, any repeats. Each mech makes at most one move, attack or shot a turn.
   Mech powers and cards may also be used after the last action.
3. **Cards** (Regolith): take 1 for each objective you claimed this turn (Take Over included), and 1 if your
   Research is at 6, which then resets to 1.

### Actions

| Action | Cost | |
|---|---|---|
| Move | 1 | Up to the mech's number of spaces, **at most 3**. Turning is free; nothing is passed through. |
| Attack | 1 | A move whose last step goes into an enemy mech; it needs the movement to get there. |
| Claim | 2 | Your mechs on the perimeter sum to **exactly** the objective's number: place a cube on it. |
| Drop | 1 | A mech from your salvage yard, as rolled, onto an empty perimeter space of an objective holding your cube. |
| Refit | 1 | Re-roll a mech, on the map or in the salvage yard, until it shows a number it hasn't shown this turn. |
| Research | 1 | Regolith: +1 Research. |

**Claim** counts every one of your mechs on the perimeter: none can be left out. The objective needs a free cube
space and none of your cubes. Mechs off the perimeter, and barriers on it, never count.

**Back to your own** (Entanglement): once every objective with room holds one of your cubes, you may
claim one you are already on. The sum needed rises by 3 for each of your cubes there.

### Holding ground

- **Zones of control.** A mech that moves onto a space next to an enemy mech (a hex side, not a corner) stops
  there. It may still attack from there, another enemy beside it included, but not with no steps left. A mech
  that starts its move in a zone may leave it. Your own mechs never stop you. An Ice Tunnel exit in a zone
  stops the mech there.
- **Contested perimeters.** While an opponent's mech is on an objective's perimeter, nobody else may claim it
  or drop onto it, by any route (Reinforcements and Infiltration included). A space two perimeters share is
  closed if either is contested. Your home objective's perimeter is always open to your drops. Take Over ignores
  contests.

## The mechs

Each mech's kind is its die face ([`ships.ts`](../packages/engine/src/ships.ts), [`powers/`](../packages/engine/src/powers)).
A power is used on your turn, on the map, once per die per turn, even if the die changes kind.

| | Mech | Power |
|---|---|---|
| 1 | Breacher | **Free Attack:** attack an adjacent enemy without using its move. |
| 2 | Behemoth | **Carry & Move:** carry one of your mechs next to it as part of its move, and set it down next to it. |
| 3 | Tactician | **Swap:** swap places with any of your other mechs. |
| 4 | Chameleon | **Change to 3 or 5:** refit as a Tactician or a Sniper, without rolling. |
| 5 | Sniper | **Shoot:** for 1 action, attack the first mech down a straight line out of any side, at any distance, if the line is clear. This is the mech's one move, attack or shot of the turn. The shooter never advances. |
| 6 | Wisp | **Barrier:** for no action, besides its move, fire a barrier onto any empty space down a clear straight line. |

**Lines** (Shoot, Barrier) run straight out of a side of the mech's space. Mechs, objectives, barriers and the
map's edge stop them; Sinkholes and Ice Tunnels don't, but a barrier can't land on a tunnel's space.

**Barriers** stay where they are put, unless Kinetic Shunt pushes one. No mech moves, drops or shoots through one. On a perimeter space a barrier holds
it, as a mech would, but never counts towards a claim.

## Combat

Attacker and defender each roll a die and add their mech's number. **Lower wins; ties go to the attacker.**

- **Attacker wins:** the defender is destroyed (re-rolled into its owner's salvage yard). Attacker +1 Power,
  defender −1. The attacker moves into the space or stays put; a Sniper always stays.
- **Defender wins:** the attacker goes back to where it attacked from. Nothing else happens.

**Take Over.** When your Power reaches 6, place a cube at once on any objective with room and none of your cubes,
contested or not, then reset to 1. With nowhere to place it, Power stays at 6.

**Atomics.** Spend one to make your own combat roll a 1 (ruling 2). Everyone starts with one.

## Cards (Regolith)

The decks are in [`data/regolith.yaml`](../data/regolith.yaml): Skills (kept, at most 3, working from the next
player's turn; take a fourth and discard one), Tactics (happen when taken, then discarded) and the
Reinforcements pile (*Roll a reserve mech. Put it on the perimeter of an objective with one of your cubes, or in
your salvage yard.*). Each card's `effect` is its rule in the engine, named after the Community card it began as.

Cards are taken one at a time from the face-up rows. After each pick the row slides along and refills next to
the deck, so the card farthest from it is the oldest. **Peek:** taking the oldest card in a row, you may first
look at the top of that deck and take that card instead. An empty deck is refilled by shuffling its discards.

Cards earned on another player's turn (by Take Over) are taken after the active player's. A bonus turn (Forced
March) is played at once; cards still owed are taken at its end.

## Winning

The moment your last cube is placed, you win.

## Rulings

Settled questions the card text or the rules above leave open. Each is cited from the code as
*RULES.md ruling N*. Most were decided while these cards were the original ones (in Cubic's `OPEN-QUESTIONS.md` and
`RULE-SUGGESTIONS.md`, kept in this repo's history); the card names here are Regolith's, with their `effect`.

1. **Combat roll order.** Roll (Paired Cannons, `brutal`: the lower of 2) → set (Drill Sergeant, `rational`: 3;
   Kill Zone, `plan-ahead`: 1; both: 1) → an atomic's 1 → modifiers (Armour Piercing, `ferocious`: −1; Close
   Protection, `strategic`: −2). A total may go to 0 or below.
2. **When atomics are fired.** Once both combat dice are rolled and before the battle resolves, the attacker
   and defender, in that order and again until both pass, may each fire at their own roll, and only while
   losing. Nobody else may.
3. **Stolen Flag** (`prideful`). A player who takes it from another discards down to their skill limit at once,
   but not the Stolen Flag. A stolen one works at once. Whenever it starts working (stolen, at the end of the
   turn it was taken, or back after Signal Jammer), a player with Power 4 or more gains Take Over at once.
4. **Strategic Plan** (`patient`). Only Tactics can be stored. At the end of each turn a player may play one
   stored Tactic, even when ending the turn with actions unused, which are lost.
5. **Peek with an empty deck.** Taking the oldest face-up card first reshuffles the discards into a new deck,
   as for any draw, and the peek goes ahead. No peek only when the deck and its discards are both empty.
6. **Engineering** (`clever`). After any refit, ±1, even onto a number already shown this turn. No wrap
   between 1 and 6 (as with Field Refit, `flexible`).
7. **Arms Deal** (`profiteering`). Only picks earned by the Claim action (going back to your own included)
   may become an atomic, not Take Over's or Research's. A card taken first uses a pick not from a claim when there
   is one.
8. **Sneak** (`devious`). Through enemy mechs on Move and Attack only, not on Behemoth carries or Advance's
   (`tactical`) one-space move. A mech can't stop on an enemy's space or attack from one, and doesn't pass
   through its own. Sneak ignores zones of control.
9. **Signal Jammer** (`ruthless`). The disabled skill returns at the start of the jammer's next regular turn,
   not a bonus turn (as with Sabotage). A disabled skill that changes hands works for its new owner at once.
10. **Destroying by card** (Orbital Cannon, `show-of-force`). It counts as destroying a mech for Breakthrough
    (`hostile`), Exploit (`plundering`), Trophy Hunters (`ravenous`) and Stolen Flag, on enemy mechs only. The
    victim loses no Power: only combat and card text change Power.
11. **Ice Tunnels** (`warp-gate`). The tunnel's two spaces are next to each other for moves and attacks,
    Close Protection's support and Infiltration's (`stealthy`) "not next to a mech" (board.ts `linked`). A
    tunnel never links an objective, so perimeters and claims are unchanged.
12. **Fanatics** (`righteous`). Blocks every Research gain, not resets. Stand Down (`composed`), which costs
    Power, isn't offered under it, and Take Over's reset to 1 isn't a loss.
13. **Veteran Crew** (`talented`). It counts towards the skill limit, and raises it as soon as it's held, so
    taking it as a fourth skill forces no discard.
14. **Combat Power** is +1 to the winner and −1 to the loser of a combat only, unless Fanatics protects them.
15. **A map's own Ice Tunnel and wormhole** (`warp-gate`). The Ice Tunnel is the game's one tunnel: the tactic closes a
    map's own and opens its pair as it would any other. A **wormhole** is a second pair, linked in just the same way
    (ruling 11) but for good: the tactic can't close it or land a tunnel mouth on it, so a map that depends on it
    (Two Arcs, whose islands meet only there) can't be cut in two. It shows violet, with a double ring. Barriers a
    map starts with are the map's, not any player's.
