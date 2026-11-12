import { useEffect, type CSSProperties } from 'react';
import { boomAt } from '../../beats';
import { useTransient } from '../../game/useTransient';
import { mechSpots } from '../../game/mechSpots';
import type { Step } from '../../game/staging';
import { destroyedOf, strikeOf } from '../../game/strike';

interface Explosion {
  id: string;
  r: number;
  c: number;
  color: string;
}

const EXPLOSION_MS = 1100;
const SPARKS = 10;

/**
 * Mechs knocked off the map by a battle or a card blow up where they stood. Only in a step of play (`useStep`): undo
 * also takes mechs off the map, but isn't one; nor is anything under reduced motion.
 */
function useExplosions(step: Step | null): Explosion[] {
  const [booms, show] = useTransient<Explosion>(EXPLOSION_MS);
  useEffect(() => {
    if (!step) return;
    const { before, game } = step;
    const spots = mechSpots(before);
    // A card's blow (Orbital Cannon, Unstable Reactor) lands a moment in: they blow up then. Several go one after
    // another, as heard (sounds) and as the staging keeps them till then.
    const strike = strikeOf(before);
    destroyedOf(before, game).forEach((p, i) => {
      const d = game.dice.find((x) => x.id === p.id)!;
      show([{ id: `${d.id}:${d.rolls}`, ...spots.get(d.id)!, color: game.players[d.owner].color }], strike + boomAt(i));
    });
  }, [step, show]);
  return booms;
}

/** One mech blowing up: a flash, two shock waves and sparks, filling the box `style` places (a space's size). */
function Boom({ color, style }: { color: string; style: CSSProperties }) {
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

export function Explosions({ step, cell }: { step: Step | null; cell: number }) {
  const booms = useExplosions(step);
  return booms.map((b) => (
    <Boom key={b.id} color={b.color} style={{ transform: `translate(${b.c * cell}px, ${b.r * cell}px)`, width: cell, height: cell }} />
  ));
}
