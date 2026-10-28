# Hex Tiles

*Since 2026-10-27 hexes are Regolith's only board: the square grid, its maps and the space look are gone
(their code is in the history). This file records how the hex board was designed and measured against the
squares, so it still compares the two; the lobby and modes it names are as they were then.*

The game played on hexagonal tiles instead of 3×3 squares. The rules are unchanged; what changes
is which spaces are next to each other, how far apart they are, and what counts as a diagonal. Pick a
map from the **Hex tiles** group in the lobby with the **Regolith** rules (only those, while hexes are
being tried out; the tests pin the geometry down with Basic's). One card is left out on hexes: see *Cards*.

## The tiles

A hex tile is a 7-hex flower: the planet in the middle and the six spaces around it. Flowers tile the
plane with no gaps, and the planets of touching tiles are 3 spaces apart, as on squares.

| | Square tile | Hex tile |
|---|---|---|
| Spaces | 8 around the planet | 6 around the planet |
| Orbital positions (where ships conquer from) | the 4 orthogonal ones | all 6 |
| Spaces that are no planet's orbit | the 4 corners | none |
| Tiles a tile touches | up to 4 (and 4 at a corner) | up to 6 |

On a hex map every space of a planet's tile is in its orbit, and each space orbits one planet only, while the
planets sit in the middle of their tiles (see *Off-centre planets*). Only a Void's or a blank's spaces orbit
no planet.

## How the rules read on hexes

| Rule | On squares | On hexes |
|---|---|---|
| Next to / adjacent (moving, attacking, deploying, the 1's free attack) | 4 orthogonal spaces | the 6 hexes sharing a side |
| Movement | up to the die number, orthogonally | up to the die number, hex to hex |
| Distance | rows + columns | hexes |
| Conquer | your ships in the planet's 4 orbital positions add up exactly to its number | the same, with 6 orbital positions |
| 2 Flagship: carry a nearby ship and drop it next to you | the 8 surrounding spaces | the 6 touching hexes |
| 5 Interceptor: move and attack diagonally (Basic, Classic, Community) | the 4 corner spaces, touching only at a corner | the 6 hexes two away that sit between two neighbours |
| Warp Gates, Nomadic (not in Basic) | unchanged | unchanged (Nomadic's neighbouring tiles are the planets 3 hexes away) |
| Regolith's zones of control (Picket) | the 4 orthogonal spaces | the 6 hexes sharing a side |
| Regolith's 5 Interceptor: Shoot along a clear straight line | 4 lines, up, down, left, right | 6 lines, one out of each side |

**The Interceptor's diagonal.** A square's diagonal step covers two spaces of distance in one step and
slips between two neighbours. The hex diagonal does the same: it is two hexes away, between the two
hexes that touch both, and the Interceptor may take it even when both are occupied. So the 5 keeps
the same edge it has on squares: it is never boxed in, and it attacks from one step farther away.
Regolith, the only rules the lobby offers hexes with, gives the 5 Shoot instead, so in play today the
hex diagonal is only pinned down by the tests.

**Conquering.** Six orbital positions mean up to six of your ships can count towards a planet's
number, and an opponent needs more ships to block it. With 3 to 5 ships per player, a conquest still
needs most of your fleet in orbit.

**Cards.** Most cards read the same on hexes. Ingenious (both editions: "conquer from the corners") counts
ships diagonal to a planet, and hex tiles have no corners: the hex diagonals are other planets' orbits,
so it would add six more spaces to every orbit. It is left out of the decks on a hex map (ruling 20 October
2026, `dealt` in [`effects.ts`](../packages/engine/src/effects.ts)).

## The maps

Hex versions of the three basic maps, with the same cubes per player (and, below, of some advanced maps, and
maps on open ground). A layout in
[`data/maps.yaml`](../data/maps.yaml) with `grid: hex` reads as rows of tiles where each odd row sits half
a tile to the right.

| Map | Shape | Planets | Starts |
|---|---|---|---|
| Alpha Sector, 2 players | A 3×3 rhombus on its point (rows 1-2-3-2-1) | eight 7s, an 8 in the middle | the two far points, 4 tiles apart |
| Beta Sector, 3 players | A triangle of 10 tiles around a 10 | the 7s and 8s alternate around the 10 | the corners (8s), each touching one 7 and one 8 |
| Gamma Sector, 4 players | The rhombus, with a 10 in the middle | 9s and 8s, the same after a half turn | the points (9s), touching a 9 and an 8; the sides (8s), touching a 9, an 8 and the 10 |

The square maps' corners are all alike; a rhombus has two sharp points and two blunt sides, so Gamma
starts two players at each, with bigger home planets on the remoter points. The seats aren't alike yet:
the sides also touch the 10, and each side's planet is 6 hexes from all three other starts, while a point's
is 6 from the sides and 10 from the other point. Beta, a 3-player map, is the same after a third of a turn,
so its seats match.

No hex map can be the same in a mirror: the flowers' lattice is turned about 11° from the hexes (see
*Drawing*), and a mirror turns it the other way. A map's seats can only match by turning it.

### Advanced maps on hex tiles

Seven advanced maps adapted to hex tiles (the hex group), each keeping its square map's idea and cubes, and
the same after a half turn (a third of a turn for 3 players) where the square map is the same in a mirror:

| Map | Players | The idea kept |
|---|---|---|
| Terra Minor | 2 | a band of six 8s, a start at each end |
| Circular Logic | 2 | a ring of eight round a hole (two tiles on hexes), the starts across it |
| The Great Plan | 2 | a void ringed by 8s and 7s, the starts out among 7s |
| Critical Density | 3 | the starts crowded two spaces apart round the middle, 8s between |
| Edge of Oblivion | 3 | a void ringed by 9s and 8s, the starts at the points |
| Nexus | 4 | two 10s in the middle, 7s and 8s round them, the starts round those |
| Tesseract | 4 | a 10 in the middle and four arms out to the starts |

### Open ground

Blank tiles (`-` in a layout) are open ground: seven spaces with no planet, which, unlike a Void's, give no
research. The open group spreads its planets out with them, among a few voids, so mechs cross open country
between sites: Arcadia Planitia and Valles Marineris (2 players), Stickney Crater and Tharsis Rise (3),
Utopia Planitia and Limtoc (4). Each is the same turned. On a world's ground a blank tile is bare ground,
no base; in space, sky alone.

### New layouts

Six more hex maps draw on Cubic's opposed starts, central contests, long lanes and four-arm boards,
while offering different routes and setup economies:

| Map | Players | The idea |
|---|---:|---|
| Elysium Reach | 2 | Distant, matching home sites and a contested 9, with broken lanes and alternate approaches |
| Trinary Wells | 3 | A rotationally balanced triangle around a research void, with a balanced outer ring and tight cube economy |
| Hellas Divide | 4 | Equal 9 starts around twin research voids, trading Nexus's central 10s for more open lanes |
| Canyon Relay | 2 | A direct, narrow race between equal homes and a central 10 |
| Mare Trigonum | 3 | Equal 9 starts around a 10, with threefold rings of 7s and 8s |
| Fourfold Confluence | 4 | Equal 8 starts on four arms, with 7s on the approaches and a 10 at the crossing |

## First AI results

20 games per map, level 2 AI (Captain) in every seat, averages per game. With the Basic rules,
19 October 2026:

| Map | Rounds | Attacks | Conquers | Wins by seat |
|---|--:|--:|--:|---|
| Alpha Sector | 10.4 | 12.5 | 6.0 | 10/10 |
| Alpha Sector | 10.8 | 17.4 | 5.8 | 14/6 |
| Beta Sector | 13.7 | 33.4 | 8.2 | 11/3/6 |
| Beta Sector | 14.9 | 43.4 | 7.5 | 8/4/8 |
| Gamma Sector | 14.9 | 48.9 | 9.6 | 2/4/6/8 |
| Gamma Sector | 19.2 | 85.8 | 7.0 | 6/3/6/5 |

On hexes ships meet more often: more neighbours, and every space is some planet's orbit. Games run a
little longer, and Gamma's much longer (+29%), with conquests harder to finish among more fighting.
Twenty games are too few to read anything into the seat wins.

With the Regolith rules, as the lobby offers hexes (moves capped at 3, zones of control, Shoot, Community
cards without Ingenious on hexes), the same seeds, 20 October 2026:

| Map | Rounds | Attacks | Conquers | Wins by seat |
|---|--:|--:|--:|---|
| Alpha Sector | 7.3 | 5.8 | 5.1 | 7/13 |
| Alpha Sector | 7.0 | 7.8 | 5.7 | 6/14 |
| Beta Sector | 9.4 | 23.7 | 7.3 | 9/3/8 |
| Gamma Sector | 9.5 | 37.4 | 6.5 | 5/5/3/7 |

Zones of control halve the fighting on hexes as on squares, and Gamma Sector no longer runs long: about as
many rounds as Beta. No game stalled.

## Interaction

The question: are the classic rules on squares a more solitary game, each player conquering on their own,
with fewer ways of getting in each other's way? `npm run interaction` ([`interaction.ts`](../scripts/interaction.ts))
measures it over self-play. After every action it scores each player's own position with the AI's evaluation
(`valueOf` in [`evaluate.ts`](../packages/ai/src/evaluate.ts), in cube points) and credits the change to the
player who acted and to what they did. The main measure:

- **Interaction ratio**: how much a player's value moves in the opponent's actions, over how much it moves in
  their own. Near 0, the opponent hardly matters.
- **Harm**: what the opponent's actions take off a player's value, per player-turn, and what kind of
  action did it (attacks with their battles, moves, cards: research, picks, skills and tactics).

And counts of the board itself: turns starting with the two fleets at most 2 spaces apart, moves ending next to
an enemy ship, turns with both players' ships in one planet's orbit, and turns where a player's orbit adds up to a
planet's number but an enemy ship sits in it (a conquest blocked). The setups compare the hex board with the
rules apart: Regolith without cards is the same rules with `cards: null`.

Level 4 AI (Admiral) in both seats, Alpha Sector, 200 games per setup, the same seeds, 21 October 2026
(`npm run interaction -- 200 4,4`):

| | Basic | Classic | Community | Proto, no cards | Proto | Proto, no cards | Proto (hex) |
|---|--:|--:|--:|--:|--:|--:|--:|
| Player-turns | 23.3 | 19.5 | 17.1 | 24.8 | 17.4 | 25.4 | 17.2 |
| Battles | 15.1 | 10.8 | 9.1 | 12.7 | 7.0 | 18.7 | 9.6 |
| **Interaction ratio** (±0.02) | 0.34 | 0.30 | 0.30 | 0.38 | 0.33 | 0.44 | **0.39** |
| Harm per player-turn (cubes) | 0.20 | 0.20 | 0.22 | 0.19 | 0.21 | 0.25 | **0.29** |
| Harm from attacks | 82% | 73% | 56% | 41% | 30% | 47% | 32% |
| Harm from moves | 13% | 14% | 11% | 47% | 42% | 42% | 39% |
| Harm from cards | | 8% | 16% | | 15% | | 16% |
| Harm from missiles | | | 12% | 6% | 7% | 4% | 7% |
| Own gains from cards | | 7% | 11% | | 12% | | 12% |
| Card actions per game | | 10.6 | 17.4 | | 18.5 | | 18.3 |
| Turns with fleets ≤ 2 apart | 44% | 41% | 36% | 49% | 40% | 61% | 51% |
| Moves ending next to an enemy | 8% | 8% | 7% | 7% | 7% | 17% | 16% |
| Turns with a shared orbit | 22% | 23% | 21% | 35% | 31% | 40% | 34% |
| Conquests blocked per game | 0.17 | 0.24 | 0.14 | 1.25 | 0.82 | 1.72 | 1.00 |

- **Classic on squares is the most solitary.** The Regolith rules on squares add a little interaction
  (0.30 → 0.33), the hex board as much again (0.39), with 45% more harm per turn than Classic: the fleets
  meet more, and twice as many moves end next to an enemy ship.
- **The interaction changes kind.** In Classic three quarters of the harm is attacks. In Regolith about
  40% is moves: zones of control, orbits taken, conquests blocked (most of those are contested orbit's, §6.8
  in [PROTOTYPING.md](regolith/PROTOTYPING.md)), the getting in each other's way the classic game lacks.
- **Cards make every game more solitary.** With cards the games are about a third shorter in Regolith,
  with half the battles and less contact, and the ratio falls by 0.04–0.05 in every rule set: cards harm the
  opponent (Tactics mostly), but they help their player about as much, so players race for conquests more
  than they fight.
- **Cards weigh about twice as much in Regolith as in Classic** (15–16% of the harm against 8%), as
  Community's Skills and Tactics do more than Command and Gambit cards. Hexes don't change that.
- The player who took more cards won 86–97% of games, but a player ahead has actions to spare for research,
  so that says little of what the cards do; the games without cards do.

**Skill.** Level 4 against level 2 (`npm run interaction -- 200 2,4`), Admiral's wins: Basic 78%,
Classic 84%, Regolith without cards 82% (square) and 82%, with cards 84% and 82%, each ±5. Neither
the hexes nor the cards make the stronger player win more or less often: they add neither luck nor
skill that this measures.

**Limits.** The AI's evaluation was tuned on squares and may miss what hexes offer; harm is the evaluation's
view, so threats count as well as losses; one 2-player map. Gamma, where the fighting was heaviest,
is next.

## Drawing

Hexes are flat-topped, one space tall, with columns √3/2 of a space apart. The flower lattice is turned
about 11° from the hexes, so a map's rows of tiles lean a little. The map is drawn in the same layers as a
square one ([GRAPHICS.md](GRAPHICS.md), *Tiles*): each tile's sky cut to its flower, its planet, the
seams, then a line along each space's hex edge (`HEX_EDGE`) the same as the seams, faded with them as one so shared sides are no darker.

**Sizes.** A hex is one space (32 mm) from flat side to flat side, so neighbouring dice sit 32 mm apart,
as on squares, and a flower is 92.4 × 96 mm, inside the 96 mm trim. The well (`HEX_WELL` 0.8) is
25.6 mm across: a 19 mm die fits it snugly, its rounded corners close to the slanted sides, where the
square pad leaves 2.5 mm round it; labels keep clear of it. The spaces are marked by their hex edges
alone, not a sunk well.

## Code

- **Engine.** [`board.ts`](../packages/engine/src/board.ts) builds hex boards (`Board.hex`) in axial
  coordinates. `geometry(board)` is the one place the two shapes differ: each one's sides, diagonals,
  touching spaces and step count. `adjacent`, `surrounding`, `distance`, `diagonals`, `isDiagonalStep`,
  `tileCentres` and `grid()`'s neighbour lists all read it, and the rest of the engine and the AI ask
  those, so the rules needed no change. `drawing(board)` says where each space is drawn, and
  `cellAtPoint` which space a tap lands on. A hex map can't wrap: `buildBoard` refuses one that does.
- **Web.** Everything on the map is placed with `drawing(board).at`, in pixels through `placement` in
  [`geometry.ts`](../apps/web/src/components/board/geometry.ts) (a space's `box` and `mid`). `BoardArt` draws the tiles of both shapes with
  [`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx), in layers worked out from the board. A highlighted space and a ship take taps on
  their hex only (`.board.hex` in styles.css), not on the corners of their square box, which lie in the next
  hexes. The lobby previews a hex map with a hex for each tile, placed and turned as the game draws them,
  and its turning backdrop draws them as the game does, with its fleets moving hex to hex.
- **Tests.** [`hex.test.ts`](../packages/engine/test/hex.test.ts) pins each rule above, and the
  legal-move cross-check in [`consistency.test.ts`](../packages/engine/test/consistency.test.ts) plays a
  hex game (all three with `DEEP=1`). `npm run hex:check` plays a first move in Chrome on the square
  Alpha Sector, each hex map and each drift map, tapping where the space is drawn (on a hex, near its top
  right side, where the next hex's square box reaches over), and checks the map
  draws a well for each space, cross-hatched where the engine has orbits overlap.

## Off-centre planets

The engine can place a tile's planet off its middle, on one of the spaces around it, on squares and
hexes alike: a layout token takes a compass direction, `7ne` or `8s*` ([`data/maps.yaml`](../data/maps.yaml)).
The **Off-centre planets** group in the lobby (Regolith rules) has maps for two, three and four players
(see *Drift maps*).

| | Square tile | Hex tile |
|---|---|---|
| Where the planet may sit | any of the 8 spaces around the middle, corners too | any of the 6 outer hexes |
| Its orbit on its own tile | 3 spaces, the middle among them; from a corner, the 2 edge spaces beside it, not the middle | 3 hexes, the middle among them |
| Its orbit on other tiles | 1 space of the tile it faces (from a corner, 1 each of two tiles) | 3 hexes: 2 of one tile, 1 of another |
| Spaces of its tile in no orbit | 5 (6 from a corner) | 3 |

The orbit is still the spaces next to the planet, so the rules read the same:

- **Edges.** Facing the map's edge or a gap, a planet loses those orbital spaces: 3 left, or 2 in a corner of the map.
- **Overlaps.** Two planets' orbits may share a space. A ship there counts towards conquering both.
  Moving or deploying there names both planets.
- **Neighbours.** Two planets may be next to each other; neither orbits the other's space.
- **Starts.** Each starting planet needs room for the 3 starting ships in orbital spaces no other start
  shares; `buildBoard` refuses a map otherwise.
- **Nomadic** reaches the planets of the tiles touching the tile of any planet the ship orbits, found by
  the tiles' middle spaces (`tilesTouch`), however far the planets themselves are.

[`offset.test.ts`](../packages/engine/test/offset.test.ts) pins these on two test maps, and the legal-move
cross-check plays games on them.

**Drawing.** The map is drawn in layers ([GRAPHICS.md](GRAPHICS.md), *Tiles*), so an off-centre planet
needs nothing of its own: its body is placed on its space and cut off at its tile's edge, the spaces are
drawn over it, and their marks come from the board, not the tile. An orbit reaching onto the next tile is
hatched there, a space in two orbits is cross-hatched, and a Void space in an orbit keeps its flask too.
The number goes in the planet's corner nearest its tile's middle, as its printed tile has it, so it never
meets the map's edge or a neighbour; on hexes, at the vertex three hexes share. The flavour label shows
only where the spaces up and left of the planet are its own tile's and the number isn't there. The Art
Lab shows and exports every tile as a hex tile, die-cut along its flower ([GRAPHICS.md](GRAPHICS.md) §3), and
with its planet on any space.

### Drift maps

The maps keep their seats balanced by a half-turn for 2 or 4 players, or a third-turn for 3 players,
while their planets sit off-centre and their orbital spaces cross tile boundaries.

| Map | Layout | What the offsets do |
|---|---|---|
| Binary Reach (square), 3 × 4 tiles with two gaps | `8se* 10 7sw .` / `7sw 7s 7n 7ne` / `. 7ne 10 8nw*` | Each middle 7 leans towards a 7 on the next tile and shares 2 orbital spaces with it. The outer 7s sit against the map's edge with 2 orbital spaces. |
| Twin Drift, 12 tiles | `7se 8* . .` / `9 0 7n` / `. 8 8 .` / `7s 0 9` / `. . 8* 7nw` | Each start shares 2 orbital hexes with the 7 beside it, and the 9s share 2 more. Two 7s drift to the edge (3 orbital hexes); two Voids sit between. |
| Circular Drift | `. 7s* 8 8` / `8 . . 8` / `. 8 8 7n*` | Opposed 7 starts lean into the ring's two-tile hole and pull their orbits across the ring. |
| Trinary Drift | `8* 7n 8 8*` / `8 10 7se` / `. 7sw 8` / `. 8*` | Three 7s drift around a 10; each is a third-turn from the next, so the seats match. |
| Nexus Drift | `. 9*` / `8 7ne 9*` / `8 10 10 8` / `9* 7sw 8` / `. . 9*` | Two 7s lean toward the twin 10s; their opposite directions preserve the half-turn balance. |

Only 7s and 8s go off the middle of a square tile, and only 7s off a hex tile (`OFF_CENTRE` in
[`tile/geometry.ts`](../packages/art/src/tile/geometry.ts)). An off-centre planet sits on its tile's edge space, half a space
from the edge: a 9 or 10 is wider than that (0.6 and 0.72 spaces from its middle to its rim), and an 8
fills an outer hex right to its sides. [`mapLayers.test.ts`](../apps/web/test/mapLayers.test.ts) holds every
map to this.

The first maps were compared in 100 games each with level 2 AI (Captain) in both seats and the same seeds,
20 October 2026. The later maps have not yet been included in this benchmark. Averages per game:

| Map | Rounds | Attacks | Conquers | Wins by seat |
|---|--:|--:|--:|---|
| Alpha Sector | 10.1 | 12.3 | 6.2 | 62/38 |
| Binary Reach | 14.5 | 17.7 | 7.7 | 52/48 |
| Twin Drift | 13.9 | 21.5 | 8.0 | 45/55 |

The drift maps' seat splits are within chance at 100 games. Alpha Sector's 62/38 is at the edge of it,
and an earlier run with other seeds gave 43/57, so it says more about 100 games than about the seats.
With 7 cubes (on the first layouts, which had the 10s and 9s off-centre) the games ran about 20 rounds,
and one stalled: each player's last free cube location was on the other's home planet,
and neither AI went for it.

## Not yet

- A hex form of Ingenious, if it's worth having back (see *Cards*).
- Hex versions of more advanced maps, and of the add-on and BGA ones; wrapping maps.
- Turning a tall map on its side to fit a wide screen.
- Packing hex tiles closer on a sheet: they print in the square tiles' 2 × 2 grid, though flowers nest.
- Off-centre planets in the lobby's small map previews (they show each tile's number only).
- The AI scores each planet on its own, so a ship in a shared orbit counts towards both, and it doesn't
  see that moving it off one planet's orbit leaves the other's too.
- A ruling on a Void space in a planet's orbit, before a map puts one there: a ship there would gain
  Research and count towards the conquest, which no rule says it should or shouldn't.
