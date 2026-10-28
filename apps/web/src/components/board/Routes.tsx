import type { CSSProperties } from 'react';
import { drawing, key, type Board, type Cell } from '@regolith/engine';
import type { Route } from '../../game/controller';
import { placement } from './geometry';

/**
 * Next to each other on the map as drawn (diagonally too: an Interceptor's step): not across a joined
 * edge or through a Warp Gate. A hex's diagonal is √3 spaces away.
 */
const touching = (board: Board, a: Cell, b: Cell) => {
  const { at } = drawing(board);
  const [p, q] = [at(a), at(b)];
  return Math.hypot(p.r - q.r, p.c - q.c) < 1.8;
};

/**
 * The ways ships would fly (Controller.routes), as lines from space to space in the mover's `color`: the main one solid,
 * alternatives dashed under it. An attack ends in an arrow halfway into its target's space. A line
 * breaks where the way jumps, across a joined edge or a Warp Gate. A tap on a way takes it (`onPick` its `from`).
 */
export function Routes({
  board,
  routes,
  cell,
  color,
  onPick,
}: {
  board: Board;
  routes: Route[];
  cell: number;
  color: string;
  onPick: (from: Cell) => void;
}) {
  if (!routes.length) return null;
  const { mid } = placement(board, cell);
  const centre = (p: Cell) => {
    const { x, y } = mid(p);
    return [x, y];
  };
  return (
    <svg className="routes" style={{ '--pc': color } as CSSProperties} aria-hidden>
      {[...routes]
        .sort((a, b) => Number(a.main) - Number(b.main))
        .map((route) => {
          const parts: number[][][] = [];
          route.cells.forEach((p, i) => {
            if (i === 0 || !touching(board, route.cells[i - 1], p)) parts.push([]);
            parts[parts.length - 1].push(centre(p));
          });
          if (!parts.length) return null;
          const [x0, y0] = centre(route.from);
          let arrow = '';
          if (touching(board, route.from, route.strike)) {
            const [x1, y1] = centre(route.strike);
            const [x, y] = [(x0 + x1) / 2, (y0 + y1) / 2];
            parts[parts.length - 1].push([x, y]);
            // A chevron at the tip, pointing at the target.
            const len = Math.hypot(x1 - x0, y1 - y0);
            const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
            const a = cell * 0.14;
            arrow = `M${x - ux * a + uy * a} ${y - uy * a - ux * a} L${x} ${y} L${x - ux * a - uy * a} ${y - uy * a + ux * a}`;
          }
          const d = parts.map((part) => `M${part.map(([x, y]) => `${x} ${y}`).join(' L')}`).join(' ');
          return (
            <g key={key(route.from)} className={`route ${route.main ? 'route-main' : 'route-alt'}`} onClick={() => onPick(route.from)}>
              <path className="route-hit" d={d} />
              <path className="route-line" d={d} />
              {arrow && <path className="route-line" d={arrow} />}
              <circle className="route-end" cx={x0} cy={y0} r={cell * 0.08} />
            </g>
          );
        })}
    </svg>
  );
}
