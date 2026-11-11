import { cellOf, perimeterSpaces, same, type GameState } from '@regolith/engine';
import { legalFor } from '../game/legal';
import { highlightsFor, noHighlights, type Highlights } from '../game/highlights';
import type { Show } from './script';
import { HOME } from './stage';

/**
 * What a caption lights up, in the game's own highlights: a mech selected as a tap would select it shows
 * what the game shows (reachable spaces, targets, the zones that stop it), so the demo teaches the screen
 * a player will see.
 */
export function lit(game: GameState, show: Show | undefined): Highlights {
  if (!show) return noHighlights();
  const sel = show.pick ? ({ kind: 'mech', die: show.pick } as const) : undefined;
  const h = sel ? highlightsFor(game, sel, legalFor(game), true) : noHighlights();
  for (const [id, label] of Object.entries(show.objectives ?? {})) {
    h.objectives.set(Number(id), { tone: Number(id) === HOME.you || Number(id) === HOME.foe ? 'start' : 'claim', label });
  }
  if (show.claim !== undefined) h.objectives.set(show.claim, { tone: 'claim', label: sum(game, show.claim) });
  // Your own mechs are pointed at in the game's friendly ring, the rival's in the one for targets.
  for (const id of show.look ?? []) h.dice.set(id, game.dice.find((d) => d.id === id)?.owner === game.turn.player ? 'swap' : 'target');
  return h;
}

/** "5 + 3 = 8": the mechs of the player to move on an objective's perimeter, added up. */
function sum(game: GameState, objective: number): string {
  const perimeter = perimeterSpaces(game.board, game.board.objectives[objective]);
  const values = game.dice
    .filter((d) => {
      const at = d.owner === game.turn.player ? cellOf(d) : undefined;
      return !!at && perimeter.some((p) => same(p, at));
    })
    .map((d) => d.value);
  return `${values.join(' + ')} = ${values.reduce((a, b) => a + b, 0)}`;
}
