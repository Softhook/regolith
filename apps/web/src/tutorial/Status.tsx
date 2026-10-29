import type { CSSProperties } from 'react';
import type { GameState } from '@regolith/engine';
import type { Counter } from './script';

/**
 * The sides at a glance, as the game's player panels give them, but only the counters a lesson is about:
 * cubes still to place, Power, and the actions left in the turn of whoever is playing. A rival nobody in the
 * lesson meets is left out.
 */
export function Status({ game, hud, rival }: { game: GameState; hud: readonly Counter[]; rival: boolean }) {
  const sides = game.players.filter((p) => rival || p.id === 0);
  return (
    <div className={`demo-status${sides.length === 1 ? ' solo' : ''}`}>
      {sides.map((p) => {
        const active = game.turn.player === p.id;
        return (
          <div key={p.id} className={`demo-side ${active ? 'active' : ''}`} style={{ '--pc': p.color } as CSSProperties}>
            <strong>{p.name}</strong>
            {hud.includes('cubes') && (
              <span className="demo-stat" title={`${p.cubesLeft} cubes left to place`}>
                <small>Cubes left</small>
                <span className="demo-cubes">
                  {Array.from({ length: p.cubesLeft }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </span>
            )}
            {hud.includes('power') && (
              <span className="demo-stat track track-dom" title={`Power ${p.dominance} of 6`}>
                <small>Power</small>
                <span className="track-cells">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <span key={n} className={n <= p.dominance ? 'on' : ''} />
                  ))}
                </span>
              </span>
            )}
            {hud.includes('actions') && active && (
              <span className="demo-stat" title={`${game.turn.actionsLeft} actions left`}>
                <small>Actions</small>
                <span className="demo-actions">
                  {[0, 1, 2].map((n) => (
                    <i key={n} className={n < game.turn.actionsLeft ? 'on' : ''} />
                  ))}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
