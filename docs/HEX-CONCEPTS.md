# Hex Concepts

Ideas for a game that grows out of the hex board rather than porting Quantum onto it. Nothing here is
built or tested, and nothing is chosen: each section is a menu of options to knock about, pick from and try
with the AI. For the hex board as it plays today (the Basic rules, unchanged), see [HEX.md](HEX.md).

## The aim

A small abstract game with a simple core of rules, as basic Santorini is, plus **ship powers on the die
faces**, as in Quantum. The powers are what link the two games: a Santorini god breaks one rule for your
workers; a Quantum ship's face gives it one ability. Here each face breaks one rule of the core, and the
power sits on the piece, not on the player, so it changes when the die changes.

It keeps **combat**, and it makes **space matter**: where your ships are, what lies between them and
the enemy, and how long it takes to get somewhere should decide games. No cards in the core game.

## What goes wrong in Quantum

Quantum makes the board nearly irrelevant:

- **Big numbers move far.** A 6 moves 6 spaces, round any obstacle, on maps about 9 to 12 spaces across.
  Almost anything is in reach within a turn or two.
- **Nothing slows you down.** Ships block only the space they stand on; there is no terrain and no zone of
  control, so a fleet goes round a defender rather than through it.
- **Fast is the default.** High numbers move far and lose fights; low numbers win fights and crawl. A
  player can always swap one for the other (reconfigure), so the trade-off is a dial, not a commitment.
- **Ships appear where they are needed.** Deploying at any planet you own, and Warp Gates, skip the space
  in between.

The ideas below each attack one of these.

## What we borrow

| Game | Core | What it gives us |
|---|---|---|
| **Santorini** (basic) | Each player has 2 workers. A turn is: move one worker one space, then build one level next to it. Stand on level 3 to win; a dome caps a tower for good. | **Move, then act.** Very few pieces. Short moves. Every action changes the board for both players. |
| **Santorini** (gods) | Each player has one god card, and each god breaks exactly one rule: move twice, build twice, swap with an opponent, push them back. | **Powers that bend a small core.** The core is simple enough that one broken rule is easy to learn and to play against. |
| **Amazons** | Each player has 4 queens. A turn is: move a queen in a straight line, then shoot an arrow in a straight line, which burns that space for good. The last player able to move wins. | **Lines and permanent blocking.** The board shrinks and splits into territories. Already played on hex boards. |
| **Hex wargames** | Units on hexes, zones of control, terrain, support from neighbours. | **Geography in combat**: who is next to whom, and what is in the way. |
| **Undaunted 2200: Callisto** (Osprey, 2024) | Small-unit sci-fi skirmish, infantry and mechs, on illustrated maps of a rocky moon and its stations. Each space can have elevation, cover, impassable ground, no-vehicle ground, bridges and objective points. Elevation sets the attacker's die: d12 shooting down, d10 on the level, d8 shooting up. A target's defence is its base plus the space's cover plus 1 per space of range. You may only move through spaces you have scouted or control. A mech is three cards (navigator, gunner, commander) and loses one per casualty. | **Terrain that changes the fight**: high ground, cover, ground heavy units can't cross, range as defence. Units that wear down a step at a time. Advancing as something you prepare for. |
| **Quantum** | Dice as ships, each face a ship type with its own ability; planets with numbers, conquer by ringing a planet, win by placing all your cubes. | **Dice as numbered pieces with powers**, planets, cubes, combat between dice. |

## What the hex board gives

| Hex fact | Why it matters here |
|---|---|
| **6 neighbours, all alike** | One clear idea of "next to" for movement, support and zones of control. No diagonals. |
| **6 lines through every hex** | Lines of sight and shots are easy to see; debris in a line blocks it. |
| **An orbit is a ring of 6** | A planet is a place you hold by surrounding it, and fight over hex by hex. |
| **Zones of control tile cleanly** | Two ships one hex apart close the gap between them, so a few ships can form a real line. Wargames use hexes for this reason. |
| **No crossing paths** | A wall of ships and debris can't be slipped through at a corner, so fronts and enclosures are always clear. |

## 1. Movement

Quantum's long moves are the first thing to fix. Two questions: how far a ship goes, and how it may get
there. They mix freely.

### How far

| Option | The rule | Feel |
|---|---|---|
| **Number = distance** (Quantum) | A ship moves up to its number. | Anything is in reach; the board barely matters. The thing to move away from. |
| **Number = distance, capped at 3** | Up to its number, at most 3. | Closest to Quantum, but no ship crosses the map in a turn. Low numbers crawl. |
| **Heavy is slow** | A 1 or 2 moves 3, a 3 or 4 moves 2, a 5 or 6 moves 1. | A strong ship is a commitment: it takes turns to arrive, and the enemy sees it coming. But it is a table to remember, and 1 or 2 hexes may be too slow to give the game any life. |
| **Everyone moves 2** | Every ship moves up to 2. | Simplest. Geography comes from distance and blockers alone. Possibly sluggish. |
| **Everyone moves 3** | Every ship moves up to 3. | As simple, with more life. Whatever makes heavy ships heavy has to come from elsewhere: how they move, what stops them, or what they can do after moving. |

On the 49-hex first board, 3 hexes a turn crosses the map in about 3 turns; 1 hex takes 7 or more.

### How a ship gets there

| Option | The rule | Feel |
|---|---|---|
| **Any path** | Step hex to hex, round obstacles. | The default. |
| **Heavy ships go straight** | Light ships (1–3) turn as they like; heavy ships (4–6) move in a straight line, along one of the 6 directions out of their hex. | *Everyone moves 3, heavy ships can't turn.* In open space a heavy ship is as fast as a light one; among planets, debris and other ships it is clumsy and has to line up its approach a turn ahead. One wreck in a lane blocks a heavy ship while a light one goes round. |
| **Three classes** | 1–2 turn freely, 3–4 turn once, 5–6 go straight. | Finer than two halves, one more thing to remember. |
| **Everyone goes straight** (Amazons) | Every ship moves in a straight line. | Board of lanes; positions lock up fast. |

Heavy ships going straight overlaps with the Lancer's *Charge* (see *Powers*): with it, the Lancer needs
another power, such as *may turn once* or *charges past 3 hexes, until something blocks it*.

### Other ways to make heavy ships heavy

Each of these keeps one distance for every ship and puts the weight somewhere else:

| Option | The rule | Feel |
|---|---|---|
| **Heavy ships get pinned** | A heavy ship must stop next to any enemy; a light ship stops only next to a heavy one. | Light ships screen and slip through; heavy ones get stuck in fights. |
| **Strong ships stop small ones** | You must stop next to an enemy whose number is at least yours. | One comparison. A 6 brushes past small ships, a 1 is stopped by anything: big ships break lines, small ones go round. The reverse of heavy is slow. |
| **Move or fight** | A light ship may move and attack in a turn; a heavy ship does one or the other. | Heavy ships cover ground but strike a turn later, so the enemy sees them coming. Works on an open map. |
| **Rough ground** | Heavy ships can't enter rubble (see *Terrain*). | The weight lives in the map; needs terrain on the board. |
| **Light ships move twice** | Move one ship, or two light ships. | Light ships act more often to make up for being weak. Slower turns. |

### What stops a ship

| Option | The rule | Feel |
|---|---|---|
| **No zones of control** (Quantum) | Ships block only their own hex. | Fleets go round defenders. |
| **Zone of control: stop** | A ship that moves next to an enemy ship stops there. | You can't slide past a defender; you fight it or go the long way round. This alone makes positions and fronts. Risk of standoffs. |
| **Zone of control: slow** | Moving out of a hex next to an enemy costs a whole step extra. | Softer; fronts bend instead of locking. |

**Blockers:** planets, ships and debris can't be entered or passed.

### Orbit and deploying

- **Orbit:** a ship next to a planet may move round its ring one extra hex. Rings are easy to reposition in
  and hard to break into. (With *heavy ships go straight*, the orbit hex is a turn: either heavy ships don't
  get it, or it is the one turn they may take.)
- **Deploy only at home.** New ships enter next to your home planet (or any planet you own, if the maps get
  bigger) and walk from there. No Warp Gates in the core game.

## 2. Strength

### What the number means

| Option | The rule | Feel |
|---|---|---|
| **Higher is stronger** | The number is added to the combat roll. | The reverse of Quantum; reads naturally. Heavy ships are the high faces. |
| **Lower is stronger** (Quantum) | Lower number wins. | Familiar to Quantum players; awkward next to "heavy" meaning high. |
| **Light and heavy halves** | 1–3 light, 4–6 heavy; strength is the number. | Two classes for movement and powers to hang off. |
| **Three pairs** | 1–2 light, 3–4 medium, 5–6 heavy. | Matches the pairs of neighbouring faces in *Powers*. |

A number difference dominates a d6 roll: a 6 attacking a 1 wins 35 times in 36. Whatever the powers are,
the low faces need a reason to exist.

### Changing the number

In Quantum you can reroll at will. Options for making a number change only for a reason, and somewhere on
the map:

- **Refit:** a ship next to a planet you own may spend its action to go up 1. Strength is built at home and
  has to travel to the front.
- **Damage:** a ship that wins a fight goes down 1. Ships wear out away from home.
- **Deploy:** a new ship rolls its number, as in Quantum, and enters next to a planet you own.
- **Reroll** (Quantum), perhaps only at home, or at a cost.

If the power is on the face (see *Powers*), changing the number changes the power too. Refitting is choosing
the next ship type, not just adding strength, and a ship damaged in a fight comes out of it as a different
ship.

**Wearing down.** An Undaunted mech is three cards and loses one per casualty, so a hit weakens it before it
dies. With *damage*, the faces already do this: a long fight wears a Dreadnought down into a Lancer, then a
Gunship.

## 3. Powers

### Where powers sit

| Option | Feel |
|---|---|
| **One per face** (Quantum) | Six ship types; the most variety, the most to read. |
| **One per class** | Two or three powers: light ships do one thing, heavy ships another. Very easy to read. |
| **None in the core** | Learn the core first, add powers as a second step, as Santorini adds gods. |
| **Per player** (fleet doctrines) | A Santorini-style power per player, such as a card that changes all your Gunships. Where Quantum's Command cards and the Community Edition's skills could come back. Can go on top of any of the above. |

### One set of six

Each face is a ship type with one power, and each power **breaks exactly one rule of the core**, as a
Santorini god does. Strength is the number, higher is stronger; speed comes from whichever *Movement* option
is used.

| Face | Ship | Power | Rule it breaks |
|:-:|---|---|---|
| 1 | **Scout** | **Slip:** ignores zones of control and may move through enemy ships (not end on them). | Zones of control stop you. |
| 2 | **Tug** | **Tow:** takes one friendly ship next to it along on its move and drops it next to where it stops. | You move one ship a turn. |
| 3 | **Sapper** | **Engineer:** may also lay or clear one debris next to it, on top of its action. | Debris is permanent; one action a turn. |
| 4 | **Gunship** | **Fire:** attacks along a straight line up to 3 hexes, if nothing is in the way. | You attack only next to you. |
| 5 | **Lancer** | **Charge:** instead of stepping, moves any distance in a straight line until something blocks it. | You move up to your speed. |
| 6 | **Dreadnought** | **Anchor:** enemy ships next to it can't move away. | Zones of control only stop ships moving in. |

**Opposite faces.** On a die the opposite faces add up to 7, and the powers are paired the same way: the
Scout slips zones of control and the Dreadnought makes them stronger; the Tug moves others and the Lancer
moves itself far; the Sapper shapes the terrain and the Gunship shoots across it. Turning a die over gives
you the counter to what you were, at least in theme: only the first pair really counters in play.

**Neighbouring faces.** With three pairs of strength, neighbours share a class: Scout and Tug are light
support, Sapper and Gunship work the lines and the terrain, Lancer and Dreadnought hold the front.

**The faces are a ladder.** With refit and damage, refit goes up one face, damage goes down one: a Scout
refits into a Tug, a Dreadnought that wins a fight becomes a Lancer. Each step changes what the ship is for.

**Questions about this set:**

- The strongest faces have the strongest-looking powers (Charge, Anchor) and the Tug the weakest. Should
  the best powers go on the low faces instead, as Quantum's abilities make up for weak numbers?
- Several powers lean on other choices: Slip and Anchor need zones of control, Engineer needs debris,
  Charge clashes with *heavy ships go straight*.
- Does the Gunship's fire risk the Gunship, as an adjacent attack does, or only the target?
- Can a Lancer's charge end next to an enemy, and attack it? Does the Tug's tow end the towed ship's turn?

### How powers are chosen

- **One rule each.** The core stays the game; a power is a small exception you can hold in your head
  for every die on the board.
- **About space.** Every power is about movement, lines, zones of control or debris. None of them
  teleports.
- **Readable.** The power is on the face, so you can read the whole board's powers at a glance, as you
  read Santorini's gods.
- **Answered by position.** Each power has a counter on the board: block the Lancer's line, keep
  away from the Dreadnought, put debris in front of the Gunship.

**What's dropped from Quantum, and why.** The Destroyer's swap teleports and the Scout's and Frigate's
free number changes unhook the number from the map, which is the problem this design is trying to fix.
The Battlestation's extra attack and the Flagship's carry live on in the Dreadnought and the Tug. The
Interceptor's diagonal has no clean hex form; the Lancer replaces it.

## 4. Combat

Keep it dice-driven, as Quantum's is, but let the board change the odds. Pieces to pick from:

- **Attack** an enemy ship next to you. Each side rolls one die and adds its ship's number; higher wins; the
  defender wins ties.
- **Support:** plus 1 for each friendly ship next to the defender (or +2). With equal ships, one point of
  support is worth about one face of strength: 15 in 36 for the attacker without it, 21 in 36 with it.
- **Flanking:** support from opposite sides of the defender is worth more (+2 instead of +1 for each
  opposite pair). Hexes have 3 pairs of opposite sides, so surrounding a ship is a visible, readable goal.
- **Cover:** a defender with debris next to it, between it and the attacker, gets +1.
- **Wrecks:** a destroyed ship leaves **debris** on its hex. Combat shapes the map: a battle leaves a field
  of wreckage that blocks movement and lines of fire for the rest of the game. This is where Amazons'
  blocking comes from, rather than from a separate shooting action.
- **Ranged fire** as one face's power (the Gunship), not a rule for everyone. Debris is then cover from fire
  as well as a wall.
- **Range as defence:** Undaunted adds 1 to a target's defence per space of range. With ranged fire, shots
  further off are safer but less likely to hit.
- **What happens after:** the loser's ship becomes debris and goes back to its owner's pool; the winner
  goes down 1 (see *Damage*), or keeps its number.

Wrecks look like the strongest single idea: the more players fight in a place, the harder that place gets
to cross, so battles move the front instead of erasing it.

## 5. The action after moving

Santorini's shape: move, then one action. Actions to choose from:

| Action | What it does |
|---|---|
| **Attack** | As in *Combat*. |
| **Lay debris** (mine) | Place debris on an empty hex next to the ship: build walls, close a gap, take a hex out of a ring. For everyone, or only as the Sapper's power, so the board doesn't close up too fast. |
| **Refit** | Next to a planet you own: the ship's number goes up 1. |
| **Claim** | See *Planets*. |
| **Deploy** | Instead of moving at all: bring in a new ship at home. |

## 6. Planets

A planet blocks movement and lines of fire, and its 6 neighbouring hexes are its ring.

| Option | The rule |
|---|---|
| **Sum the ring** (Quantum) | Claim when your ships in the ring add up to at least the planet's number and no enemy ship is in it. Debris in the ring leaves less room for your ships, so a ring full of wrecks can become impossible to take. |
| **Fill the ring** | When no hex of the ring is empty, whoever has more ships in it claims it. |
| **Hold the ring** | The planet is yours while you have more ships in its ring; score each round or at the end. |

The planet's number is both its difficulty and its value: an 8 needs a strong fleet in orbit and is
worth a lot.

## 7. Winning

| Option | Source | Notes |
|---|---|---|
| **Place all your cubes** (one per claimed planet) | Quantum | Clear and fast. |
| **Most planets' numbers** when no more can be claimed | — | Rewards the 8s and 10s. |
| **Connect two of your planets** by a chain of your ships, or wipe out the opponent's fleet | Hex, wargames | A shape on the board; strong on hexes. |
| **The opponent can't move** | Amazons | A fallback that ends every game. |

## 8. Board

- **Size.** Santorini plays on 25 spaces and Amazons on 100. A ring of 7 flower tiles is 49 hexes, the
  current hex Alpha Sector 63.
- **Chokepoints.** Gaps in the map, and debris placed at the start, make passes worth holding. Hexes have
  few natural chokepoints, so the map has to make them.
- **Tiles that turn.** A flower tile with debris or an off-centre planet on it can be laid in 6 turns, so a few
  tiles give many boards ([HEX.md](HEX.md), *Off-centre planets*).

## 9. Terrain

Undaunted 2200 shows how much a map's surfaces can do in a small fight: the same two units play
differently on a ridge, behind rocks or out in the open. Here, the open space between planets gets
surfaces too, printed on the flower tiles, so turning a tile also turns its terrain. Setting it on and around a
rocky moon, as Callisto is, gives the terrain a reason to be there.

| Surface | Effect | Who it favours |
|---|---|---|
| **Open** | None. | — |
| **Ridge** (high ground) | Attacking down from a ridge, roll 2 dice and keep the better; attacking up onto one, roll 2 and keep the worse. Undaunted does this by changing the die size; with d6 ships, two dice keep the dice the same. | Whoever gets there first; slow or clumsy heavies take longer to reach them. |
| **Rubble** (rocks, boulder fields) | +1 defence. Heavy ships can't enter. | The light ships fight in the rocks, the heavy ones go round. |
| **Crater** | +1 defence, but attacking out of one counts as attacking up. | Defenders. A place to hold, not to attack from. |
| **Ice** | A ship that steps onto ice slides one more hex in the same direction, if it can. | Ships moving in straight lines; everyone else risks overshooting. |
| **Chasm** | Impassable, but doesn't block lines of fire. | Gunships, which shoot across what nobody can cross. |
| **Debris** (wrecks) | Blocks movement and lines; +1 defence to a ship next to it, behind it from the attacker. | Defenders; and it grows wherever ships fight. |

**Building terrain.** Santorini builds levels; here the Sapper could raise rubble or clear it, as well as
debris, so that the map's surfaces change during the game, but only where a Sapper has been.

**Scouting.** Undaunted only lets you move through spaces you have scouted or control. A light version:
ships may only end a move on a hex within 3 of a friendly ship or planet you own. Fleets can't leap
ahead of their supply, and the fastest or slipperiest ships are what push the edge forward.

## Combinations to try

Picks from the menus above, as starting points for the AI, not answers. Each is two players on a 7-tile
flower (49 hexes): a home planet 7 on each of two opposite tiles, an 8 on each of the other four, a 10 in the
middle. Each player has 3 ships, rolled at the start, next to their home planet, and 3 cubes; the home planet
starts claimed. A turn is: move one ship (or deploy), then take one action.

| | **A. Heavy is slow** | **B. Heavy ships go straight** | **C. Bare core** |
|---|---|---|---|
| How far | 3 / 2 / 1 by pairs | 3 for all | 3 for all |
| How | Any path | Light any path, heavy straight | Any path |
| Stops | Zone of control: stop | Zone of control: stop | Zone of control: stop |
| Strength | Higher is stronger | Higher is stronger | Higher is stronger |
| Changing it | Refit, damage, deploy roll | Refit, damage, deploy roll | Refit, deploy roll |
| Powers | The set of six | The set of six, Lancer reworked | None |
| Combat | Support +1, wrecks | Support +1, wrecks | Support +1, wrecks |
| Lay debris | Any ship | Sapper only | Any ship |
| Planets | Sum the ring | Sum the ring | Sum the ring |
| Win | All cubes, wipe out, or opponent can't move | The same | The same |

**Questions for play**, by section:

1. **Movement.** Is 3 hexes the right life for the game, or too much on 49 hexes? With heavy is slow, do
   heavies arrive at all? With heavy ships going straight, do they get stuck behind debris so often that
   nobody refits past 3? Does the zone of control make the game stall in a standoff, and if so does "stop"
   need to become "slow"?
2. **Strength.** Does everyone just refit to 6 at home? Is +1 per refit too fast or too slow? Do light ships,
   if they are as fast as anything, still have a reason to be weak?
3. **Powers.** Is every face worth being? Look for a face the AI always refits past, or always stays on.
   Do the opposite faces counter each other, or does one of each pair just win?
4. **Combat.** Is support +1 enough to make positioning beat luck, or should it be +2? Do wrecks pile up fast
   enough to shape the board, or too fast, so that the middle closes up?
5. **Fleet size.** Are 3 ships each enough to fight and claim at once?
6. **Terrain.** Does the first player to the ridges win, or can ridges be taken? Does rubble that heavy ships
   can't enter make the light faces worth keeping?

## Testing

The engine already has the hex board, distances, neighbours, rings (`orbitals`), Quantum combat and the
AI and self-play tools. Still missing:

- **Debris** as a new kind of piece on a space, blocking moves and lines.
- **Zones of control** in move generation.
- **Terrain** on each hex, laid out in [`data/maps.yaml`](../data/maps.yaml) and printed on the flower tiles, and
  read by movement and combat. Debris can be one kind of terrain rather than a piece.
- **Lines** (for straight-line movement, the Gunship's fire and the Lancer's charge): the hexes along each of
  the 6 directions from a hex, stopping at the first block. One helper next to `adjacent` in
  [board.ts](../packages/engine/src/board.ts).
- **The powers**, each as a small exception in move generation or combat, as the Quantum ship abilities
  are now.
- **A new rule set** next to Basic and Regolith, with the options above as switches, so the lobby,
  AI and sweeps can run any combination.

Branching is small (3 ships, at most 3 hexes of movement, a handful of actions), so a search-based AI
should play it well, and the AI's games are a quick first read on each question before playing by hand.
