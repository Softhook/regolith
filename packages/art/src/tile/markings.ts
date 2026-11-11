import { CUBE_PAD, FONTS, HEX_EDGE, OBJECTIVE_CAPACITY, OBJECTIVE_FAMILY, TILE, WELL, type WellStyle } from '../tokens';
import { icon } from '../icons';
import { hex, n, type Fragment } from '../svg';
import { MID, TILE_SPOTS, cubePadCentres, hexCorners, numberCorner, numberGlyph, numberPlacement, type Spot } from './geometry';
import type { TileSpec } from './set';

/**
 * A tile's print markings: the spaces' outlines, and the objective's cube pads and number. Plain vectors, so
 * they stay editable in Illustrator; the game draws its spaces and empty cube slots with them too.
 */

/** The research flask on each Alien Artefact space (mm). */
const ARTEFACT_ICON = 8;

/** The faint research flask on an Alien Artefact space centred on (x, y): mechs there gain Research. */
export const artefactFlask = (x: number, y: number) =>
  `<g stroke-opacity=".15">${icon('research', x, y, ARTEFACT_ICON, FLASK, (0.3 * 24) / ARTEFACT_ICON)}</g>`;

/**
 * The edges of a well: a rounded square of side `size` with its top left at (x, y), sunk into the
 * tile. Light comes from the top left, so the top and left inner edges are in shade and the bottom and
 * right ones catch the light. Path data for each, inset to sit inside the well's outline.
 */
function wellEdges(x: number, y: number, size: number, rx: number): { shade: string; lit: string } {
  const a = 0.4;
  const b = size - 0.3;
  return {
    shade: `M${n(x + a)} ${n(y + size - rx)}V${n(y + rx)}Q${n(x + a)} ${n(y + a)} ${n(x + rx)} ${n(y + a)}H${n(x + size - rx)}`,
    lit: `M${n(x + b)} ${n(y + rx)}V${n(y + size - rx)}Q${n(x + b)} ${n(y + b)} ${n(x + size - rx)} ${n(y + b)}H${n(x + rx)}`,
  };
}

/** The Alien Artefact flask's ink. */
const FLASK = hex(222, 80, 82);

/**
 * A hex space's outline centred on (cx, cy): a solid line along its edge, a space tall. Draw a set of them
 * inside `hexEdges`, which fades them together.
 */
export function hexEdge(cx: number, cy: number): string {
  const pts = hexCorners(cx, cy, TILE.cell).map((p) => `${n(p.x)} ${n(p.y)}`);
  return `<polygon points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width="${HEX_EDGE.width}" stroke-linejoin="round"/>`;
}

/** Hex outlines (`hexEdge`) faded as one, so where two meet the line is no darker. */
export const hexEdges = (outlines: string) => (outlines ? `<g opacity="${HEX_EDGE.opacity}">${outlines}</g>` : '');

/**
 * A well centred on (cx, cy): a dark fill with a shaded and a lit inner edge. Plain vectors, so they
 * stay editable in Illustrator; the game draws its empty cube slots with it too.
 */
export function well(cx: number, cy: number, size: number, rx: number, style: WellStyle): string {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const e = wellEdges(x, y, size, rx);
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" rx="${rx}" fill="#000" fill-opacity="${style.fill}"/>` +
    `<path d="${e.shade}" fill="none" stroke="#000" stroke-opacity="${style.shade}" stroke-width="${style.shadeWidth}"/>` +
    `<path d="${e.lit}" fill="none" stroke="#fff" stroke-opacity="${style.lit}" stroke-width="${style.litWidth}"/>`
  );
}

/**
 * Print markings, the spaces' or the objective's (`part`): each space's outline; or wells for the cubes on the
 * objective with its number in the corner `numberCorner` picks. The objective sits at `at` (spaces from the middle).
 * Plain SVG only (hex colours, no `paint-order` or `dominant-baseline`), so they import into Illustrator as
 * editable vectors.
 */
export function markings(spec: TileSpec, part: 'spaces' | 'objective', at: Spot): Fragment {
  const mm = (p: Spot) => ({ x: MID + p.x * TILE.cell, y: MID + p.y * TILE.cell });
  const hasObjective = spec.number > 0;
  let body = '';
  let edges = '';
  for (const spot of part === 'spaces' ? Object.values(TILE_SPOTS) : []) {
    if (hasObjective && Math.hypot(spot.x - at.x, spot.y - at.y) < 1e-6) continue;
    const { x, y } = mm(spot);
    edges += hexEdge(x, y);
    // Mechs on the Alien Artefact gain Research: a faint flask on each space.
    if (spec.number === 0) body += artefactFlask(x, y);
  }
  if (hasObjective && part === 'objective') {
    const p = mm(at);
    for (const q of cubePadCentres(OBJECTIVE_CAPACITY[spec.number], p.x, p.y))
      body += well(q.x, q.y, CUBE_PAD.size, CUBE_PAD.corner, WELL.cube);
    const num = numberPlacement(spec.number);
    const k = numberCorner(at);
    const hue = OBJECTIVE_FAMILY[spec.number].hue;
    // White with a dark outline reads on any objective surface and on the space around it. The outline
    // is a second copy underneath; a 9's bar (`numberGlyph`) is painted like the digit.
    const cx = p.x + k.x * num.x;
    const { baseline, bar } = numberGlyph(spec.number, cx, p.y + k.y * num.y, num.size);
    const text = (paint: string) =>
      `<text x="${n(cx)}" y="${n(baseline)}" ${paint} font-family="${FONTS.body}" font-weight="800" font-size="${n(num.size)}" letter-spacing="${n(-0.03 * num.size)}" text-anchor="middle">${spec.number}</text>` +
      (bar ? `<rect x="${n(bar.x)}" y="${n(bar.y)}" width="${n(bar.w)}" height="${n(bar.h)}" rx="${n(bar.rx)}" ${paint}/>` : '');
    body +=
      text(`fill="none" stroke="${hex(hue, 50, 7)}" stroke-width="${n(num.size * 0.13)}" stroke-linejoin="round"`) + text(`fill="#fff"`);
  }
  return { defs: '', body: hexEdges(edges) + body };
}
