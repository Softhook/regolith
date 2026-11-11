/** The board zoom's geometry (useBoardZoom): where the board may be, for a wrap of a given size. Pure, so it's tested. */

/** Zoomed in, a space is at most this many times its fitted size, where the tile images allow it. */
const MAX_ZOOM = 4;
/** However coarse the tile images, zooming goes at least this far. */
const MIN_ZOOM = 1.8;
/**
 * How far past their sharp size the tile images may be stretched: they're soft noise, so a little is hard to see,
 * and what's drawn over them (mechs, dice, labels) is vector and sharp at any size.
 */
const STRETCH = 1.5;

export interface View {
  /** The space's size in pixels. */
  cell: number;
  /** The board's top-left corner, in pixels from the wrap's. */
  x: number;
  y: number;
}

/** A board of `rows` × `cols` spaces in a wrap of `w` × `h` pixels, and the sizes its spaces may have there. */
export interface Frame {
  rows: number;
  cols: number;
  w: number;
  h: number;
  /** The space's size when the whole board fits. */
  fit: number;
  /** Zoomed all the way in. */
  max: number;
}

/**
 * The frame, zooming in to `STRETCH` times `sharp` px spaces, the largest the tile images stay sharp at on this
 * screen (tileImages `SHARP_CELL` over its device pixel ratio), and between `MIN_ZOOM` and `MAX_ZOOM` times the
 * fitted size whatever that is.
 */
export function frame(w: number, h: number, rows: number, cols: number, sharp: number): Frame {
  const fit = Math.max(8, Math.min(140, Math.floor(Math.min(w / cols, h / rows))));
  return { rows, cols, w, h, fit, max: Math.round(Math.max(fit * MIN_ZOOM, Math.min(fit * MAX_ZOOM, sharp * STRETCH))) };
}

/** Whether zooming does anything here. */
export const canZoom = (f: Frame) => f.max > f.fit;

export const clampCell = (f: Frame, cell: number) => Math.min(f.max, Math.max(f.fit, cell));

/** How far a pull of `over` px past an edge moves the map: less and less, never more than `room`. */
export function rubber(over: number, room: number): number {
  if (!over || room <= 0) return 0;
  return Math.sign(over) * (1 - 1 / ((Math.abs(over) * 0.55) / room + 1)) * room;
}

/**
 * The board with spaces of `cell` px at (x, y), moved as little as it takes to be centred along an axis it
 * fits in, and to cover the wrap along one it doesn't. With `give` (under a finger) it goes past those
 * limits, less and less the further it's pulled, and springs back when let go.
 */
export function place(f: Frame, cell: number, x: number, y: number, give = false): View {
  const axis = (pos: number, length: number, room: number) => {
    const lo = length <= room ? (room - length) / 2 : room - length;
    const hi = length <= room ? lo : 0;
    const at = Math.min(hi, Math.max(lo, pos));
    return give ? at + rubber(pos - at, room) : at;
  };
  return { cell, x: axis(x, f.cols * cell, f.w), y: axis(y, f.rows * cell, f.h) };
}

/** The whole board, fitted. */
export const fitted = (f: Frame) => place(f, f.fit, 0, 0);

/** Pinched past the closest or furthest zoom, the map gives a little (and springs back when let go). */
export function softCell(f: Frame, cell: number): number {
  if (!canZoom(f)) return f.fit;
  if (cell > f.max) return f.max * (cell / f.max) ** 0.3;
  if (cell < f.fit) return f.fit * (cell / f.fit) ** 0.3;
  return cell;
}

/** `from` zoomed by `factor`, keeping the point (fx, fy) of the wrap where it is. */
export function zoomAround(f: Frame, from: View, factor: number, fx: number, fy: number): View {
  const cell = clampCell(f, from.cell * factor);
  const s = cell / from.cell;
  return place(f, cell, fx - (fx - from.x) * s, fy - (fy - from.y) * s);
}

/** Spaces of `cell` px, with the space (r, c) in the middle as far as the board's edges allow. */
export const centredOn = (f: Frame, cell: number, r: number, c: number) =>
  place(f, cell, f.w / 2 - (c + 0.5) * cell, f.h / 2 - (r + 0.5) * cell);
