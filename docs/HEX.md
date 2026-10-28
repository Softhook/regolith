# Hex Tiles

Regolith is played on hexagonal tiles, and only on them. This file records how the board works: the tiles, how
the rules read on them, the maps, how they are drawn, and what was measured while they were designed.

## The tiles

A tile is a 7-hex flower: the planet in the middle and the six spaces around it. Flowers tile the plane with
no gaps, and the planets of touching tiles are 3 spaces apart.

- A planet has 6 orbital positions, where ships conquer from: every space of its tile.
- A tile touches up to 6 others.
- Every space of a planet's tile is in its orbit, and each space orbits one planet only while the planets sit
  in the middle of their tiles (see *Off-centre planets*). Only a Void's or a blank's spaces orbit no planet.

## How the rules read

| Rule | On the hex board |
|---|---|
| Next to / adjacent (moving, attacking, deploying, the 1's free attack) | the 6 hexes sharing a side |
| Movement | up to the die number (capped at 3), hex to hex |
| Distance | hexes |
| Conquer | your mechs in the planet's 6 orbital positions add up exactly to its number |
| 2 Tactician: carry a nearby mech and drop it next to you | the 6 touching hexes |
| Zones of control (Picket) | the 6 hexes sharing a side |
| 5 Sniper: Shoot along a clear straight line | 6 lines, one out of each side |

**Conquering.** Six orbital positions mean up to six of your mechs can count towards an objective's number, and
an opponent needs more mechs to block it. With 3 to 5 mechs per player, a conquest still needs most of your fleet
in orbit.

**Cards.** Most cards read the same. Ingenious ("conquer from the corners") counts ships diagonal to a planet,
and hex tiles have no corners: the hex diagonals are other planets' orbits, so it would add six more spaces to
every orbit. It is not in Regolith's decks (`dealt` in [`effects.ts`](../packages/engine/src/effects.ts)).

## The maps

A layout in [`data/maps.yaml`](../data/maps.yaml) reads as rows of tiles where each odd row sits half a tile to
the right.

### The basic maps

Same cubes per player.

| Map | Shape | Planets | Starts |
|---|---|---|---|
| Alpha Sector, 2 players | A 3×3 rhombus on its point (rows 1-2-3-2-1) | eight 7s, an 8 in the middle | the two far points, 4 tiles apart |
| Beta Sector, 3 players | A triangle of 10 tiles around a 10 | the 7s and 8s alternate around the 10 | the corners (8s), each touching one 7 and one 8 |
| Gamma Sector, 4 players | The rhombus, with a 10 in the middle | 9s and 8s, the same after a half turn | the points (9s), touching a 9 and an 8; the sides (8s), touching a 9, an 8 and the 10 |

A rhombus has two sharp points and two blunt sides, so Gamma starts two players at each, with bigger home
planets on the remoter points. The seats aren't alike yet: the sides also touch the 10, and each side's planet
is 6 hexes from all three other starts, while a point's is 6 from the sides and 10 from the other point. Beta,
a 3-player map, is the same after a third of a turn, so its seats match.

No hex map can be the same in a mirror: the flowers' lattice is turned about 11° from the hexes (see
*Drawing*), and a mirror turns it the other way. A map's seats can only match by turning it.

### Advanced maps

Seven further maps, each the same after a half turn (a third of a turn for 3 players):

| Map | Players | The idea |
|---|---|---|
| Terra Minor | 2 | a band of six 8s, a start at each end |
| Circular Logic | 2 | a ring of eight round a hole (two tiles), the starts across it |
| The Great Plan | 2 | a void ringed by 8s and 7s, the starts out among 7s |
| Critical Density | 3 | the starts crowded two spaces apart round the middle, 8s between |
| Edge of Oblivion | 3 | a void ringed by 9s and 8s, the starts at the points |
| Nexus | 4 | two 10s in the middle, 7s and 8s round them, the starts round those |
| Tesseract | 4 | a 10 in the middle and four arms out to the starts |

### Open ground

Blank tiles (`-` in a layout) are open ground: seven spaces with no planet, which, unlike a Void's, give no
research. The open group spreads its planets out with them, among a few voids, so mechs cross open country
between sites: Arcadia Planitia and Valles Marineris (2 players), Stickney Crater and Tharsis Rise (3),
Utopia Planitia and Limtoc (4). Each is the same turned. On a world's ground a blank tile is bare ground, no
base.

### Further layouts

Six more maps with opposed starts, central contests, long lanes and four-arm boards, offering different routes
and setup economies:

| Map | Players | The idea |
|---|---:|---|
| Elysium Reach | 2 | Distant, matching home sites and a contested 9, with broken lanes and alternate approaches |
| Trinary Wells | 3 | A rotationally balanced triangle around a research void, with a balanced outer ring and tight cube economy |
| Hellas Divide | 4 | Equal 9 starts around twin research voids, trading Nexus's central 10s for more open lanes |
| Canyon Relay | 2 | A direct, narrow race between equal homes and a central 10 |
| Mare Trigonum | 3 | Equal 9 starts around a 10, with threefold rings of 7s and 8s |
| Fourfold Confluence | 4 | Equal 8 starts on four arms, with 7s on the approaches and a 10 at the crossing |

## Measurements

**Self-play, Regolith rules** (moves capped at 3, zones of control, Shoot), 20 games per map, level 2 AI
(Sergeant) in every seat, 20 October 2026, averages per game. Twenty games are too few to read anything into
the seat wins. No game stalled.

| Map | Rounds | Attacks | Conquers | Wins by seat |
|---|--:|--:|--:|---|
| Alpha Sector | 7.3 | 5.8 | 5.1 | 7/13 |
| Alpha Sector (other seeds) | 7.0 | 7.8 | 5.7 | 6/14 |
| Beta Sector | 9.4 | 23.7 | 7.3 | 9/3/8 |
| Gamma Sector | 9.5 | 37.4 | 6.5 | 5/5/3/7 |

### Interaction

The question: do players get in each other's way, or conquer each on their own? `npm run interaction`
([`interaction.ts`](../scripts/interaction.ts)) measures it over self-play. After every action it scores each
player's own position with the AI's evaluation (`valueOf` in [`evaluate.ts`](../packages/ai/src/evaluate.ts),
in cube points) and credits the change to the player who acted and to what they did.

- **Interaction ratio**: how much a player's value moves in the opponent's actions, over how much it moves in
  their own. Near 0, the opponent hardly matters.
- **Harm**: what the opponent's actions take off a player's value, per player-turn, and what kind of action did
  it (attacks with their battles, moves, cards: research, picks, skills and tactics).

And counts of the board itself: turns starting with the two fleets at most 2 spaces apart, moves ending next to
an enemy mech, turns with both players' mechs in one objective's orbit, and turns where a player's orbit adds up
to an objective's number but an enemy mech sits in it (a conquest blocked).

Level 4 AI (Colonel) in both seats, Alpha Sector, 200 games, 21 October 2026 (`npm run interaction -- 200 4,4`):

| | Regolith, no cards | Regolith |
|---|--:|--:|
| Player-turns | 25.4 | 17.2 |
| Battles | 18.7 | 9.6 |
| **Interaction ratio** (±0.02) | 0.44 | **0.39** |
| Harm per player-turn (cubes) | 0.25 | **0.29** |
| Harm from attacks | 47% | 32% |
| Harm from moves | 42% | 39% |
| Harm from cards | | 16% |
| Harm from missiles | 4% | 7% |
| Card actions per game | | 18.3 |
| Turns with fleets ≤ 2 apart | 61% | 51% |
| Moves ending next to an enemy | 17% | 16% |
| Turns with a shared orbit | 40% | 34% |
| Conquests blocked per game | 1.72 | 1.00 |

- **The interaction is of getting in each other's way.** About 40% of the harm is moves: zones of control,
  orbits taken, conquests blocked (most of those are contested orbit's, §6.8 in
  [PROTOTYPING.md](regolith/PROTOTYPING.md)).
- **Cards make every game more solitary.** With cards the games are about a third shorter, with half the
  battles and less contact, and the ratio falls by 0.05: cards harm the opponent (Tactics mostly), but they help
  their player about as much, so players race for conquests more than they fight.
- The player who took more cards won 86–97% of games, but a player ahead has actions to spare for research, so
  that says little of what the cards do; the games without cards do.

**Skill.** Level 4 against level 2 (`npm run interaction -- 200 2,4`): Colonel won 82% of games without cards
and 82% with them, each ±5. Neither the hexes nor the cards add luck or skill that this measures.

**Limits.** Harm is the evaluation's view, so threats count as well as losses; one 2-player map.

## Drawing

Hexes are flat-topped, one space tall, with columns √3/2 of a space apart. The flower lattice is turned about
11° from the hexes, so a map's rows of tiles lean a little. The map is drawn in layers
([GRAPHICS.md](GRAPHICS.md), *Tiles*): each tile's ground cut to its flower, its planet, the seams, then a line
along each space's hex edge (`HEX_EDGE`) the same as the seams, faded with them as one so shared sides are no
darker.

**Sizes.** A hex is one space (32 mm) from flat side to flat side, so neighbouring dice sit 32 mm apart, and a
flower is 92.4 × 96 mm, inside the 96 mm trim. The well (`HEX_WELL` 0.8) is 25.6 mm across: a 19 mm die fits it
snugly; labels keep clear of it. The spaces are marked by their hex edges alone, not a sunk well.

## Code

- **Engine.** [`board.ts`](../packages/engine/src/board.ts) builds boards in axial coordinates. `adjacent`,
  `distance`, `diagonals`, `tileCentres` and `grid()`'s neighbour lists are the one place the geometry lives, and
  the rest of the engine and the AI ask those. `drawing(board)` says where each space is drawn, and
  `cellAtPoint` which space a tap lands on. A map can't wrap: `buildBoard` refuses one that does.
- **Web.** Everything on the map is placed with `drawing(board).at`, in pixels through `placement` in
  [`geometry.ts`](../apps/web/src/components/board/geometry.ts) (a space's `box` and `mid`). `BoardArt` draws the
  tiles with [`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx), in layers worked out from the
  board. A highlighted space and a ship take taps on their hex only (`.board.hex` in styles.css), not on the
  corners of their box, which lie in the next hexes. The lobby previews a map with a hex for each tile, placed
  and turned as the game draws them, and its turning backdrop draws them as the game does.
- **Tests.** [`hex.test.ts`](../packages/engine/test/hex.test.ts) pins each rule above, and the legal-move
  cross-check in [`consistency.test.ts`](../packages/engine/test/consistency.test.ts) plays hex games (all of
  them with `DEEP=1`). `npm run hex:check` plays a first move in Chrome on the hex and drift maps, tapping where
  the space is drawn (near a hex's top right side, where the next hex's box reaches over), and checks the map
  draws a well for each space, cross-hatched where the engine has orbits overlap.

## Off-centre planets

The engine can place a tile's planet off its middle, on one of the six spaces around it: a layout token takes a
compass direction, `7ne` or `8s*` ([`data/maps.yaml`](../data/maps.yaml)). The **Off-centre planets** group in
the lobby has maps for two, three and four players (see *Drift maps*).

- Its orbit on its own tile is 3 hexes, the middle among them; on other tiles 3 hexes more: 2 of one tile, 1 of
  another. 3 spaces of its tile are in no orbit.

The orbit is still the spaces next to the planet, so the rules read the same:

- **Edges.** Facing the map's edge or a gap, a planet loses those orbital spaces: 3 left, or 2 in a corner of the map.
- **Overlaps.** Two planets' orbits may share a space. A ship there counts towards conquering both.
  Moving or deploying there names both planets.
- **Neighbours.** Two planets may be next to each other; neither orbits the other's space.
- **Starts.** Each starting planet needs room for the 3 starting ships in orbital spaces no other start
  shares; `buildBoard` refuses a map otherwise.
- **Tactician** (Nomadic) reaches the planets of the tiles touching the tile of any planet the mech orbits,
  found by the tiles' middle spaces (`tilesTouch`), however far the planets themselves are.

[`offset.test.ts`](../packages/engine/test/offset.test.ts) pins these on two test maps, and the legal-move
cross-check plays games on them.

**Drawing.** The map is drawn in layers ([GRAPHICS.md](GRAPHICS.md), *Tiles*), so an off-centre planet needs
nothing of its own: its body is placed on its space and cut off at its tile's edge, the spaces are drawn over
it, and their marks come from the board, not the tile. An orbit reaching onto the next tile is hatched there, a
space in two orbits is cross-hatched, and a Void space in an orbit keeps its flask too. The number goes in the
planet's corner nearest its tile's middle, as its printed tile has it, so it never meets the map's edge or a
neighbour: at the vertex three hexes share. The Art Lab shows and exports every tile die-cut along its flower
([GRAPHICS.md](GRAPHICS.md) §3), and with its planet on any space.

### Drift maps

The maps keep their seats balanced by a half-turn for 2 or 4 players, or a third-turn for 3 players, while
their planets sit off-centre and their orbital spaces cross tile boundaries.

| Map | Layout | What the offsets do |
|---|---|---|
| Twin Drift, 12 tiles | `7se 8* . .` / `9 0 7n` / `. 8 8 .` / `7s 0 9` / `. . 8* 7nw` | Each start shares 2 orbital hexes with the 7 beside it, and the 9s share 2 more. Two 7s drift to the edge (3 orbital hexes); two Voids sit between. |
| Circular Drift | `. 7s* 8 8` / `8 . . 8` / `. 8 8 7n*` | Opposed 7 starts lean into the ring's two-tile hole and pull their orbits across the ring. |
| Trinary Drift | `8* 7n 8 8*` / `8 10 7se` / `. 7sw 8` / `. 8*` | Three 7s drift around a 10; each is a third-turn from the next, so the seats match. |
| Nexus Drift | `. 9*` / `8 7ne 9*` / `8 10 10 8` / `9* 7sw 8` / `. . 9*` | Two 7s lean toward the twin 10s; their opposite directions preserve the half-turn balance. |

Only 7s go off the middle of a tile (`OFF_CENTRE` in [`tile/geometry.ts`](../packages/art/src/tile/geometry.ts)).
An off-centre planet sits on its tile's edge space, half a space from the edge: a 9 or 10 is wider than that
(0.6 and 0.72 spaces from its middle to its rim), and an 8 fills an outer hex right to its sides.
[`mapLayers.test.ts`](../apps/web/test/mapLayers.test.ts) holds every map to this.

Twin Drift against Alpha Sector, 100 games each with level 2 AI (Sergeant) in both seats and the same seeds,
20 October 2026, averages per game: Alpha Sector 10.1 rounds, 12.3 attacks, 6.2 conquers, seats 62/38; Twin
Drift 13.9, 21.5, 8.0, seats 45/55. The seat splits are within chance at 100 games, and an earlier run with other
seeds gave Alpha Sector 43/57. With 7 cubes (on the first layouts, which had the 10s and 9s off-centre) the
games ran about 20 rounds, and one stalled: each player's last free cube location was on the other's home
planet, and neither AI went for it.

## Not yet

- A hex form of Ingenious, if it's worth having back (see *Cards*).
- More advanced maps, and the add-on and BGA ones; wrapping maps.
- Turning a tall map on its side to fit a wide screen.
- Packing tiles closer on a sheet: they print in a 2 × 2 grid, though flowers nest.
- Off-centre planets in the lobby's small map previews (they show each tile's number only).
- The AI scores each planet on its own, so a ship in a shared orbit counts towards both, and it doesn't see that
  moving it off one planet's orbit leaves the other's too.
- A ruling on a Void space in a planet's orbit, before a map puts one there: a ship there would gain Research
  and count towards the conquest, which no rule says it should or shouldn't.
