import { useEffect, useRef, type CSSProperties } from 'react';
import type { GameState } from '@regolith/engine';
import { boomAt } from '../../beats';
import { isPlayStep, useTransient } from '../../game/useTransient';
import { reducedMotion } from '../../game/useMediaQuery';
import { shipSpots } from './geometry';
import { destroyedOf, strikeOf } from '../../game/strike';

interface Explosion {
  id: string;
  r: number;
  c: number;
  color: string;
}

export const EXPLOSION_MS = 1100;
const SPARKS = 10;

/** Ships knocked off the map by a battle or a card blow up where they stood. None under reduced motion. */
function useExplosions(game: GameState): Explosion[] {
  const [booms, show] = useTransient<Explosion>(EXPLOSION_MS);
  const prev = useRef(game);
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    // Only play: undo also takes ships off the map, but never adds log entries.
    if (!isPlayStep(before, game) || reducedMotion()) return;
    const spots = shipSpots(before);
    // A card's blow (Show of Force, Dangerous) lands a moment in: they blow up then. Several go one after
    // another, as heard (sounds) and as the staging keeps them till then.
    const strike = strikeOf(before);
    destroyedOf(before, game).forEach((p, i) => {
      const d = game.dice.find((x) => x.id === p.id)!;
      show([{ id: `${d.id}:${d.rolls}`, ...spots.get(d.id)!, color: game.players[d.owner].color }], strike + boomAt(i));
    });
  }, [game, show]);
  return booms;
}

/** One ship blowing up: a flash, two shock waves and sparks, filling the box `style` places (a space's size). */
export function Boom({ color, style }: { color: string; style: CSSProperties }) {
  return (
    <div className="explosion" style={{ ...style, '--pc': color } as CSSProperties} aria-hidden>
      <span className="boom-flash" />
      <span className="boom-wave" />
      <span className="boom-wave late" />
      {Array.from({ length: SPARKS }, (_, i) => (
        <span
          key={i}
          className="boom-spark"
          style={{ '--a': `${(360 / SPARKS) * i + (i % 2) * 14}deg`, '--d': `${0.55 + (i % 3) * 0.18}` } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function Explosions({ game, cell }: { game: GameState; cell: number }) {
  const booms = useExplosions(game);
  return booms.map((b) => (
    <Boom key={b.id} color={b.color} style={{ transform: `translate(${b.c * cell}px, ${b.r * cell}px)`, width: cell, height: cell }} />
  ));
}
