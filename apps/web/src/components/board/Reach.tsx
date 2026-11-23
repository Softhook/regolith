import type { CSSProperties } from 'react';
import { key, moveOptions, type GameState } from '@regolith/engine';
import type { MechSpots } from '../../game/mechSpots';
import { placement, spotBox } from './geometry';

/**
 * The spaces another player's mech could move to with a plain move: its movement (with its owner's skills). Every
 * mech it could reach to attack gets a ring, above the mechs. Only shown, not clickable.
 */
export function Reach({ game, id, cell, spots }: { game: GameState; id: string; cell: number; spots: MechSpots }) {
  const d = game.dice.find((x) => x.id === id);
  if (d?.loc.zone !== 'board') return null;
  const { moves, attacks } = moveOptions(game, id);
  const threatened = [...attacks.keys()].flatMap((t) => (spots.get(t) ? [{ id: t, at: spots.get(t)! }] : []));
  const style = { '--pc': game.players[d.owner].color } as CSSProperties;
  const { box } = placement(game.board, cell);
  return (
    <>
      <div className="reach" style={style}>
        {[...moves.values()].map(({ cell: c }) => (
          <span key={key(c)} style={box(c)}>
            <span />
          </span>
        ))}
      </div>
      <div className="reach reach-attack" style={style}>
        {threatened.map(({ id: t, at }) => (
          <span key={t} style={spotBox(at, cell)}>
            <span />
          </span>
        ))}
      </div>
    </>
  );
}
