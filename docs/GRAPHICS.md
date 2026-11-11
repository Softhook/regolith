# Graphics & Print

How Regolith is drawn, on screen and for print. What is still to do is in [ROADMAP.md](ROADMAP.md#print); the
look itself (the world, the mechs, the screenprint inks) is in [REGOLITH-WORLD.md](regolith/REGOLITH-WORLD.md),
[REGOLITH.md §5](regolith/REGOLITH.md#5-cards-art-screenprint) and the [mood board](moodboards/regolith/).

The rule behind every decision below: **one drawing, two outputs.** A tile, a card face or the player aid is
drawn by one function. The web app shows it on screen; the Art Lab exports it at physical size. Nothing is drawn
twice, so the printed game and the online game can't drift apart.

Regolith's look was Cubic's space look until the split (2026-10-27): starfields, planets and holographic cards.
That look is gone; it is in the history if a piece of it is wanted.

## Where we are today

| Element | How it's drawn | Printed? |
|---|---|---|
| Map tiles | `tileSvg` in [`packages/art`](../packages/art) ([`tile/`](../packages/art/src/tile), [`regolith/`](../packages/art/src/regolith)), in mm and seeded: hex tiles on Phobos, Deimos or Mars, each objective a building. The game draws a map in layers (see *Tiles*): each tile's raster layers (`rasterLayerSvg`) drawn once to images kept in IndexedDB ([`tileImages.ts`](../apps/web/src/art/tileImages.ts)), the spaces live ([`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx)) | Yes, from the Art Lab (`#lab`) |
| Cards | `cardSvg` / `cardBackSvg` ([`card.ts`](../packages/art/src/card.ts)), drawn by the screenprint renderer ([`screenprint/`](../packages/art/src/screenprint)): poker size, SVG text, one scene per card. The game's card pop-ups show the same drawing as an image ([`cardImages.ts`](../apps/web/src/art/cardImages.ts)) | Yes, from `#lab/cards` |
| Player aid | `playerAidSvg` ([`aid.ts`](../packages/art/src/aid.ts)), A6 | Yes, from `#lab/aid` |
| Map setup sheets | `mapSheetSvg` ([`mapSheet.ts`](../packages/art/src/mapSheet.ts)), 180 × 120 mm, one per map: which tile goes where | Yes, from `#lab/maps` |
| Ice Tunnels, spaces, objective numbers and cube slots | SVG in [`board/BoardArt.tsx`](../apps/web/src/components/board/BoardArt.tsx), in screen pixels | Tunnels no (tokens); numbers and cube slots are on the printed tiles |
| Dice / mechs | CSS 3D cube ([`Die3D.tsx`](../apps/web/src/components/Die3D.tsx)); the screenprint mech on its die face in the aid and the manual (`mechDie`) | No (physical dice) |
| Explosions, highlights, hit areas | HTML/CSS overlay (`board-layer`) | Never printed |
| Fonts | Saira Stencil One, Inter, Barlow Condensed, JetBrains Mono (`SP_FONTS`) from the Google Fonts CDN: the stencil for the game's name only (and lettering inside the card art), the rest as on the cards, Inter Black for names and headings and Barlow Condensed for rules; print files embed them as data URLs | Not self-hosted yet |

The board keeps the **art layer** (tile images and SVG) apart from the **interactive HTML layer**.

---

## 1. The architecture

```
data/regolith.yaml (cards)   data/maps.yaml
              │                    │
              └─────────┬──────────┘
                        ▼
                  packages/art
   plain functions → SVG markup, physical units, seeded, no DOM measuring
   tile/ + regolith/ (ground, buildings) · screenprint/ (cards, mechs) · aid · mapSheet · proof · tokens
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
     apps/web (game)          apps/web #lab (Art Lab)
     scales art to screen,    explore seeds, export PNG, ZIP,
     adds the UI layer        print sheets, CMYK PDFs (§4)
```

### `packages/art` rules

1. **Author in millimetres.** Every piece has a fixed `viewBox` in mm (a card is `0 0 69.5 94.9` with its
   bleed; a tile `0 0 96 96`). The screen scales it with CSS; print renders it 1:1. Stroke widths, blur radii
   and font sizes are in mm too, so a tile looks the same at 40 px and at 600 dpi.
2. **No browser measuring, no app state.** Options in, SVG text out: plain TypeScript functions, no React. The
   same call runs in Node (scripts, tests) and in the browser. The game shows the result as an `<image>` (a
   `data:` URL), so the browser rasterises each tile's filters once instead of on every repaint. Cards wrap
   their text with a `measure` function the caller passes in (the browser measures with its fonts; Node
   estimates).
3. **Deterministic.** Anything random (craters, a base's layout, a card's scene) comes from a seeded RNG keyed
   by a stable string, such as a tile's id. The same tile looks identical in every game, in the lab and in
   print. (A small hash + mulberry32 inside `packages/art`; it never shares the engine's game RNG.)
4. **Scoped ids.** Gradients, filters, clip paths and patterns get ids from a prefix option (the tile id by
   default) so any number of drawings can share a page.
5. **Design tokens in one place.** [`tokens.ts`](../packages/art/src/tokens.ts) holds physical sizes and the
   shared hues; the screenprint inks are in [`screenprint/inks.ts`](../packages/art/src/screenprint/inks.ts),
   the ground's in [`regolith/inks.ts`](../packages/art/src/regolith/inks.ts); `icons.ts` the icon set. The game
   imports what it shares with print rather than copying it.
6. **Art vs. chrome.** Things that only exist on screen (highlights, hover rings, explosions, the 3D dice)
   stay in `apps/web`. If it could be printed, it lives in `packages/art`.

---

## 2. The pieces

### Tiles

A tile is a 7-hex flower: an objective's space and its perimeter, an Alien Artefact, or blank ground, on one of three
worlds (`World`, [`tile/look.ts`](../packages/art/src/tile/look.ts)), told apart by lightness first: dark, cool
Phobos under a low sun, cratered and grooved; light, warm Deimos under a high one, its craters buried in dust;
Mars, rust, with dunes and dust devils' tracks. A map names its world, and every tile on
it shows that ground.

- **The ground** ([`regolith/`](../packages/art/src/regolith), its `index.ts` lists the parts) is a height map
  painted in colour and lit once by one filter, with each tile's craters, pits and boulders from its seed. An
  objective is a building on its space (Habitat 7, Refinery 8, Ice Mine 9, Reactor 10, `OBJECTIVE_NAMES`); a
  Alien Artefact is drawn as a pit ringed by violet crystals, its cracks glowing. Chrome ignores the lighting's `kernelUnitLength`, so the light depends on the
  size the ground is drawn at: print draws the lit ground as a bitmap first, at the size it is made for, and
  scales it up (`tileGroundSvg`), and the Art Lab shows tiles as they print.
- **Layers.** Every tile stacks in one order (`TILE_LAYERS`): `ground` (with the building), `spaces` (a well
  per space), `standing` (what stands on the ground again, so the wells are etched into the ground and not
  across the buildings), `objective` (the number and cube pads). Print joins them (`tileSvg`); the Illustrator
  export (`editableTileSvg`) puts the filtered layers in a 600 dpi bitmap and the rest over it as vectors; the
  map ([`MapTiles.tsx`](../apps/web/src/components/board/MapTiles.tsx)) stacks the same layers, each raster
  layer drawn alone (`rasterLayerSvg`, over its `RASTER_AREA`; what stands is cut out of the ground's image
  with `standingMaskSvg`). The map's spaces and numbers come from the board, not the tile, since a perimeter
  can reach onto the next tile.
- **Off the middle.** An objective may sit on any hex of its tile (docs/HEX.md, *Off-centre objectives*); the
  Art Lab shows the set with each objective on any spot (`objectiveAt`). Only the 7s go off the middle on
  today's maps (`OFF_CENTRE`); a larger building would spill over the tile's edge.
- **Where tiles meet.** Each tile's ground is laid by its own noise, so its broad patches (Mars's basalt, the
  brightness's mottle) would stop dead at the cut. They fade out over the last 0.6 of a space in (`rimFade`),
  so every tile's rim is the same plain ground and any two tiles meet without a seam of colour.
- **Loading.** Drawing a tile's filters is slow, so the game draws each tile's layers once to images 768 px
  across (576 px on touch screens) and keeps them in IndexedDB ([`tileImages.ts`](../apps/web/src/art/tileImages.ts)).
  Behind the lobby, the chosen world's ground drifts past close up, a new way each visit: the game's tiles laid
  edge to edge, mostly blanks with the chosen map's tiles among them, never one next to a copy of itself
  ([`Backdrop.tsx`](../apps/web/src/components/lobby/Backdrop.tsx)), drawn from the same images. After them the lobby draws the rest of the chosen map's tiles, so the game opens
  with its tiles ready. Tiles are drawn one at a time, middle
  first, when the page is idle, so the page stays responsive while they come. The ground is stored as JPEG over
  its world's colour, what stands as PNG: WebP was several times slower to encode. Each stored image carries a
  hash of its SVG, so changing the artwork redraws only what changed.
- **Every physical tile is unique.** Each has a fixed id (`p7-01` … `p10-05`, `void` … `void-3`,
  `blank-01` … `blank-10`) and its seed. The game assigns a map's objectives to tile ids (`assignTiles`), so
  the tile on screen is the one on the table.

### Tile geometry

Designed for **19 mm dice**. All numbers live in tokens so they can change after a physical test.

| Measure | Value | Why |
|---|---|---|
| Die | 19 mm | Chosen dice |
| Space | **32 mm** tall (a flat-topped hex) | Die + 6.5 mm each side; ≈ 1.7× the die |
| Space well | etched into the ground: shaded top and left inner edges, lit bottom and right (`well`) | Where a die sits |
| Tile | a 7-hex flower, die-cut along its outline (`HEX_TILE_CUT`, 18 sides) in a **96 × 96 mm** box | |
| Bleed | 3 mm past the cut | |
| Cube | **assumed ≤ 10 mm** (measure ours) | Standard wooden cubes are 8 or 10 mm |
| Cube pad | 11 mm square well, 1.5 mm apart, clustered on the objective | 10 mm cube + tolerance; capacity 7→1 … 10→4 |
| Number | Inter ExtraBold, white with a dark outline, where three hexes meet beside the objective (`numberPlacement`, `numberCorner`) | Never covered by cubes or dice |

**Start markers.** Starting objectives (`7*` in a layout) use separate start tokens, placed in setup, so no
tile needs a start version. The map setup sheets show which.

**The set.** The most of each kind any map in `maps.yaml` uses at once (`SET_COUNTS`):

| Tile | Count |
|---|---|
| Habitat 7 | 8 |
| Refinery 8 | 8 |
| Ice Mine 9 | 6 |
| Reactor 10 | 5 |
| Mass Driver 11 | 2 |
| Deep Space Array 12 | 2 |
| Citadel 13 | 1 |
| Alien Artefact | 3 |
| Blank ground | 10 |
| **Total** | **45** |

**Player-count kits.** The Tiles page can cut the set down to the kit for one player count: every tile any
one of that count's maps on the world lays (`tileKit`), each with its objective where that map puts it. The k-th
objective of a number is that number's k-th tile (art `assignTiles`), so this is the most of each kind any one map
lays at once, not every map's tiles added up, and every map is laid with the tiles the screen shows. A 7 a map
moves off the middle (`7se`, *Off the middle*) is a tile of its own, printed that way: a kit can hold `p7-01` in
the middle and `p7-01` at `se`. The page shows these as `p7-01-se`. "All maps" is the kit for every map on the
world, whatever its player count: never the full set, since no world lays every landmark (a Mass Driver stands
on Phobos only, a Deep Space Array on Deimos only). The page offers only the player counts the world has maps for.

| Players | Phobos | Deimos | Mars | Mars / Phobos, two-sided |
|---|--:|--:|--:|--:|
| 2 | 16 (2 off the middle) | 21 (4) | 31 | 33 (2) |
| 3 | 24 | 18 (3) | 28 | 29 |
| 4 | 29 (2) | 17 | 23 | 29 (2) |
| 5 | 19 | 12 | 19 | 21 |
| All maps | 36 (4) | 31 (7) | 33 | 39 (4) |

**Two-sided tiles.** A tile can carry another world on its back: the same tile (`p7-01` is a Habitat on both
sides), so one kit lays the maps of both worlds. Mars with Phobos on the back is the pairing for now. Each side
is lit for its own world, and nothing else differs. The Tiles page's **Back** sets the world, **Show backs**
shows that side. The kit is then the most either world's maps need: a Mars / Phobos 2-player kit is no bigger
than Mars's and Phobos's own kits together, and a Deep Space Array (Deimos only) is in no Mars / Phobos kit. A side whose world can't hold
the tile's landmark is open ground (`tileSide`): the Mars side of a Mass Driver is `blank-p11-01`. A tile printed
with its 7 off the middle has it there on both sides. The flower cut is its own mirror image, so one cut serves
both sides.

**Sheets.** A tile with bleed fits **2 × 2 per A4 page**; print-on-demand vendors get one file per tile, a
two-sided tile a front and a back, one per world, which the ZIP's README pairs (names carry their world, and a
blank side's is the blank's). The kit chosen goes to the CMYK press sheets, the print sheets and the PNG ZIP,
named for its worlds and player count (`regolith-tiles-mars-phobos-2p-bleed.zip`). Two-sided, each press sheet is followed by its backs, columns mirrored
for long-edge duplex; the back page has crop marks but no cut line or guide, since the cut follows the front.
Two-sided tiles are for a press only: the home print sheets print fronts.

**Front and back never line up exactly.** A digital press puts the back 0.5–1 mm off its front, a punchboard's
glued sheets 1–2 mm, a home duplex printer 1–3 mm (too far, so it isn't offered). The tile is cut along its
front, so the back's bleed is what keeps art at its edge; what's left of the error is the back's art sitting up
to a millimetre off centre. So a back has nothing near its cut that would show that: no border or outline along
the flower. Butted 2 × 2, the bleed is less than 3 mm between tiles: tiles one above the other share a flat side,
so there a back that's off shows its neighbour's ground, not paper; side by side they are 3.6 mm apart, 1.8 mm
of bleed each. Each tile's bleed stops at its square where the tile before it on the sheet is there (above it
or left of it), so no tile's bleed covers another tile's art.

**Cutting a flower by hand.** Eighteen sides, six of them meeting at inward corners. Every side of every tile
lies on a line the sheet marks at both ends (below): a line that leaves a tile into the next one on the sheet is
carried on through it to the margin. Where two slanted lines cross at the grid's edge their marks make a V. A
cut carried on past an inward corner runs into the next hex: for 12 of the 18 sides, a cut from mark to mark goes
some 36 mm into the tile. Lay the rule on the marks and cut along the printed guide, stopping at the corners, or
use scissors, which take inward corners better.

### Cards

The screenprint renderer ([`screenprint/card.ts`](../packages/art/src/screenprint/card.ts), REGOLITH.md §5),
shown and exported in the Art Lab (`#lab/cards`).

- **Size**: poker, 63.5 × 88.9 mm, 3 mm bleed (69.5 × 94.9 mm), 3 mm corner, 3.5 mm safe zone.
- **Two papers by deck**: permanent cards (Skills) on paper in key ink; one-shot cards (Tactics,
  Reinforcements) on night paper in bone. The decks tell apart across the table and face down.
- **Face**: the scene at the top in flat inks under a soft shade, a band in the card's colour plate, the name
  in Inter Black after the category's symbol, the rules in condensed type.
- **One scene per card**, showing what it does, from one kit: the six mechs rigged from the mood board's
  Silhouettes board ([`mechs.ts`](../packages/art/src/screenprint/mechs.ts), posed by `pose.ts`), the tiles'
  buildings side on, crews and small things ([`scenes/`](../packages/art/src/screenprint/scenes)). A test
  checks every card has a scene.
- **Text is SVG**, so one file per card goes to PNG, ZIP and print. Wrapping uses widths measured with the
  page's fonts, and the same fonts are embedded in each SVG, so the layout matches what was measured. Text
  shrinks until it fits.

### Player aid

`playerAidSvg` ([`aid.ts`](../packages/art/src/aid.ts)), in the Art Lab at `#lab/aid`: one board, the same for
every player.

- **Size**: A6 landscape, 148 × 105 mm, 3 mm bleed; two to an A4 sheet.
- **Quiet**: the cards' night paper with a few faint craters, one accent (the cards' yellow, on the action
  hexagons), no boxes. The mech dice are the largest thing on it, then the die pads, then the actions.
- **Readable**: no text under `MIN_TEXT` (2 mm, about 6 pt); a test checks every size.
- **Cube rail** down the left edge, seven pads, with "Place your last cube to win" beside them; **die pads**
  for Power and Research with what moves each and what 6 does; **the turn**, each action with its cost and a
  line of rules, then combat, zones, contested perimeters, atomics and cards; **the mechs**, each on its die
  face (`mechDie`) with its power in a short phrase.

### Map setup sheets

`mapSheetSvg` ([`mapSheet.ts`](../packages/art/src/mapSheet.ts)), in the Art Lab at `#lab/maps`: one 180 ×
120 mm sheet per map, two to an A4 page, for setting a map up at a table. Each tile is its flower as the map
lays it, with its objective's number on the hex it sits on, starting objectives in amber, Alien Artefacts tinted
ice, blank ground plain. The lobby's small map preview uses the same marks.

### Iconography

One icon set ([`icons.ts`](../packages/art/src/icons.ts)) on a 24-unit grid with mm-based stroke widths:
actions, Power, Research, atomic, cube, card categories. A hexagon means an action and nothing else.

---

## 3. The Art Lab

A route in the web app, `#lab`, for exploring the art and exporting it:

| Page | |
|---|---|
| `#lab` | Every tile, on a chosen world, with its objective on a chosen spot; seed per tile, reroll, print markings on or off; SVG for Illustrator |
| `#lab/cards` | Regolith's decks and backs |
| `#lab/aid` | The player aid |
| `#lab/maps` | Each map's setup sheet |
| `#lab/proof` | The press test (§4) |

Each page has the same export panel (§4). Seeds changed in the lab are for exploring; to keep one, copy the
spec the lab shows into the code.

**SVG for Illustrator**: the art is built from SVG filters, which only browsers render; Illustrator drops them
and doesn't read `hsl()` colours. This export embeds the art as a 600 dpi PNG (layer `art`) with the markings
on top as plain vectors (layer `markings`), so it opens looking the same and the markings stay editable.

---

## 4. Print pipeline

Every printed piece goes through one module, `apps/web/src/print/`, so all pieces export the same way:

- `pieces.ts` holds each piece's print spec (trim, bleed, sheet grid, dpi) and the file-name pattern:
  `regolith-<piece>-<name>[-bleed][-<dpi>dpi].<ext>` for one face, `regolith-<pieces>[-<part>][-bleed|-fogra39[-deep]].zip`
  for a set. A tile is die-cut along its flower (`Die`): its art is **knocked out** past the flower, at the cut
  at trim size, and past it by the bleed in files with bleed, so a cut that wanders still has art under it. The
  press and home print sheets clip each tile to that shape, so no neighbour's knocked-out corner covers its
  bleed, and print a guide on the cut for cutting by hand. Every export for a press carries the cut line: `cut.svg`
  in the PNG ZIP, a `CutContour` spot colour in the CMYK PDFs (overprinting; a print service cuts along it and
  doesn't print it), and a `cut` layer in the Illustrator SVG.
- `PrintPanel.tsx` is the export panel on every lab page: this face as a PNG (plus page extras such as SVG for
  Illustrator), the whole set as a ZIP of PNGs with a README, the CMYK export for the press (below), and print
  sheets. Everything uses the piece's `dpi`: 600 for cards and the aid (small text), 300 for tiles and map
  sheets. Exports refuse to run when the fonts didn't load. Every export button carries an RGB or CMYK tag, so
  an RGB file (the PNGs, the print sheets, the Illustrator SVG) is never taken for the press file.
- `press.ts` gets files ready for a press: PNGs are opaque RGB, tagged sRGB and carry their dpi, so a RIP
  converts the colours as we see them and opens the file at its physical size. `toCmyk` converts to the
  press's CMYK through a table (`cmykTable.ts`). **Deep black** (a tick box beside every CMYK export, off by
  default) prints the darkest tones as a full-black rich black, within the 300 % ink limit; its files are tagged
  `-fogra39-deep`. Its threshold is still Cubic's space base (`SPACE_BASE`), darker than anything Regolith
  draws, so today it changes little: to be retuned against the night paper and the grounds.
- **CMYK PDFs** (`pdf.ts`): made to the PDF/X-1a rules (PDF 1.3, CMYK only, no fonts or transparency, TrimBox
  and BleedBox, an output intent naming FOGRA39); only a preflight such as Acrobat's can certify it. Each face
  is a flattened CMYK image at the piece's `dpi`; a page too big for one canvas is drawn in overlapping bands
  (`files.ts` `drawBands`). Two shapes, by how the piece is printed:
  - **Cards: a file per card**, for a print service that takes one PDF per card (Doxzoo asks for PDF/X-1a,
    Coated FOGRA39): a ZIP with a PDF per front, its back as page 2, every page with its bleed and no crop
    marks; how many of each to order is in `order.csv`.
  - **Tiles, aids and map sheets: press sheets** ([`lab/pressSheets.ts`](../apps/web/src/lab/pressSheets.ts)):
    one PDF of A4 sheets per set: the tiles of the kit chosen on the Tiles page (`regolith-tiles-mars-a4-fogra39.pdf`,
    `regolith-tiles-mars-phobos-2p-…`, 2 × 2 a page, a two-sided kit's backs after each page), the player aids
    (4, 1 × 2 a page), the map sheets (1 × 2 a page). Faces are butted so one cut serves two pieces, each block
    with its 3 mm bleed all round; crop marks start clear of the bleed. With print markings. Tiles go two ways:
    - **Hand cut** (the default; `-handcut` in the name), for a press that prints but doesn't cut: on each
      front a guide printed on the cut, 0.15 mm in 50 % black (pdf.ts `GUIDE`), the art still running its bleed
      past it, so a cut a little outside the guide shows ground, not paper. No cut line: a RIP that doesn't know
      the `CutContour` spot might print it. Whether the guide shows on every world's ground, and how much of it
      is left on a cut tile's edge, is for a test print to settle.
    - **Die cut**, for a print service with a die: each tile with its bleed past the cut, and the cut line.
- `sheets.ts` lays out both kinds of sheet the same way (`sheetPages`): pieces in a grid (cards 3 × 3, tiles
  2 × 2, aid and map sheets 1 × 2), butted, with bleed round each block, each face cut at its left and top where
  a piece is there, so it covers the bleed of the one before but never its art. Home print sheets (`homePages`,
  `sheetsHtml`) are the press sheets in RGB through the browser: fronts only (a home duplex is too far off for
  backs), with their bleed (`homeBleed`: the piece's 3 mm, less only where the paper has no room for it and a
  2 mm crop mark, 1 mm for cards on US Letter), crop marks kept 4 mm in from the paper's edge, a tile's cut
  printed as a grey guide, each face clipped with CSS `clip-path: path()`, and the marks and guides as SVG
  strokes, which print without "Background graphics". On a hex tile's cuts inside its square (slanted and level)
  a mark along each where, carried on, it leaves the grid (`HEX_TILE_CUT_EXITS`, worked out from the cut, carried
  through the next tile when it leaves into one), to lay a rule on: it lines up every side on that line, but a
  cut carried past an inward corner runs into the tile (*Cutting a flower by hand*). A4 or US Letter.

A new piece is a `PIECES` entry and a `Printable` per face.

### Things that behave differently in print

- **Filters are rasterised**, at a resolution we don't control, so the tile's ground is drawn as a bitmap
  first (above) and everything else stays vector until the export flattens it.
- **Colour.** For a service that prints CMYK, we convert ourselves rather than leave it to their RIP: the CMYK
  PDFs, for the press's profile. For one that wants RGB (most card printers), the PNGs, tagged sRGB. Ask the
  printer for the press, stock, finish and ink limit.
  - **The profile and table.** The CMYK is made for ECI's ISO Coated v2 300 % (FOGRA39 with the ink capped at
    300 %), in `scripts/press.icc` (from www.eci.org, unmodified; © Heidelberger Druckmaschinen, made for the
    ECI, who distribute it free of charge). It is only used to build the table, with relative colorimetric
    and black point compensation, so the darkest tones stay apart. `npm run print:cmyk-table -- --profile
    <file.icc>` swaps it and rebuilds `cmykTable.ts`.
  - **Gamut.** Saturated violets, greens and blues lose half or more of their chroma in CMYK; Research's
    violet was moved to 290° to stay clear of the player blue.
  - **The press test** (`#lab/proof`, [`proof.ts`](../packages/art/src/proof.ts)): one A4 page with a tile and
    a card at 100 %, the neutral ramps, the wells, the colours, text sizes and hairlines, as a CMYK PDF and an
    RGB PNG. Print the one the pieces will go as, on the real press and stock, before a run.
- **Fonts.** Every print file carries its fonts (all SIL Open Font License, so embedding is allowed). The
  files are rasterised, so there is no live text to outline. Self-hosting the fonts would let exports work
  offline.
- **Thin lines and small text.** Keep printed strokes ≥ 0.15 mm and text ≥ 6 pt.

---

## Open decisions

- **Cube size**: pads assume cubes up to 10 mm; measure the cubes we'll use.
- **Tile thickness and material** (chipboard or card), from the vendor.
- **Vendor** (sets bleed, colour handling, file format).
- **One look for map and cards**: whether the tiles and dice move further towards the screenprint inks
  (REGOLITH.md, *Open decisions*).
