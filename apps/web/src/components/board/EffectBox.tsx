import type { CSSProperties, ReactNode } from 'react';
import { drawing, type Board, type Cell } from '@regolith/engine';

/** How many of `owner`'s cubes a planet holds. */
export const cubeCount = (cubes: readonly number[], owner: number) => cubes.filter((x) => x === owner).length;

/** A short effect on the map: on the space `at`, or from `at` to `to`, in a player's colour. */
export interface MapEffect {
  id: string;
  at: Cell;
  to?: Cell;
  color: string;
}

/**
 * One effect's box: a space's size, on `at` (a board space, drawn where `board` draws it), with its colour as `--pc`. One that goes somewhere also
 * gets `--len` and `--angle`, for a part that reaches from the middle of `at` to the middle of `to`.
 */
export function EffectBox({
  e,
  board,
  cell,
  className,
  children,
}: {
  e: MapEffect;
  board: Board;
  cell: number;
  className: string;
  children: ReactNode;
}) {
  const { at } = drawing(board);
  const from = at(e.at);
  const style: Record<string, string | number> = {
    transform: `translate(${from.c * cell}px, ${from.r * cell}px)`,
    width: cell,
    height: cell,
    '--pc': e.color,
  };
  if (e.to) {
    const to = at(e.to);
    const dx = to.c - from.c;
    const dy = to.r - from.r;
    style['--len'] = `${Math.hypot(dx, dy) * cell}px`;
    style['--angle'] = `${Math.atan2(dy, dx)}rad`;
  }
  return (
    <div className={className} style={style as CSSProperties} aria-hidden>
      {children}
    </div>
  );
}
