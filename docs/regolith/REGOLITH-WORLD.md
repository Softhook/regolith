# Regolith: the world

The one place where Regolith's setting is decided: the story, the sides, the six mechs, the places
worth fighting over, and the words the game uses. Cards, scenes, the player aid, the rulebook and the UI
take their names and flavour from here; when a name changes, it changes here first.
[REGOLITH.md](REGOLITH.md) is how the game is built; this is what it is about.

The [mood board](../moodboards/regolith/README.md)'s World and Mech roster boards show the same, and are where
names get tried out (the roster's names are its Tweaks); a name settled there is copied here. Last synced
from the canvas 22 October 2026.

## The story

**Regolith**: the loose dust and broken rock that covers Mars and its moons. Everything here is built on it, and
everything gets buried in it.

> Generations ago China, America, Europe and the South each founded settlements on Mars, to send water and
> power back to Earth. Then contact with Earth was lost and the ships stopped coming. Nobody on Mars knows
> why, and nobody alive remembers Earth.
>
> What was left: four settlements that had never trusted each other, a few refineries and reactors, and
> the ice. Ice is drinking water, air and rocket fuel. There was never enough of it near the surface for
> everyone, and now no one will send more.
>
> The mechs were never meant for war. They were mining and construction walkers: they dug ice, hauled
> tanks and raised domes. The same chassis takes a drill, a crane, a sensor mast or a cannon, and in the
> first winter of the shortage every workshop on Mars learned to fit cannons.
>
> **Claim it.** Nobody can afford to destroy what they are fighting for: a cratered refinery feeds no one.
> So the war is fought for control: walk your mechs into the ground around a site, hold it, and plant your
> cubes where the others can't pull them out.

**Phobos** is the same war, earlier and colder, in the dark polar craters; the Phobos maps are that front.
Its ground is grey and its light is hard; on Mars the ground is rust and the light is dusty. **Deimos**, the
smaller, outer moon, is the far front: its craters are drowned in dust, and its ground is smooth and a little red,
streaked bright where the dust slid down the slopes.

## Themes

What every card, scene and line of text should feel like:

- **Scarcity.** Water is the prize behind every objective. Nobody fights for glory.
- **Make do.** Refitted, patched, salvaged, never new. A wrecked mech comes back from the salvage yard as
  something else. Refitting re-rolls a mech's die.
- **Weight.** Mechs are slow and plant themselves. Ground is held by standing on it (zones of control,
  contested orbits), not by racing across it: the rules' own aim (PROTOTYPING.md, *From Arithmetic Sprint
  to Positional War*) told as a story.
- **Ground.** Dust, craters, ice, wind and sinkholes. The map is a place, not a grid in space.
- **Working people.** Crews, foremen and engineers. No chosen ones, no aliens, no superweapons.
- **Printed matter.** The settlements' own posters, work orders and field manuals: flat inks, bold
  shapes, stencilled numbers.

Not in Regolith: aliens, warp drives, space battles, giant anime robots, gore. Mechs are big machines
(6–9 m), not giants: a habitat dome is always bigger than a mech.

## The sides

Four settlements, one per seat: spin-offs of the Earth powers that founded them, long ago. They kept the
old flags, and their names have drifted with the generations (Europe's Yuropa, China's Zhong, America's Merika, the South's Austral): they answer to nobody on Earth, and are not those nations at war. For now they are flavour only: every side plays with the same mechs and
rules. They are the starting point if Regolith ever tries asymmetric sides (PROTOTYPING.md §6.6).

| Seat | Colour | Side | Who they are | Wants |
|---|---|---|---|---|
| 1 | Blue (`#3d8bff`) | **Yuropa Commune** | Ice miners from the north polar cap, the oldest settlement. Run by their work crews. | To keep the ice that was theirs first |
| 2 | Red (`#d62839`) | **Zhong Combine** | What is left of the Earth-chartered company: the contracts, the refineries and the best workshops. | To keep running Mars as a business |
| 3 | Amber (`#ffb703`) | **Merika Free Port** | Traders and fixers from the volcanic highlands, who own the reactors and owe nobody. | Power, and the price of it |
| 4 | Green (`#80ed99`) | **Austral Collective** | Farm settlements in the deep Hellas basin: the most people and the thirstiest crops. | Water, before the next harvest fails |

The colours are `PLAYER_COLORS` in [theme.ts](../../apps/web/src/theme.ts) (and `PLAYER_HUES` in the art package), the same in every mode. The sides are not in the game yet: players still name their own seats.

## The six mechs

One chassis, six fits. A mech's die value is its current fit: lower is heavier and harder to beat in
combat, higher is lighter and quicker. A refit re-rolls the die.

| Die | Mech | Fit | Power (Regolith rules as they stand) | Why it fits |
|---|---|---|---|---|
| 1 | **Breacher** | Close combat mech | *Free Attack*: attack an adjacent enemy without using its move | Sits on the ground with its gun already trained |
| 2 | **Behemoth** | Battle carrier | *Carry & Move*: carry a nearby mech as part of its move, then drop it next to it | Hauls other frames in its cargo cradle and leads the column |
| 3 | **Tactician** | Tunnelling assault frame | *Swap*: swap places with any of your other mechs | Bores through the ice tunnels and surfaces where another mech stood |
| 4 | **Chameleon** | Flexible hardpoint | *Change to 3 or 5*: refit as a Tactician or a Sniper | The standard frame, one arm swap away from either |
| 5 | **Sniper** | Long-range gunner | *Shoot*: attack the first enemy in a clear straight line, without moving | Fires down a line of hexes from where it stands |
| 6 | **Wisp** | Recon drone | *Barrier*: once a turn, for free and besides its move, fire a permanent barrier onto any clear hex in a straight line; nothing moves, drops or shoots through it, and it can hold a perimeter space | Darts ahead of the column and walls off the ground behind it: its spinneret sprays molten regolith that cools into a low web of glass threads (as Pele's hair), anchored to the ground and no one's once spun |

**Silhouette reference:** [mech-silhouettes.jpg](../moodboards/regolith/reference/mech-silhouettes.jpg), twelve
front views (reference only, not ours to print). The mechs should read apart by outline alone, in black, as
these do. A second sheet, [mech-silhouettes-2.jpg](../moodboards/regolith/reference/mech-silhouettes-2.jpg), has
eight more, each beside a human figure for scale. Rows and columns of the first sheet count from the top left:

| Mech | Closest silhouettes | What to take |
|---|---|---|
| Breacher (1) | Row 3, 1 and 2 | Squat, solid, low and wide; legs barely visible |
| Behemoth (2) | Row 2, 1 and 2 | Flat wide body slung between long crane arms: a carrier |
| Tactician (3) | Row 1, 3; row 3, 3 | Hunched, long heavy arms, a drill or ram |
| Chameleon (4) | Row 1, 1; row 3, 4 | Upright and boxy, missile pod on the shoulder, long gun: the standard frame |
| Sniper (5) | Row 1, 4 | Top-heavy gun body on thin legs |
| Wisp (6) | Row 2, 3 | Small pod on spindly legs; lighter than the rest (or lifted off the ground, as the Vocabulary board's drone) |

If a mech's power changes in PROTOTYPING.md, its row here changes with it, and the name stays only if it
still fits.

## Objectives

The planets of Quantum are the sites worth holding. Their number is what it takes to claim them, so the
bigger the site, the more it is worth fighting for.

| Number | Objective | What it is |
|---|---|---|
| 7 | **Habitat** | Pressure domes and a connecting tube, where crews live |
| 8 | **Refinery** | Turns ice and regolith into water, air and fuel |
| 9 | **Ice Mine** | A drill over a buried ice sheet |
| 10 | **Reactor** | Power for everything around it |
| Void | **Sinkhole** | Ground collapsed into a melted ice pocket. Nothing to hold, but a mech there gains research |

Props on the board and on cards: bunker, comms mast, drop pod, barricade, boulders (Vocabulary board).

## The words

How Quantum's terms read in Regolith. Those that stay the same are listed too, so it is clear they were
decided, not forgotten.

| Quantum | Regolith |
|---|---|
| Ship | **Mech** |
| Planet | **Objective** |
| Orbit, orbital positions | **Perimeter** |
| Quantum cube | **Cube** |
| Conquer | **Claim** |
| Dominance | **Power** |
| Research | **Research** |
| Scrapyard | **Salvage yard** |
| Reconfigure | **Refit** |
| Deploy | **Drop** |
| Missile | **Atomic** |
| Warp Gate | **Ice Tunnel** |
| Skill / Tactic | **Skill / Tactic** |
| Sector (map names) | **Region**: Utopia Planitia, Hellas Basin, Shackleton |

**Power** is also what the game calls a mech's ability (the 5's Shoot is a "power" in the code and the
docs). Players only see "ability" today, so there is no clash on screen, but the rulebook should say
"ability" for mechs once dominance is called power.

## In the game

What a Regolith game shows today:

- **The name**, in the lobby's mode menu and the game's top bar.
- **The mech names and power texts**, everywhere a ship is named: board, sidebar, log, combat and the other
  overlays. They live in the mode's ship table (`SHIPS` in
  [ships.ts](../../packages/engine/src/ships.ts)), and the engine and web app ask the
  game's rules for a name (`shipOf`, `shipName`), so each rule set can name its own mechs.
- **Hex maps only**, on Phobos's, Deimos's and Mars's ground.
- **The words** in the table above, across the game's text: log, hints, cards, panels and errors
  ([REGOLITH.md](REGOLITH.md) §7).

Not yet: the objective names, the sides.
