import { OBJECTIVE_NAMES, TILE_SET, WORLD_NAMES, mapSheetSvg, playerAidSvg, tileSvg, type TileSpec, type World } from '@regolith/art';
import { MAPS, type MapDef } from '@regolith/engine';
import { cardFontCss, measure, tileFontCss } from '../art/cards';
import { mapSheet } from '../art/mapSheet';
import type { PressSheets } from '../print/exports';
import { PIECES, slugOf, type Printable } from '../print/pieces';
import { printedTileSvg, type TileView } from './tileDrawing';

/** Fonts for press sheets, which can't go out in system fonts: a failed load stops the export. */
async function fontsFor(load: () => Promise<string>): Promise<string> {
  const css = await load();
  if (!css) throw new Error('the fonts didn’t load');
  return css;
}

/**
 * A tile as a printable face, named for its objective, where its planet sits when that's not the middle, and
 * its world: `habitat-01-phobos`, `habitat-01-ne-mars`, `alien-artefact-02-mars` (a Void has no spot).
 */
export const printableTile = (t: TileSpec, fontCss: string, markings = true, view: TileView = {}): Printable => {
  const id = objectiveId(t);
  return {
    name: (view.planetAt && t.number > 0 ? `${id}-${view.planetAt}` : id) + `-${view.world ?? 'mars'}`,
    svg: (bleed) => tileSvg(t, { ...view, markings, bleed, fontCss }),
    print: (bleed) => printedTileSvg(t, { ...view, markings, bleed, fontCss }),
  };
};

/** A tile's id with its objective for its planet: `p7-01` → `habitat-01`, `void-2` → `alien-artefact-02` (blanks as they are). */
function objectiveId(t: TileSpec): string {
  const objective = OBJECTIVE_NAMES[t.number];
  if (!objective) return t.id;
  // Its number in the set: the id's last (`void` is the first).
  const n = Number(t.id.match(/\d+$/)?.[0] ?? 1);
  return `${slugOf(objective)}-${String(n).padStart(2, '0')}`;
}

/** The player aid as a printable face. */
export const printableAid = (fontCss: string): Printable => ({
  name: 'aid',
  svg: (bleed) => playerAidSvg({ bleed, measure, fontCss }),
});

/** A map's setup sheet as a printable face: each tile where the map lays it, as the game draws it. */
export function printableMap(map: MapDef, fontCss: string): Printable {
  const sheet = { ...mapSheet(map), fontCss };
  return { name: map.id, svg: (bleed) => mapSheetSvg({ ...sheet, bleed }) };
}

/** Every map's setup sheet on press sheets of their own. */
export const MAP_SHEETS: PressSheets = {
  name: 'maps',
  label: 'Maps',
  contents: `the setup sheets of all ${MAPS.length} maps (${PIECES.map.cols * PIECES.map.rows} a page)`,
  async groups() {
    const card = await fontsFor(cardFontCss);
    return [{ piece: PIECES.map, faces: MAPS.map((m) => printableMap(m, card)) }];
  },
};

/** How many player aids a full table needs: one per player, for the largest player count. */
export const AID_COPIES = 4;

/** The player aids on press sheets of their own. */
export const AID_SHEETS: PressSheets = {
  name: 'aids',
  label: 'Aids',
  contents: `${AID_COPIES} player aids (${PIECES.aid.cols * PIECES.aid.rows} a page)`,
  async groups() {
    const card = await fontsFor(cardFontCss);
    return [{ piece: PIECES.aid, faces: Array(AID_COPIES).fill(printableAid(card)) }];
  },
};

/** The set, blanks too, on a world, planets in the middle, on press sheets of their own with each tile's die-cut line. */
const worldTiles = (world: World): PressSheets => ({
  name: `tiles-${world}`,
  label: `${WORLD_NAMES[world]} tiles`,
  contents: `all ${TILE_SET.length} tiles on ${WORLD_NAMES[world]} (${PIECES.tile.cols * PIECES.tile.rows} a page), each with its die-cut line in a CutContour spot colour`,
  async groups() {
    const tile = await fontsFor(tileFontCss);
    return [{ piece: PIECES.tile, faces: TILE_SET.map((t) => printableTile(t, tile, true, { world })) }];
  },
});

/** The press sheets each world's set of tiles goes on. */
export const TILE_SHEETS: Record<World, PressSheets> = {
  phobos: worldTiles('phobos'),
  deimos: worldTiles('deimos'),
  mars: worldTiles('mars'),
};
