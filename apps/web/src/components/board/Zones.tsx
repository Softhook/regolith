import { key, type Board, type Cell } from '@regolith/engine';
import { hexCorners, placement } from './geometry';

/** Enemy zones of control (highlights.zones): a hatched tint on each space, square or hex like the map's spaces. */
export function Zones({ board, cells, cell }: { board: Board; cells: Cell[]; cell: number }) {
  const { box, mid } = placement(board, cell);
  if (!board.hex)
    return (
      <div className="zones" aria-hidden>
        {cells.map((c) => (
          <span key={key(c)} style={box(c)} />
        ))}
      </div>
    );
  return (
    <svg className="zones" aria-hidden width="100%" height="100%">
      <defs>
        <pattern id="zone-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="9" />
        </pattern>
      </defs>
      {cells.map((c) => {
        const { x, y } = mid(c);
        return <polygon key={key(c)} points={hexCorners(x, y, cell).join(' ')} />;
      })}
    </svg>
  );
}
