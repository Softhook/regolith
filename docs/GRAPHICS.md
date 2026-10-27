# Graphics & Print Plan

How we make the in-game graphics better **and** turn the same drawings into print-ready cards,
tiles and boards. This expands M6 in [ROADMAP.md](ROADMAP.md).

The rule behind every decision below: **one drawing, two outputs.** A planet, a tile, a card face
is drawn by one component. The web app shows it on screen; a print script renders it to PDF/PNG
at physical size. Nothing is drawn twice, so the printed game and the online game can't drift apart.

---

## Where we are today

| Element | How it's drawn | Printed? |
|---|---|---|
| Map tiles, void, planets | `tileSvg` / `planet` / `starfield` in [`packages/art`](../packages/art), in mm and seeded. The game draws a map in layers (see *Tiles*): each tile's raster layers (`rasterLayerSvg`) drawn once to images kept in IndexedDB ([`tileImages.ts`](../apps/web/src/art/tileImages.ts)), the spaces and labels live ([`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx)) | Yes, from the Art Lab (`#lab`) |
| Cards | `cardSvg` / `cardBackSvg` ([`card.ts`](../packages/art/src/card.ts)): poker size, SVG text, one illustration per card. The game's card pop-ups show the same drawing as an image ([`cardImages.ts`](../apps/web/src/art/cardImages.ts)); market cards are HTML with a band of the illustration, the same colours and icons, and the printed backs on the decks | Yes, from `#lab/cards` |
| Player aid | `playerAidSvg` ([`aid.ts`](../packages/art/src/aid.ts)), A6 | Yes, from `#lab/aid` |
| Map setup sheets | `mapSheetSvg` ([`mapSheet.ts`](../packages/art/src/mapSheet.ts)), 180 × 120 mm, one per map: which tile goes where | Yes, from `#lab/maps` |
| Warp gates, spaces, planet numbers and cube slots | SVG in [`board/BoardArt.tsx`](../apps/web/src/components/board/BoardArt.tsx), in screen pixels | Gates no (a token in the physical game); numbers and cube slots are in the printed tiles |
| Dice / ships | CSS 3D cube ([`Die3D.tsx`](../apps/web/src/components/Die3D.tsx)) | No, and doesn't need to be (physical dice) |
| Explosions, highlights, hit areas | HTML/CSS overlay (`board-layer`) | Never printed, correctly kept separate |
| Fonts | Google Fonts CDN (Inter, Orbitron); cards embed them in each SVG as data URLs | Not self-hosted yet |

The board keeps the **art layer** (tile images and SVG) apart from the **interactive HTML layer**.

---

## 1. The architecture

```
data/cards.yaml  data/maps.yaml  data/art.yaml (new: seeds, palettes, art credits)
        │               │               │
        └───────────────┴───────┬───────┘
                                ▼
                     packages/art  (new)
       plain functions → SVG markup, physical units, seeded, no DOM measuring
       Starfield · Nebula · Planet · Tile · VoidTile · Gate · CardFace · CardBack
       ShipIcon · CategoryIcon · PlayerBoard · tokens (palette, type, sizes)
                                │
            ┌───────────────────┼─────────────────────┐
            ▼                   ▼                     ▼
       apps/web (game)    apps/web /lab (Art Lab)   scripts/print.ts
       scales art to      explore seeds & params,   Playwright → PDF / PNG
       screen, adds UI    export SVG/PNG, pin       sheets with bleed &
       layer on top       seeds into art.yaml       crop marks
```

### `packages/art` rules

1. **Author in millimetres.** Every component has a fixed `viewBox` in mm (a card is
   `0 0 69.5 94.9` including bleed; a tile is `0 0 T T`). The screen scales it with CSS; print
   renders it 1:1. Stroke widths, blur radii and font sizes are in mm too, so a planet looks the
   same at 40 px and at 600 dpi.
2. **No browser measuring, no app state.** Options in, SVG text out: plain TypeScript functions, no
   React. The same call runs in Node (print scripts, tests) and in the browser. The game shows the
   result as an `<image>` (a `data:` URL), so the browser rasterises each tile's noise filters once
   instead of on every repaint; that is also the "baked" mode §4 needs. Cards wrap their text with a
   `measure` function the caller passes in (the browser measures with its fonts; Node estimates).
3. **Deterministic.** Anything random (star positions, planet surface, nebula shape) comes from a
   seeded RNG keyed by a stable string, e.g. `planet:<mapId>:<planetId>` or `card:<cardId>`. The
   same planet looks identical in every game, in the lab and in print. (A small hash + mulberry32
   inside `packages/art`; it must not share the engine's game RNG.)
4. **Scoped ids.** Gradients, filters, clip paths and patterns get ids from a prefix option
   (the tile id by default) so any number of drawings can share a page.
5. **Design tokens in one place.** `packages/art/src/tokens.ts` holds the palette, planet colours,
   card categories, fonts and physical sizes; `icons.ts` the icon set. The game imports what it shares
   with print (category colours and icons on its cards) rather than copying it. Still separate: the
   game's player colours (Lobby) and the rest of its CSS palette.
6. **Art vs. chrome.** Things that only exist on screen (highlights, hover rings, explosions, the 3D
   dice, the animated gate spin) stay in `apps/web`. If it could be printed, it lives in `packages/art`.

---

## 2. Visual upgrades (in-game and print)

All of these are built as `packages/art` components with parameters, so the Art Lab can explore them.

### Starfields

Layered, seeded, vector:

- **Far stars**: hundreds of tiny circles, size and brightness drawn from a power-law distribution
  (lots of faint stars, a few bright ones), slight colour temperature variation (blue-white to amber).
- **Near stars**: a handful of bright stars with a soft glow (no diffraction spikes).
- **Nebula**: soft colour clouds. Two techniques:
  - *Vector*: a few large blurred blobs (`feGaussianBlur` on ellipses/paths) in the palette's
    colours. Cheap, predictable, prints well.
  - *Noise*: `feTurbulence` + `feColorMatrix` + masks for wispy texture. Much richer, but slow to
    render live and rasterised when printed (see §4). Use it for backgrounds that are baked once.
- **Dust lanes / dark clouds**: negative masks cutting into the nebula for depth.

Uses: tile backgrounds (each tile gets its own seed so the board doesn't look tiled), card backs,
card art backdrops, box art, the app background (replacing the CSS star pattern).

### Planets

A `Planet` component with seeded parameters:

| Layer | Notes |
|---|---|
| Base sphere | Radial gradient, light from a fixed direction (same on every planet and card) |
| Surface | Type-dependent: banded gas giant (stretched turbulence), rocky (craters as shaded circles), ice (pale, cracked lines), lava (dark with glowing fissures), ocean/continent (thresholded noise) |
| Terminator shadow | Offset circle mask to give a crescent of night side |
| Atmosphere | Thin outer glow ring with the planet's colour |
| Rings / moons | Optional, seeded |
| Gameplay overlay | Planet number and cube pads: drawn **on top** and kept high-contrast so the game stays readable (layout in §2a) |

**The planet carries the number.** Each number is its own kind of world in its own colours, distinct
in hue *and* lightness (`PLANET_FAMILY` in tokens):

| Number | World | Colours |
|---|---|---|
| 7 | Earth-like: blue sea (sometimes turquoise shallows) and green land (temperate, jungle, tundra, swamp or steppe) laid out as continents, islands, one supercontinent or land with lakes; clear, scattered, streaky or heavy cloud; sometimes polar caps | green and blue |
| 8 | Gas giants (Jupiter-gold, Saturn-cream, amber, rust, copper, striped or khaki): belts that are smooth, banded, fine, turbulent, wavy or in crisp zones, or no belts at all: seen from a pole (soft, foreshortened belts around Saturn's hexagon or a cluster of cyclones), marbled swirls or convection cells. About one in three is tipped steeply, so its belts, storms and rings run at a slant. Often a great storm, a string of small white storms, or rings | gold and amber |
| 9 | Ice: white, frost, turquoise or blue ice, cracked, criss-crossed with long lines, striped, broken into floes or cratered; pale cyan, turquoise or blue ice giants, smooth or banded, with polar hoods and cloud streaks | pale, tinted cyan to blue (lightest) |
| 10 | Molten lava worlds: black basalt, dark red or ash crust; red, orange or yellow magma as thin cracks, wide rivers, fine veins or lakes; sometimes glowing vents | black and red (darkest) |

Hues vary a fair way around each family's colour, and about one planet in three takes an off-type colour instead (rose or teal gas giants, mint or lilac ice, green, cyan or violet magma, crimson or violet vegetation; `EXOTIC_HUES` in `planet.ts`). Each number keeps its lightness, so the 9 is still the palest and the 10 the darkest. The number also sets the **size**, in big
steps (7: 24.2 mm up to 10: 46.2 mm, nearly twice as wide). So a planet's number reads from its look,
its size and the numeral, which also helps colour-blind players. Within a number, the seed picks the
variant and surface, so every planet is distinct.

**Every physical planet is unique.** A set that plays every map in `maps.yaml` needs 30 tiles (see
§2a), so we design 30 individual tiles: each tile has a fixed id (`p7-01` … `p10-05`, `void` … `void-3`), a
pinned seed and look in `art.yaml`, and optionally a name printed small on the tile. The game assigns
a map's planets to tile ids, so the planet on screen is the same one as on the table.

### Tiles

- `Tile` = star background + 3×3 space grid + planet in the centre (or none for an empty tile).
- `VoidTile` = its own look (distorted, darker, violet), as the current gradient suggests.
- Print adds a tile back and corners matched to the die-cut.
- On screen, the whole map renders in a single SVG, with the interactive HTML layer above, drawn in
  layers ([`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx)) so a planet can sit anywhere
  on its tile (docs/HEX.md, *Off-centre planets*), on square and hex maps alike:
  1. **Sky:** each tile's starfield and nebula (`rasterLayerSvg` `sky`), bright stars in the gutters between that
     shape's spaces, cut to the tile's outline (rounded squares a little apart, or 7-hex flowers).
  2. **Body:** the planet and moons, or a Void's heart (`body`), placed on the planet's space and cut
     off at its own tile's edge. Then the dark seams between hex tiles.
  3. **Spaces:** a well per space, as printed (`well`, `WELL`), from the board rather than the tile:
     hatched where it orbits a planet, cross-hatched where two orbits overlap, a faint flask on a Void's
     ([`layers.ts`](../apps/web/src/components/board/layers.ts) `spaceRoles`).
  4. **Labels:** a planet's flavour label beside it where there's room (`tileLabel`, `labelFits`).
  5. **Live:** the number, in the corner its printed tile has it (`numberCorner`, see *Cube pads and
     number*), and the cube slots, from the printed geometry (`numberPlacement`, `cubePadCentres`,
     `CUBE_PAD`). Then gates, ships and highlights.

  A printed tile (`tileSvg`) is the same layers in one piece, so the screen and the table look alike.
  The Art Lab shows the set as hex tiles too, and with each planet on any space (`look`, `planetAt`).
- **Looks.** A tile has one of five looks (`TileLook`, [`tile/look.ts`](../packages/art/src/tile/look.ts)):
  `square` or `hex` in space, or a hex tile on a world's ground, `phobos`, `deimos` or `mars` (the Regolith look,
  [`regolith/`](../packages/art/src/regolith/)), with a building on its planet's space in place of the
  sky and body. Print, the Art Lab and the map all take the same look: a hex map is on its world's ground
  unless the top bar switches it to space ([`mapLook.ts`](../apps/web/src/art/mapLook.ts) `useMapLook`).
  Print draws the lit ground as a bitmap first (`tileGroundSvg`), since its light falls into contour lines
  at a print's resolution.
- **Layers.** Each look stacks its tile in one order (`tileLayerNames`): in space `sky`, `body`, `label`,
  `spaces`, `planet`; on the ground `ground` (with the building), `spaces`, `standing` (what stands on the
  ground again, so the wells are etched into the ground and not across the buildings), `planet`. A tile's
  `tileLayers` are what it has of those. Everything draws from that one order: print joins them (`tileSvg`);
  the Illustrator export (`editableTileSvg`) puts the layers up to the last one drawn with filters
  (`isRaster`) in its bitmap (`tileSvg` with `raster`) and the rest over it as vectors; and the map
  ([`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx)) stacks the same layers in the same
  order (`mapStack`), each run of filtered ones as one clipped group of images per tile.

  The map shares the order, not the drawings. Its images are each raster layer drawn alone
  (`rasterLayerSvg`, over its `RASTER_AREA`; what stands is cut out of the ground's image with `standingMaskSvg`),
  made to serve wherever the map puts the planet: the sky keeps its bright stars
  between all the spaces (print keeps them off the planet, its number and label), and the body is drawn
  centred for the map to move. Its spaces and labels come from the board, not the tile, since an orbit can
  reach onto the next tile, and its numbers and cubes are live (BoardArt).
- **Where the code is.** [`tile/`](../packages/art/src/tile/): `geometry` (spaces, planet spots, number
  and cube pads, the hex flower and its cut), `look`, `set` (the 30 tiles and the hex set's 10 blanks, and their seeds), `markings`
  (wells, hatching), `label`, `space` (sky, planet, moons), `voids` (the Void hearts) and `index`, which
  puts a tile together in its look. The ground's own parts are in `regolith/` (its `index.ts` lists them).
- **Loading.** Drawing a tile's noise filters takes ~45 ms, so the game draws each tile's sky (one per
  shape) and body once to images 768 px across (576 px on touch screens, to save memory) and keeps them
  in the browser's IndexedDB ([`tileImages.ts`](../apps/web/src/art/tileImages.ts)), whatever the map and wherever its planet sits.
  Bodies and square skies are drawn in the background while the lobby is open; later games and window
  resizes reuse the stored images. Each stored image carries a hash of its SVG, so changing the artwork
  redraws only what changed.

**Star backgrounds per tile.** Each of the 30 tiles gets its own seeded starfield and nebula, so a
map never looks like a repeated pattern. Nebula colours are random but kept between blue and pink-purple
(`NEBULA_HUES`, 215–330°) so the set looks consistent (blue clouds are lifted, since blue looks darker), with pale bright cores where each cloud is densest for depth on most tiles (about 40% stay quiet, without them), and kept **behind the planet**, so the sky stays in the background and the planet's colour is what tells tiles apart. (The
Void tiles keep a stronger magenta nebula around their centrepiece.) Because tiles are rearranged for every map, backgrounds
can't line up across edges; instead every tile follows the same edge rules so any two tiles sit
together cleanly:

- the nebula fades towards the tile edge into one shared base colour (no cloud cut off at the seam);
- star density and brightness are the same near every edge;
- the brightest features (big stars, nebula cores) sit in the gutters and corners, not in the middle
  of a space, so the grid stays readable and dice don't hide the best bits;
- the planet gets a soft dark halo so it stands out from any background.

**Planet lighting.** Each planet is lit like a film shot: a hard terminator between day and night, its
atmosphere glowing along the lit edge (inside the disc and just past it), and a back light in a
contrasting colour on the far edge (cool behind the 9s and 10s, warm behind the 7s and 8s). The
atmosphere depends on the kind of world (`air` in `planet.ts`): ocean worlds have a blue sky whatever
their colour, gas giants a thick soft one in their own colour, lava worlds a wide smoky orange glow, and
ice worlds little or none, so a sharp edge. Ocean worlds also catch a sun glint on the water (not the land).

**The Void** tiles each have their own centrepiece, in set order: `void` a black hole (a hot disc seen
nearly edge on, brighter on the side spinning toward the viewer, its far side bent over the top of the
shadow and fainter under it, a thin bright ring round the shadow), `void-2` the violet rift, and
`void-3` a supernova (a white-blue star with light spikes in a teal haze, inside a shell of red and
orange filaments). A map with one Void always shows the black hole.

---

## 2a. Physical tile and planet geometry

Designed for **19 mm dice**. All numbers live in tokens so they can change after a physical test.

| Measure | Value | Why |
|---|---|---|
| Die | 19 mm | Chosen dice |
| Cell (space) | **32 mm** | Die + 6.5 mm each side: 13 mm between neighbouring dice, enough for fingers; ≈ 1.7× die |
| Space pad | 24 mm rounded square, centred, drawn as a well etched into the tile (shaded top and left inner edges, lit bottom and right) | Shows where a die sits; 2.5 mm clear around the die |
| Attack outline | Faint dashed corner brackets around the four spaces beside the planet | Where dice go to conquer it |
| Tile (trim) | **96 × 96 mm** (3 × 3 cells) | |
| Bleed | 3 mm → 102 × 102 mm artwork | |
| Corner radius | 2 mm | Kind to die-cutting; the small gap where four tiles meet doesn't matter |
| Cube | **assumed ≤ 10 mm** (measure ours) | Standard wooden cubes are 8 or 10 mm; pads are sized for 10 |
| Planet diameter | 7: 24.2 mm · 8: 30.8 mm · 9: 38.5 mm · 10: 46.2 mm | Big steps so size alone tells numbers apart; bigger than the cell is fine (below) |
| Cube pad | 11 mm square well, 1.5 mm apart | 10 mm cube + tolerance |
| Planet number | **14 mm** type (12.5 mm for "10"), white with a dark outline, no disc | Where the spaces meet at the planet's bottom right; large and never covered by cubes or dice |
| Flavour label | 1.7 mm name, 1.2 mm monospace lines, inside the 8 mm strip between space pads | Where the spaces meet at the planet's top left; made-up survey data, not meant to be read in play |

**Why the planet can be bigger than its cell.** Ships can't enter a planet's space, so only the dice
in the eight surrounding spaces limit its size. A die in the space next to the planet starts
32/2 + 6.5 = 22.5 mm from the planet's centre; a diagonal die's nearest corner is ~31.8 mm away. A
planet under 45 mm keeps clear of the nearest die; the 46.2 mm 10 (radius 23.1 mm) reaches 0.6 mm under
it, which is fine for a die resting on the tile. The 9 and 10 can't go below
33.2 mm, or their cube pads would stick out past the planet's edge.

**Cube pads and number.** Cube pads (capacity 7→1, 8→2, 9→3, 10→4) form a cluster centred on the
planet. The number is centred on the **corner where the four spaces meet at the planet's bottom
right** (16 mm right and down from the centre), white with a dark outline so it reads on any surface.
Dice never reach that corner, so it is the one place a big numeral is always visible. The 10's four
pads reach into it, so its number moves 1.2 mm further out along the same diagonal
(`numberPlacement()`; a test keeps every number on the diagonal). On a hex tile the number goes where
three hexes meet instead, the vertex a third of a space right of the planet's centre and half a space
down, moved out the same way when the pads reach it.

A planet off the middle of its tile (docs/HEX.md, *Off-centre planets*) takes its number to the corner
nearest the tile's middle (`numberCorner`): the bottom left for a planet on the right edge, the top left
for one in the bottom right corner, and so on; where two corners are as near, the bottom right. The
number then always stays on its own tile, away from the tile's edge and from any planet on the next
tile, wherever the tile lies on a map, so the printed tile and the screen agree.

**Flavour label.** The opposite corner, at the planet's top left, holds a tiny star-atlas label: a
made-up name, catalogue number, class and orbit, and a few measurements to suit the kind of world
(`planetFlavour()`), with a thin leader line to the planet. It stays inside the strip between the
space pads above and below, and no stars are drawn under it. A planet off the middle keeps its label
only where that strip is on its tile and its number isn't there (`tileLabelFits`); hex tiles have no
such strip, so no label. On the 10, whose planet reaches into
that strip, the label moves left to clear it. It is seeded like the art, so each tile
always gets the same text. On the Illustrator export it is baked into the 600 dpi `art` layer while the planet number and cube pads stay editable vectors in `markings`.

```
  NAME ·                 NAME ·              NAME ·              NAME ·
  data  ╲                data ╲              data ╲              data ╲
         ╭───╮               ╭─────╮           ╭───────╮          ╭─────────╮
         │[ ]│              │[ ] [ ]│         │ [ ] [ ] │        │ [ ] [ ]  │
         ╰───╯               ╰─────╯          │   [ ]   │        │ [ ] [ ]  │
               7                     8         ╰───────╯          ╰─────────╯
                                                         9                    10
       7: 24.2 mm             8: 30.8 mm        9: 38.5 mm         10: 46.2 mm
```

A test checks every number's box against the cube pads and against 19 mm dice in the spaces beside,
below and diagonal to the planet.

Printed pads are visible outlines, so a planet's capacity is clear on the
table without remembering the rule. The pad area keeps a calm, darker surface so cubes in any player
colour stand out.

**Start markers.** Maps mark some planets as starting planets (`7*` etc.). Rather than printing extra
"start" versions of tiles, use separate start tokens (up to 5 per map) placed on the planet during
setup. This keeps the set at 30 tiles.

**The tile set.** The most of each planet any map in `maps.yaml` uses at once:

| Tile | Count |
|---|---|
| Planet 7 | 8 |
| Planet 8 | 8 |
| Planet 9 | 6 |
| Planet 10 | 5 |
| Void | 3 |
| **Total** | **30** |

The 2–4 player maps need only four 9s and four 10s; Anecdotal (six 9s) and False Dilemma (five 10s)
need the rest; the "Everything" map uses 25. Empty tile slots (`.` in the layouts) are gaps in the map, not
tiles.

The hex set (`HEX_TILE_SET`) adds 10 **blank** tiles, `blank-01` … `blank-10`: open ground, with no planet
and no Void, which only the open-ground hex maps use (Arcadia Planitia and Valles Marineris have 10 each).
No square map has one, so the square set stays at 30. On a world's ground a blank is bare ground with nothing
built on it; in space, sky alone.

**Sheets.** A 102 mm tile with bleed fits **2 × 2 per A4 page** (204 mm of 210 mm
width), so print-and-play is 8 pages of faces. Print-on-demand vendors get one 102 × 102 mm file per
tile.

### Cards

Built: `cardSvg` / `cardBackSvg` in [`packages/art/src/card.ts`](../packages/art/src/card.ts), shown and
exported in the Art Lab (`#lab/cards`). The lab groups cards by lineage, from each Community card's
`classic` in `data/cards.yaml`. It shows the redesigns side by side with the 2013 card they come from
(reworded: same rules; reworked: rules changed; renamed: the same idea under a new name), then Community originals, Classic-only cards, and
the backs. The print set is still picked by edition, so a print run is always a whole deck.

- **Size**: poker, 63.5 × 88.9 mm, 3 mm bleed (69.5 × 94.9 mm), 3 mm corner, 3.5 mm safe zone.
- **Two looks by deck**: permanent cards (CE Skills, Classic Commands) are light; one-shot cards
  (Tactics, Gambits, Expansion) are dark. Every card runs its art to the top and side edges. The decks
  tell apart across the table and face down, like the physical game's light and dark decks.
- **Face**: illustration (top ~half), HUD label with the category and ×copies, a category emblem
  straddling art and panel, name (Orbitron), subtitle, rules text with game terms in bold, one small tag in
  the bottom-right corner inside the safe area: `7/35 C`, position in the deck then the set (`C` community, `Q` classic).
- **Colour = category** (movement cyan, action amber, combat red, conquer green, research purple,
  ship blue, cards orange, expansion teal). Every card has a `category` in `data/cards.yaml` (Tactics
  and Gambits take their effect's); hues and labels are `CARD_CATEGORIES` in tokens.ts, icons
  `ICONS` in icons.ts. The game's on-screen cards use the same accent colours (`cardPalette`) and
  icons, so a card looks the same colour on screen and in print.
- **Illustration = one scene per card**, showing what the card does: Agile's ship flies a fourth,
  glowing space; Brutal rolls two combat dice and strikes out the higher; Sabotage shorts out one of
  an opponent's action chips. Scenes live in `packages/art/src/scenes/` (skills, tactics + expansion,
  original), keyed by card id; each has a one-line caption the Art Lab shows under the card. Original
  cards that do the same as a CE card get a different picture of the same idea. A test checks that
  every card has a scene and no two draw the same.
- **One drawing kit** (`packages/art/src/kit/`: ships, board, hud, effects, props) keeps the set consistent: ships are isometric dice with real pip
  layouts, cubes are plain dice, the board is an isometric holo-grid the dice stand on, planets and
  skies come from the tile generators. Rules quantities are flat HUD readouts over the scene, always
  drawn the same way: research (purple) and dominance (red-orange) tracks, hexagonal action chips
  (always yellow, `ACTION_HUE`, with the bolt, whatever the card's colour; a hexagon means an action and
  nothing else, so other badges are round), the dominance crest (`crest`: the crown on a red-orange medallion; never a cube or die), a cube only
  ever a player's cube on a planet (counters on cards are grey `token`s),
  combat dice (black to attack, white to defend, as in the game; `COMBAT_DICE`), the red missile
  (`missile`, also drawn in the manual and the game), small cards. Numbers in the art are numerals only (`+1`, `×2`, `−2`), so the
  art needs no translation.
- **Text is SVG**, not HTML as first planned, so one file per card goes to PNG/ZIP and to print
  services. Wrapping uses widths measured with the page's fonts (canvas `measureText`), and the same
  fonts are embedded in each SVG as data URLs, so the layout matches what was measured. Text shrinks in
  0.1 mm steps until it fits. Without the fonts (offline), cards fall back to system fonts.
- **Exports**: the Art Lab's standard print exports (§4, In the Art Lab), with a folder per deck and
  its back in the ZIP, and print sheets optionally with all copies and duplex backs.

### Player aid

Built: `playerAidSvg` in [`packages/art/src/aid.ts`](../packages/art/src/aid.ts), shown and exported in the Art
Lab (`#lab/aid`).

- **Size**: A6 landscape, 148 × 105 mm, 3 mm bleed; print sheets put two on an A4 page ("All copies" prints four).
- **One board for every player**: a dim starfield for ground (the tiles' deep space, one fixed sky,
  veiled, faint stars kept off the text, bright stars only in the open), no boxes, one accent (the game's cyan) on the
  pips and ship details; the action chips are the cards' yellow hexagons with the bolt (`ACTION_HUE`).
  Hierarchy: the ship dice first, then the die pads, then the actions; rules are a line each.
- **Readable**: no text under `MIN_TEXT` (2 mm, about 6 pt); a test checks every size.
- **Cube rail**: down the left edge, seven pads (the most cubes any map gives) styled like the
  planets' 11 mm cube pads, spread over the full height; the win condition, "Place your last cube to
  win", runs up beside them.
- **Die pads**: dominance (left) and research (right), each the 24 mm of a tile's space pad, for the
  19 mm dice, with what moves the die and what happens at 6.
- **The turn**: "3 actions" with three action chips, each action with its cost in chips and one
  line of rules; then combat, missiles (Community; Classic shows defeat instead), the per-ship
  limit (one move, one ability a turn) and cards.
- **The fleet**: each ship on its die face (`shipDie` in
  [`kit/starships.ts`](../packages/art/src/kit/starships.ts)), with its power under it as one short
  phrase (the ability and what it does, on two lines, one size for all six). Each die is a hologram, dark glass with faint scan lines and a lit rim, the starship projected in
  the accent cyan (tinted hull, glowing outline), the pips as lit orbs, and the centre pip of 1, 3
  and 5 as the ship's core. The manual draws its ships the same way, in the player's colour.

### Card art

The art window takes either:

1. **Procedural art** from `packages/art` (planet, starfield, ship silhouettes), always available,
   good for prototypes and for "set" consistency; or
2. **An image** (commissioned or AI-assisted illustration), listed in `data/art.yaml` with source,
   author and licence. The build fails if an image is missing its licence entry.

Art image requirements: at least **300 dpi at final size including bleed**, better 600 dpi for
headroom. For a card art window filling the whole card with bleed (69.5 × 94.9 mm) that's
**≥ 821 × 1121 px**, ideally ~1650 × 2250 px. Keep originals in RGB, 16-bit PNG/TIFF where possible.

Regolith's cards have a renderer of their own, the screenprint cards (`packages/art/src/screenprint`,
[REGOLITH.md](regolith/REGOLITH.md) §5): flat inks and halftone, the six mechs rigged from the mood board's
Silhouettes board, and the map tiles' buildings drawn side on. A card face's `look` picks the renderer.

### Iconography

Replace text and pips with one icon set drawn on a 24-unit grid with mm-based stroke widths:
ships 1–6 (also for custom dice faces), actions, dominance, research, missile, cube, card categories.
These are the most reused pieces, so they come first.

---

## 3. The Art Lab (explore and export)

A dev-only route in the web app, e.g. `/#/lab`:

- Pick a component (Starfield, Planet, Tile, Card, Card back…), see it large.
- Sliders and pickers for its parameters (seed, palette, density, planet type, ring on/off…), with
  the URL holding the current settings so a look can be shared.
- A **grid view**: the same component with 24 seeds, to spot variety and pick favourites.
- **Context view**: the planet on a tile, on a card and at in-game size side by side, to check it
  stays readable small and stays good large.
- **Export buttons**: PNG at the piece's dpi (rasterise in the browser via canvas), and
  "Pin": writes the chosen seed/parameters into `data/art.yaml` (copy-paste YAML at first; a dev
  server endpoint later).
- **SVG for Illustrator**: the art is built from SVG filters (noise, displacement, colour ramps),
  which only browsers render; Illustrator drops them and also doesn't read `hsl()` colours. This export
  embeds the art as a 600 dpi PNG (layer `art`) with the markings on top as plain vectors (layer
  `markings`: hex colours, no `paint-order`), so it opens looking the same and the markings stay
  editable.
- **Print preview**: CMYK-ish soft-proof toggle (a rough simulation, see §4) and bleed/safe-zone
  overlay.

`data/art.yaml` (new) records the pinned choices:

```yaml
planets:            # keyed by map + planet, or by number for defaults
  default: { 7: { palette: green }, 8: { palette: gold }, 9: { palette: ice }, 10: { palette: magma } }
  overrides:
    - { map: alpha-sector, planet: p3, seed: 81723, type: gas, rings: true }
cards:
  agile: { art: procedural, seed: 4412 }
  brilliant: { art: images/cards/brilliant.png, author: "…", licence: "…", source: "…" }
backs:
  skill: { seed: 12 }
```

---

## 4. Print pipeline

### In the Art Lab (built)

Every printed piece goes through one module, `apps/web/src/print/`, so cards and tiles export the
same way:

- `pieces.ts` holds each piece's print spec (trim, bleed, sheet grid) and the file-name pattern:
  `cubic-<piece>-<name>[-bleed][-<dpi>dpi].<ext>` for one face, `cubic-<pieces>[-<part>][-bleed|-fogra39[-deep]].zip`
  for a set. A piece die-cut other than at its trim has a `cut` line: the **hex tile** (`hex-tile`, 96 ×
  96 mm trim round its flower, `HEX_TILE_CUT`, 18 sides). Its art is **knocked out** past the flower:
  at the cut at trim size, so the home print sheets show the shape to cut along with scissors, and past
  it by the bleed in files with bleed (`hexTileShape`), so a die cut that wanders still has art under
  it. The press sheets clip each tile to that shape (`outline`), so no neighbour's knocked-out corner
  covers its bleed. Every export for a press carries the cut line too: `cut.svg` in the PNG ZIP (the
  size of each PNG), a `CutContour` spot colour in the CMYK PDFs (overprinting, so it takes nothing out
  of the art; a print service cuts along it and doesn't print it), and a `cut` layer in the Illustrator
  SVG. The crop marks still frame each tile's box.
- `PrintPanel.tsx` is the export panel on every lab page: this face as a PNG (plus page extras such
  as SVG for Illustrator), the whole set as a ZIP of PNGs with a README, the CMYK export for the press
  (below), and print sheets. Everything uses the piece's `dpi`: 600 for cards and the aid (small text),
  300 for tiles. Exports refuse to run when the fonts didn't load, rather than print in system fonts.
  Every export button carries an RGB or CMYK tag (`Space`), so an RGB file (the PNGs, the print
  sheets, whose browser "Save as PDF" is RGB, the Illustrator SVG) is never taken for the press file.
  `useExport.ts` runs an export with its progress and error; the press test page uses it too.
- `press.ts` gets files ready for a press: PNGs are opaque RGB, tagged sRGB (an embedded ICC profile) and
  carry their dpi, so a RIP converts the colours as we see them and opens the file at its physical size.
  It writes the PNGs itself (`encodePng`) rather than take the canvas's, which in Safari carry their own
  sRGB and EXIF chunks that the profile would clash with. `toCmyk` converts to the press's CMYK through a table (`cmykTable.ts`, below).
  **Deep black** (a tick box beside every CMYK export, remembered across lab pages, off by default): the
  profile caps black ink at 94 %, so its darkest prints at L\* 11.7 and the space base at 13.7. With it ticked,
  everything at the space base or darker (by its brightest channel, so dark colours above keep theirs)
  prints as a full-black rich black, 90/70/35/100 at black to 80/65/42/100 at the base (L\* 9.0 to 9.5 by
  the profile's measured data, so the dust stays a step apart), fading back to the profile's conversion
  by twice the base's brightness; the nebulae and everything lighter are untouched. Within the 300 % ink
  limit. It overrides only the profile's choice of ink mix, not the press condition, so the PDFs still
  name FOGRA39, but the printer must print the CMYK as it is. Its files are tagged `-fogra39-deep`.
- **CMYK PDFs** (`pdf.ts`): made to the PDF/X-1a rules (PDF 1.3, CMYK only, no fonts or
  transparency, TrimBox and BleedBox, an output intent naming the registered FOGRA39 condition; a
  registered condition needs no embedded profile, which would add 1.4 MB to every file); only a
  preflight such as Acrobat's can certify it. Each face is a flattened CMYK image at the piece's
  `dpi`. A page too big for one canvas (the A4 press test at 600 dpi is 35 M px; iOS Safari stops at
  16.7 M) is drawn in bands that overlap by 17 mm, as far as the art's filters reach, so the bands match
  the whole drawing (`files.ts` `drawBands`; Chromium within 2/255, Firefox exactly, WebKit but for a
  few scattered pixels). Every card, tile and aid fits one canvas. Two shapes, by how the piece is printed:
  - **Cards: a file per card** ("CMYK PDFs · FOGRA39 · ZIP" button), for a print service that takes one PDF
    per card (Doxzoo asks for PDF/X-1a, Coated FOGRA39). A ZIP with a PDF per front, named like the
    PNGs (`skill/07-agile.pdf`), its back as page 2 (double-sided printing takes pages front, back);
    every page with its bleed and no crop marks. How many of each to order is in `order.csv` (a card's
    copies), not repeated pages. Upload with "Do not scale".
  - **Tiles and player aids: press sheets** ("CMYK Tiles + aids · PDF", the same button on both
    pages, `lab/pressSheets.ts`): they print together on the same stock, as one PDF of A4 sheets,
    `cubic-tiles-aids-a4-fogra39.pdf`. All 30 tiles (2 × 2 a page) then 4 aids (2 Community, 2
    Classic; 1 × 2 a page), in the print sheets' grid, butted so one cut serves two pieces. Each face
    is drawn with its bleed, so each block has its 3 mm bleed all round; faces go down in reading order,
    each cut at its left and top where a piece is there, so it covers the bleed of the piece before it
    and no seam can show between two. Crop marks start clear of the bleed. Single-sided, the set as it
    ships (not seeds being explored), with print markings.
  - **Hex tiles: press sheets** ("CMYK Hex tiles · PDF", on the tile page with Shape: Hex):
    `cubic-hex-tiles-a4-fogra39.pdf`, the 30 tiles as hex tiles with their planets in the middle, laid
    out as the square tiles are, with each flower's cut line.

  The tile page exports as shown otherwise (shape, planet spot, seeds and markings): a tile with its
  planet off the middle is named for its spot, `p7-01-ne`.

  The press test exports as a single CMYK PDF.
- `sheets.ts` lays out print sheets: pieces at trim size in a grid (cards 3 × 3, tiles 2 × 2, aid
  1 × 2), butted so one cut serves two pieces, crop marks drawn as borders so they print without
  "Background graphics", optional backs ("Backs (duplex)", off by default) mirrored for long-edge
  duplex, crop marks kept 4 mm in from the paper's edge, where home printers print. A4 or US Letter. The
  CMYK press sheets use the same layout (`pressPages`), always on A4.
- Bleed: on for exports meant for print services; the sheets are at trim size for home printing.

A new piece (player board, tokens) is a `PIECES` entry and a `Printable` per face.

### Headless rendering (planned)

`scripts/print.ts`, run with `npm run print -- <target>`:

1. Starts Vite (or uses a build) and opens a **print route** (`/#/print/<target>`) in Playwright
   Chromium. The print route lays out pages with the same `packages/art` components.
2. Waits for fonts and images (`document.fonts.ready`, image `decode()`).
3. Calls `page.pdf({ width, height, printBackground: true, preferCSSPageSize: true })` per output.
4. For PNG outputs (vendors that want one image per card), screenshots each element at the target
   dpi with `deviceScaleFactor`.

Because the print route is a normal page, it can be opened in a browser to check before printing.

### Outputs

| Target | What | Size |
|---|---|---|
| `cards-pod` | One PDF page (or PNG) per card face and back, with 3 mm bleed, no marks | 69.5 × 94.9 mm |
| `cards-pnp` | Print-and-play sheets, 3×3 cards, crop marks, duplex backs mirrored | A4 |
| `tiles` | Tiles and player aids on A4 press sheets, butted, crop marks (built as the CMYK PDF); hex tiles likewise, with their cut line | A4 |
| `tiles-pnp` | Tiles 2 × 2 per page with crop marks | A4 |
| `player-board` | Player board / reference sheet (the A6 player aid is built, §2 Player aid) | A4 or A5 |
| `proof` | Contact sheet of everything at reduced size, for review | A4 |

Card and tile **trim, bleed and safe zone** live in tokens, with the vendor's numbers once chosen
(MakePlayingCards, The Game Crafter, DriveThruCards differ slightly). Safe zone default: 3 mm inside
the trim.

Tile, planet and cube-pad sizes are in §2a.

### Things that behave differently in print

- **Filters are rasterised.** Chromium turns `feTurbulence`, `feGaussianBlur` and friends into
  bitmaps inside the PDF, at a resolution we don't fully control. For printed pieces, **bake heavy
  effects to images first**: render the background layer alone to PNG at 600 dpi, then place that
  image under the vector layers (planet numbers, grid, text, icons stay vector). The art components
  take a `mode: 'live' | 'baked'` prop for this.
- **The same trick helps in-game performance.** Rendering a turbulence nebula per tile every frame is
  slow; the game can bake each tile's background once into an image (cached by seed) and draw that.
- **Colour.** For a service that prints CMYK, we convert ourselves rather than leave it to their RIP,
  whose settings we can't see: the CMYK PDFs, for the press's profile (Coated FOGRA39 for Doxzoo). For one
  that wants RGB (most card printers), the PNGs, tagged sRGB. Ask the printer for the press (HP Indigo
  or toner, or offset), stock and finish, and ink limit. Dark space art needs care:
  - **Black point.** FOGRA39's darkest black is about L* 9 (L* 12 with the 300 % ink cap); below it
    everything prints as one flat black. The tiles sit at a median L* of 3.5, with the nebulae and wells
    in L* 2–15. A plain relative colorimetric conversion prints all of L* 0–5 (black up to the tiles'
    base colour) as the same black, so the art's darkest detail disappears; with black point
    compensation they stay apart (ISO Coated v2 300 %: black L* 11.8, the tiles' base 13.7, card ink
    14.5, the aid's pads 16.5). The CMYK table uses relative colorimetric with black point
    compensation. Expect dark pieces to print a deep navy-charcoal rather than the screen's near-black.
  - **The press profile and table.** The CMYK is made for ECI's ISO Coated v2 300 % (FOGRA39 with
    the ink capped at 300 %, safer for dark, full-bleed art on a digital press), in
    `scripts/press.icc` (from www.eci.org, unmodified; © Heidelberger Druckmaschinen, made
    for the ECI, who distribute it free of charge; their package has no separate licence file). It is
    only used to build the table: the PDFs name its condition (FOGRA39) and profile in their output
    intent rather than embed it, and the app doesn't ship it. `npm run print:cmyk-table -- --profile <file.icc>` swaps it (e.g. for the 330 %
    `ISOcoated_v2_eci.icc` if the printer wants it) and rebuilds `cmykTable.ts`: ImageMagick (LittleCMS)
    converts an 18³ grid of sRGB colours, and the export interpolates between grid points (ΔE ≈ 0.6 on
    average). The darkest areas print at about 290–300 % ink.
  - **Gamut.** Saturated violets, greens and blues lose half or more of their chroma in CMYK. Research
    moved from 268° to 290°: with ISO Coated v2 300 % that takes it from ΔE ≈ 27–30 to ≈ 37–39 from
    ship blue (about 50 and 65 on screen). Conquer green and expansion teal also print duller, but stay apart.
  - **Light tints.** The light card paper (`hsl(225 30% 95%)`, about C6 M4 Y2) can mottle on toner
    presses; the press test shows it beside white and stronger tints.
  - **The press test** (`#lab/proof`, `proof.ts`): one A4 page with a dark tile and a dark card at
    100 %, the space and neutral ramps, the wells, every category colour, the text sizes and hairlines.
    It exports as a CMYK PDF and as an RGB PNG; print the one the pieces will go as, on the real press
    and stock, before a run.
- **Fonts.** Every print file carries its fonts: cards and the aid embed Inter and Orbitron, tiles
  Inter ExtraBold (the number) and JetBrains Mono (the label). All are SIL Open Font License, so
  embedding is allowed. The files are rasterised, so there is no live text to outline; a future vector
  PDF should embed the fonts, and outline them only if the printer asks. Self-hosting the fonts instead
  of the Google CDN would let exports work offline.
- **Thin lines and small text.** Keep printed strokes ≥ 0.15 mm and text ≥ 6 pt. Exceptions: the card
  footer and HUD label (1.5 and 2.1 mm), numerals in the card art (from 1.66 mm, bold), and the tile's
  flavour label (1.2–1.7 mm), which is texture rather than text.

### Checks

- `pdffonts` / `pdfinfo` in CI: every font embedded, page size as expected.
- Visual snapshots (Playwright screenshots) of each art component at two sizes, so an art change
  shows up in review.
- Text-fit test: every card's rules text fits its box.
- Licence test: every image referenced in `art.yaml` has author, source and licence.

---

## 5. Phases

Each phase leaves the game working and better-looking.

**Phase 1 — Foundations (no visible change)**
- [x] Create `packages/art` with tokens, seeded RNG, scoped ids, mm units.
- [x] Tile, void and planet drawing moved out of `Board.tsx` into `tileSvg` / `planet` / `starfield`.
- [ ] Gate drawing likewise
      components; `Board.tsx` places them and keeps the interactive layer.
- [ ] Self-host fonts; generate the app's CSS colour variables from tokens.

**Phase 2 — Print loop working end to end (ugly is fine)**
- [x] Print loop in the Art Lab (§4): PNG at the piece's dpi, ZIP sets (PNG or CMYK PDF) with or without bleed, A4
      sheets with crop marks and duplex backs, saved as PDF from the print dialog.
- [ ] Headless print route + `scripts/print.ts`; output current cards and tiles as `cards-pnp` and `tiles`
      PDFs with bleed and crop marks.
- [x] Cards drawn once, in mm, for both the game's pop-ups and print (`cardSvg`), with illustrations
      and backs.
- [x] Text fit: card text shrinks until it fits; a test checks the player aid's text sizes.
- [ ] PDF checks.
- [x] CMYK PDFs for print services that want CMYK, one per piece (FOGRA39, PDF/X-1a rules), and the A4 press test.

**Phase 3 — Art Lab**
- [x] Lab route (`#lab`): all 30 tiles, seed/type/rings controls, and the standard print exports (§4) plus SVG for Illustrator.
- [ ] Context view (tile vs. card vs. in-game size) and starfield/planet-only views.
- [ ] `data/art.yaml` and pinning.

**Phase 4 — The new look**
- [ ] Art direction: mood board, palette (tested for colour-blind players and for CMYK), type.
- [ ] Icon set (ships 1–6 first).
- [x] First pass: seeded starfield with warped-noise nebula, filaments and dust; four planet types (ocean, gas, ice, lava), each planet number its own kind of world from noise with sphere shading, atmosphere and rings; Void black hole, rift and supernova.
- [ ] Iterate on the look in the lab; card frames and backs.
- [x] The game maps each planet to a tile id (`assignTiles`), so a tile looks the same on every map.
- [ ] Pin the chosen seeds for all 30 tiles in `art.yaml` (the lab shows each spec to copy).
- [ ] Print one test tile at 100 % and check it with real 19 mm dice and cubes before the full set.
- [x] In-game tiles are drawn once to images and cached in IndexedDB; drawn in the background in the lobby.
- [ ] Pre-rendered PNG backgrounds for print (filters rasterise at an uncontrolled resolution in PDFs).
- [ ] App background uses the same starfield.

**Phase 5 — Production**
- [ ] Choose card and tile vendor; set trim/bleed tokens to their specs.
- [ ] Card art (procedural or illustrated) for every card, with licences.
- [x] Player aid (A6, `#lab/aid`).
- [x] Map setup sheets (`#lab/maps`).
- [ ] Tile backs, box art, rulebook diagrams (rendered from engine states with the
      same components).
- [ ] Physical proof, then fix colours.

---

## Open decisions

- **Cube size**: pads assume cubes up to 10 mm; measure the cubes we'll use.
- **Tile thickness / material** (chipboard vs. card), from the vendor.
- **Vendor** (sets bleed, colour handling, file format).
- **Card art source**: procedural only, commissioned, or AI-assisted with human art direction.
  Affects budget, look and licensing (see the IP note in ROADMAP M0: no reuse of original or fan art).
- **Name** on the printed components (the app is currently titled "Cubic").
