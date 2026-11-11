import { OBJECTIVE_NAMES, WORLD_NAMES, mapSheetSvg, playerAidSvg, tileSvg, type TileSpec, type World } from '@regolith/art';
import { MAPS, type MapDef } from '@regolith/engine';
import { cardFontCss, measure, tileFontCss } from '../art/cards';
import { mapSheet } from '../art/mapSheet';
import type { PressSheets } from '../print/exports';
import { PIECES, slugOf, type Printable } from '../print/pieces';
import { printedTileSvg, type TileView } from './tileDrawing';
import { tileKit, tileSide } from './tileSets';

/** Fonts for press sheets, which can't go out in system fonts: a failed load stops the export. */
async function fontsFor(load: () => Promise<string>): Promise<string> {
  const css = await load();
  if (!css) throw new Error('the fonts didn’t load');
  return css;
}

/**
 * A tile as a printable face, named for its objective and its world: `habitat-01-phobos`, `alien-artefact-02-mars`.
 */
export const printableTile = (t: TileSpec, fontCss: string, markings = true, view: TileView = {}): Printable => {
  const id = objectiveId(t);
  return {
    name: `${id}-${view.world ?? 'mars'}`,
    svg: (bleed) => tileSvg(t, { ...view, markings, bleed, fontCss }),
    print: (bleed) => printedTileSvg(t, { ...view, markings, bleed, fontCss }),
  };
};

/** A tile's id with its objective for its objective: `p7-01` → `habitat-01`, `void-2` → `alien-artefact-02` (blanks as they are). */
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

/** A kit's tiles: which maps it lays (`tileKit`), and the worlds on its two sides (the back, when it has one). */
export interface TileKit {
  world: World;
  back?: World;
  players?: number;
}

/**
 * A kit's tiles, blanks too, each objective where its maps put it, on press sheets of their own, to die-cut or cut by
 * hand (exports.ts `exportCmykSheets`). A two-sided kit's backs follow each page, mirrored for long-edge duplex; a
 * side whose world can't hold the tile's objective is open ground (`tileSide`).
 */
export const tileSheets = ({ world, back, players }: TileKit): PressSheets => {
  const kit = tileKit(back ? [world, back] : [world], players);
  const worlds = back ? `${WORLD_NAMES[world]} / ${WORLD_NAMES[back]}` : WORLD_NAMES[world];
  const maps = players === undefined ? 'every map' : `the ${players}-player maps`;
  const side = (t: TileSpec, on: World, fontCss: string) => printableTile(tileSide(t, on), fontCss, true, { world: on });
  return {
    name: `tiles-${world}${back ? `-${back}` : ''}${players === undefined ? '' : `-${players}p`}`,
    label: `${worlds} tiles${players === undefined ? '' : ` · ${players} players`}`,
    contents:
      `${kit.length} tiles for ${maps} on ${worlds} (${PIECES.tile.cols * PIECES.tile.rows} a page)` +
      (back ? `; each page's backs (${WORLD_NAMES[back]}) follow it, mirrored for long-edge duplex` : ''),
    async groups() {
      const tile = await fontsFor(tileFontCss);
      return [
        {
          piece: PIECES.tile,
          faces: kit.map((k) => side(k, world, tile)),
          ...(back && { backs: kit.map((k) => side(k, back, tile)) }),
        },
      ];
    },
  };
};
