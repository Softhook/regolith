# Regolith

**Regolith** is our own game, and it took Prototyping's place in the lobby. It is played on hex tiles only,
on Phobos's, Deimos's and Mars's ground (the Regolith tiles), and has its own cards in the **screenprint** style.
It starts from the Community Edition cards and moves away from them, card by card, in name, design and
action. This doc sets out the structure for that: where each part lives, what it reuses, and the order to
build it in. It does not design the cards.

The look comes from the [Regolith mood board](../moodboards/regolith/README.md): the CardStyles, CardScale and
Vocabulary boards for the cards (flat inks on paper, three passes per part: colour plate, key ink, accent;
mechs and objectives built from one kit), HexSurface for the ground.

The rules themselves are the ones [PROTOTYPING.md](PROTOTYPING.md) designed, and they go on changing
there: Regolith is a rename and a new identity, not new rules.

## Decided (2026-10-22)

| | |
|---|---|
| Name | **Regolith**, in place of Prototyping in the lobby's mode menu |
| Maps | Hex only, each on Phobos, Deimos or Mars |
| Cards | Start as the Community cards, in Regolith's own deck; names, design and actions move away from Community over time |
| Card style | Screenprint |

## What changes, at a glance

| | Prototyping, before | Regolith |
|---|---|---|
| Lobby | "Prototyping" | "Regolith" (done) |
| Maps | Community's square maps, plus the hex and drift groups | Hex maps only, each on Phobos, Deimos or Mars (done) |
| Tiles | Ground on by default (top-bar switch to space) | The same; ground is the game's look |
| Rules | Community + cap 3, zones of control, Shoot, contested orbit and deploy | The same, plus the Wisp's Barrier, and still changing |
| Cards | Community's Skills and Tactics (no Ingenious on hexes) | Regolith's own decks, starting as copies of Community's |
| Card art | `cardSvg`, the holo-grid scenes | A screenprint card renderer and its own scenes |
| Words | Ship, planet, dominance, research | Mech, objective, control, intel (Vocabulary board; done in the UI, §7) |

## 1. The rename

Done (23 October 2026). There were no users to keep, so the rename went all the way down rather than only
changing the label:

- The mode's id is `'regolith'` (`GameMode` in [data.ts](../../packages/engine/src/data.ts), `RULESETS.regolith`
  in [rulesets.ts](../../packages/engine/src/rulesets.ts)), its folder `packages/engine/src/regolith/` with
  `regolithMode()` and the `REGOLITH_*` switches, its tests `regolith.test.ts`. The old ids (`'prototyping'`,
  and `'cubic'` before it) are gone, aliases included: saved and online games under them are dropped.
- The prototype kit ([prototype.ts](../../packages/engine/src/prototype.ts)) keeps its name: it is the engine's
  surface for experimental rules, whichever mode uses it.
- PROTOTYPING.md stays the design log of the rules, retitled as Regolith's, and keeps the word "prototyping" for the work, not the mode.
- **Kept apart, for a later split.** So Regolith can one day leave for its own app on the shared packages,
  only its folder, rulesets.ts and the `GameMode` type name it, by id or name; everything else asks the rule
  set (`contestedOrbit`, `words`, `grid`, `experimental` for the badge's colour, …). `regolith.test.ts` checks
  it across the engine, AI, online and web sources and the web app's styles, as it checks that the folder uses
  the engine only through the kit. It reads text, so a check that gets at the mode some other way (by its
  summary, say) passes it: review still matters. The split itself is planned in [SPLIT.md](SPLIT.md).
- **Other versions online.** A browser that gets an invite for a game it can't start (made by a version with
  other modes, maps or protocol) says so and asks both players to reload, rather than "Game not found".

## 2. Maps: hex only

Done (23 October 2026).

- `regolithMode()` sets its own `mapGroups` rather than adding to Community's: `hex`, `open` and `drift`,
  all hex. Binary Reach, the one square drift map, moved to `drift-square`, which no mode plays for now.
- Every hex map names its world in [data/maps.yaml](../../data/maps.yaml), and
  [build-data.mjs](../../scripts/build-data.mjs) refuses one that doesn't, so a map's world is a choice, not a
  default. Alpha and Gamma Sector, Circular Logic, Critical Density and Nexus (hex), Stickney Crater and
  Limtoc are `phobos`; Beta Sector, The Great Plan and Tesseract (hex) and Twin Drift are `deimos`; the rest
  are `mars`. (The engine still draws a test's ad-hoc hex map, which has no world, on Mars.)
- More hex maps (HEX.md *Not yet*: advanced, add-on, BGA layouts) go in the same group as they are made. Seven
  advanced maps are in the hex group now, and the open group (HEX.md *Open ground*) spreads its planets
  out with blank tiles; Regolith plays both.
- `regolith.test.ts` pins it: every Regolith map is hex and has a world.

## 3. Cards: data

Done (23 October 2026). Regolith's cards have their own data file, so the deck can move away from Community
one card at a time and `data/cards.yaml` stays the Community Edition record.

```
data/
  cards.yaml          Community and Classic, as now
  regolith.yaml       Regolith's decks: Skills, Tactics, and the Expansion card (Reinforcements)
packages/engine/src/regolith/
  cards.json          built by scripts/build-data.mjs, in the mode's folder so it stays the mode's own
```

**Choosing names and art.** [card-ideas.yaml](card-ideas.yaml) holds three name candidates and three
screenprint art briefs for every card; `npm run regolith:picks` builds them into the
[Regolith Card Picks](https://claude.ai/artifact/TMRLCRjR8BTSeGU8NrDWA1) page, where each card keeps its
name, takes a candidate or a name typed in, and gets an art brief and a note. The picks are saved with the
page; settled ones go into `regolith.yaml`.

**The first version is renamed copies.** Every Community card appears once, under the name picked on that
page (all but Sabotage were renamed), with the same category and count, its text in Regolith's words, and
`effect` pointing at the Community card's rule (`effect: agile`). The game plays exactly as before, from
its own deck. Ingenious ("conquer from the corners") is left out, as hex tiles have no corners.

Each card is a `CardDef` with the fields cards already have (`id`, `name`, `subtitle`, `text`,
`category`, `count`, `notes`, `effect`), plus `art` (the brief its screenprint card is drawn from) and:

- **`from`**: the Community card it started as. It stays when the card changes, so the Art Lab can show
  the lineage (as `classic` does for Community cards) and it is clear how far each card has moved.
- **`status`**: how far it has moved, replacing `ce_status` for this file:
  `community` (as the copy), `renamed` (new name and words, same action), `reworked` (action changed:
  a new `effect`), `new` (no Community ancestor, no `from`).

Ids are prefixed (`r-`) so they never collide with Community's or Classic's (`o-`).
[build-data.mjs](../../scripts/build-data.mjs) checks the ids, that `from` is a Community card, that
`status` agrees with `from`, `name` and `effect`, and that a card with its ancestor's action keeps its
category; `data.test.ts` checks every `effect` is one the engine has.

The mode's folder imports its `cards.json` (`REGOLITH_DECKS`); nothing else in the engine names it. The
engine learns its cards from the rule set: `defineRuleSets` (rules.ts) adds each mode's own decks to the
cards `card()` and `ALL_CARDS` know (`addCards`, data.ts), and `CardRules.expansion` names the mode's own
Expansion card (`expansionCard(state)`, which the market and card flights ask).

## 4. Cards: rules

- `regolithMode()` sets `cards` to Regolith's decks, with Community's market settings (starting draft,
  peek, expansion pile, no refresh). `REGOLITH_CARDS` still switches cards off. `terms` names the decks.
  Done (23 October 2026).
- **No card is named by id in the rules.** Effects are found by `effectOf`, and the card held by
  `skillCard` (Ambitious discarded itself by the literal id `'ambitious'` until the Regolith deck showed it).
- **Renamed cards** need no rules work: the engine resolves a card through `effectOf`, and the AI values
  cards by effect ([cardValues.ts](../../packages/ai/src/cardValues.ts)).
- **Reworked and new cards** need new rules. Where an effect can be written as a hook, it goes in
  `packages/engine/src/regolith/cards/`, one file per effect, like
  [powers/](../../packages/engine/src/regolith/powers), so Community's rules can't change by accident. That
  needs a card-hook surface in the kit next to `ShipHooks` (PROTOTYPING.md §9 *Adding a New Hook*), built
  when the first reworked card needs it. An effect too tangled for a hook goes into the engine's effects
  like any card, registered in `IMPLEMENTED_EFFECTS`, and only Regolith's deck deals it.
- Each new effect needs an AI value in `cardValues.ts`, a rule test, and a ruling in
  [RULES.md](../RULES.md#rulings) for every question writing it settles.

## 5. Cards: art (screenprint)

Done (23 October 2026). The screenprint look is a second card renderer, not options on the first: layout,
palette and type differ throughout, and `cardSvg` stays as it is for Community and Classic. A face with
`look: 'screenprint'` goes to it; the rule set says which look its decks have (`CardRules.look`).

```
packages/art/src/screenprint/
  inks.ts     paper, night paper, key ink, bone; oxide, ice and dust plates; amber; habitat green, crystal violet
  mechs.ts    the six mechs as rigs: the Silhouettes board's parts, cut at their joints, with their depths
  pose.ts     a mech posed (joint angles, lean, aim), stood on its lowest foot, turned in 3D, plated
  kit.ts      the stage (sky, each world's ground), the tiles' buildings and small things, crews, effects
  card.ts     screenprintCardSvg(face), screenprintBackSvg(deck): the face and back layouts
  scenes.ts   one scene per Regolith card, keyed by card id, drawn from its art brief, with its caption
```

- **The real mechs.** Every mech on a card is one of the six from the Silhouettes board, part for part,
  rigged: each limb turns at its joints, a mech leans or aims, and stands on its lowest foot. Turned, it
  is drawn in 3D: every part is its outline pushed back through its depth (the hull's, or its limb's
  thickness), the mech turned about its upright axis, each limb and the hull drawn far to near; the
  parts' sides print one step lighter than the key ink, edged where a corner runs back. The same rig at
  large scale, cropped by the art window, makes the close-ups (a knee joint, a hull, a gun).
- **The map's buildings and ground.** The kit draws, side on, what the tiles have from above
  (regolith/base.ts): the habitat's great dome, greenhouses and solar panels; the refinery's tanks, flare
  stacks and pipework; the ice mine's rig, shed, silos and ice heap; the reactor's cooling tower and
  radiators; the sinkhole's crystals; landing pads, containers, dishes, rovers, crates, beacons, an old
  probe. Each objective prints in its tile's own colour as a spot ink. Each scene stands on one world:
  Phobos grey and cratered, Deimos dusty and streaked, Mars rust with dunes and dust devils' tracks; on the
  moons Mars hangs in the sky, on Mars the two moons do.
- **Printed matter.** Every part prints in passes: a colour plate a little off register, the key ink, the
  amber accent, the spot. Halftone for shade, no gradients.
- **Same card contract.** It takes the same `CardFace`, `Measure` and fonts (Inter Black for the name,
  Saira Stencil One for stencilled lettering in the scenes, Barlow Condensed, JetBrains Mono), so the Art Lab, exports and print sheets take it unchanged.
  Size, bleed, safe zone and corner are the poker card's (GRAPHICS.md *Cards*).
- **Decks tell apart as the Vocabulary board does:** the permanent deck on paper in key ink, the one-shot
  decks on night paper in bone. The category sets the colour plate (rule, name shadow, mech plates).
- **The footer** shows the copies (`×2`) on the left and the card's place in its deck on the right. The colour band under the scene shows the category; the paper tells the deck.
- **Tests** (art.test.ts): every Regolith card has a scene and no scene lacks a card, every card and back
  draws without bad numbers or broken references, no two scenes are the same, every mech poses both ways.
- Still to do: rules readouts (action chips, combat dice) redrawn as flat inks, where a card shows one.

## 6. Web

- The lobby's mode menu lists Regolith where Prototyping was (it comes from `MODES`), with the hex maps. Done.
- [apps/web/src/art/cards.ts](../../apps/web/src/art/cards.ts): `DECKS` gains each mode's own decks from
  its rule set (`edition` is the mode's id), and `faceOf` finds their faces. A card draws the picture of
  the card it is `from` (`CardFace.scene`) until it has its own. The game shows the cards of the mode it
  plays. Done (23 October 2026).
- On-screen cards (`cardImages`) render through the deck's renderer, so a Regolith game's market, hand,
  card viewer and deck piles show screenprint cards and backs. Done. The game's own card frames (Card.tsx,
  the starting-skill draft) are still the holo cards' HTML, with the screenprint art in their band.
- Art Lab (`#lab/cards`): a Regolith edition (done), each card's note naming the Community card it is
  `from`, its `status` and its art brief; print exports pick it by edition, so a print run is a whole
  Regolith deck. Still to do: each card beside its Community card, as the Redesigns view pairs them.
- The rulebook and in-game help name the mode's cards as `terms` says. The field-manual style
  (CardStyles D) suits the help and reference cards rather than the deck faces.
- The player aid gets a Regolith version later: the mech die faces and the mode's rules on one sheet.

## 7. Words

The names, words and story are kept in one place, [REGOLITH-WORLD.md](REGOLITH-WORLD.md): the six mechs
(Breacher, Behemoth, Tactician, Chameleon, Sniper, Wisp), the objectives (Habitat, Refinery, Ice Mine, Reactor,
Sinkhole), the sides, and how each Quantum term reads in Regolith.

The game says them everywhere (22 October 2026): `RuleSet.words` (engine `words.ts`) is the mode's
vocabulary, REGOLITH-WORLD.md's table as `REGOLITH_WORDS` (`regolith/words.ts`), and `reword` / `say`
put a text in it, with its case and article ("a planet" → "an objective") and with players' names kept.
The engine, its log and the card data stay in Quantum's words; the web app rewords what it shows: the
log and toasts (`logText`), hints, rule errors, cards (`CardView`, through `useSay` from GameScreen),
modals, tips, and the ship, planet and player panels. A new string in the game UI goes through `say` too.
A card renamed in its own deck can say the words itself; the rewording leaves them as they are.

## 8. Testing

- `regolith.test.ts`: the mode deals only Regolith's cards and plays only hex maps, and still can't
  change Basic, Classic or Community.
- While every card is a copy, a Regolith game plays move for move the same as one on Community's deck
  with the same seed; a test can hold that until the first card is reworked.
- The golden games are refreshed whenever a card's action changes.
- [card-audit.ts](../../scripts/card-audit.ts) and [selfplay-cards.ts](../../scripts/selfplay-cards.ts) run on
  Regolith's deck; results go in PROTOTYPING.md §8 like the other playtests.
- The legal-move cross-check in `consistency.test.ts` plays a Regolith game.

## 9. Order of work

1. **Rename and hex only.** *Done (22–23 October 2026):* the lobby and game say Regolith, the id and
   folder are renamed (§1), the mode plays hex maps only, each with its world (§2), and its ships carry the
   mech names, which the engine and web app take from the game's rules.
2. **Own deck.** *Done (23 October 2026):* `data/regolith.yaml` with the names picked on the Card Picks
   page, the build step, `regolithMode()` dealing it, `DECKS` and the Art Lab listing it, drawn with
   today's `cardSvg` and the Community pictures for now. The game plays as before, from its own deck.
3. **Screenprint renderer.** *Done (23 October 2026):* inks, plates, the card layout and backs. Market,
   viewer, Art Lab and print exports use it.
4. **Screenprint kit.** *Done (23 October 2026):* the six mechs rigged from the Silhouettes board, the
   tiles' buildings and small things, crews, each world's ground, and a scene for every card.
5. **Moving away, card by card.** Renames with the new words and their own scenes, then reworked and new
   actions, with the card-hook surface built for the first one. Playtest and AI self-play as they land.
6. **Words and aid.** A Regolith player aid and rulebook pages (the mode-wide vocabulary is done, §7).

Steps 1–4 need no card designed.

## Open decisions

- **Deck names** in the theme (the permanent and the one-shot deck), and whether the Expansion card stays.
- **Deck size:** Community's (35 Skills, 9 Tactics), or smaller as cards are reworked.
- **One look for map and cards:** the cards now share the tiles' buildings, colours and worlds, drawn
  flat; whether the tiles and dice move further towards the screenprint inks (CardScale's warning) is open.
- **Binary Reach:** the one square drift map, in `drift-square` and played by no mode: give it to Community, or drop it.
