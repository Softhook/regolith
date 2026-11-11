import { cellOf, same, type Cell, type GameState } from '@regolith/engine';
import { TUNNEL_COLOR } from '../theme';
import { cardsUsed, lastLogId } from './steps';

/** A short effect on the map: on the space `at`, or from `at` to `to`, in a player's colour. */
export interface MapEffect {
  id: string;
  at: Cell;
  to?: Cell;
  color: string;
}

/**
 * A card's mark on the map, over the plain action effects (ActionEffects): Show of Force striking a mech,
 * Ice Tunnels linked and the old pair closed (the board draws the tunnels themselves), an expansion mech
 * arriving, a fleet cloaked and unveiled, a mech number nudged (Flexible, Clever), a mech scrapped
 * (Resourceful), and the two mechs Dangerous destroys. `replaces` names what the effect stands in for an action's effect on
 * (ActionEffects): a mech, or `objective:<id>` for the objective a cube was relocated to.
 */
export type CardEffect = MapEffect & { replaces?: string } & (
    { kind: 'strike' | 'expansion' | 'cloak' | 'decloak' | 'implode' | 'raise' | 'lower' | 'blink' } | { kind: 'beam' | 'arc'; to: Cell }
  );

const tunnelsKey = (g: GameState) => g.tunnels.map((c) => `${c.r},${c.c}`).join(' ');

/** What a card did on the map in the step from `before` to `game`, as effects. */
export function cardEffectsOf(before: GameState, game: GameState): CardEffect[] {
  const step = lastLogId(game);
  const out: CardEffect[] = [];
  const head = before.pending[0];
  const colorOf = (p: number) => game.players[p].color;
  const was = new Map(before.dice.map((d) => [d.id, d]));
  const used = cardsUsed(before, game);
  // Unveil the Fleet takes the player's mechs off the map as it is played (a Clever choice for each
  // may come before the unveil itself).
  const unveiling = used.has('unveil-the-fleet');

  for (const d of game.dice) {
    const p = was.get(d.id);
    if (!p) continue;
    const from = cellOf(p);
    const to = cellOf(d);
    const fx = { id: `${d.id}:${step}`, color: colorOf(d.owner), replaces: d.id };
    if (from && !to) {
      // Dangerous: both mechs go, joined by an arc (below).
      if (head?.kind === 'dangerous') continue;
      if (head?.kind === 'showOfForce') out.push({ kind: 'strike', ...fx, at: from, color: colorOf(head.player) });
      else if (used.has('resourceful')) out.push({ kind: 'implode', ...fx, at: from });
      else if (unveiling) out.push({ kind: 'cloak', ...fx, at: from });
    } else if (!from && to) {
      if (head?.kind === 'placeExpansion') out.push({ kind: 'expansion', ...fx, at: to });
      else if (head?.kind === 'unveil') out.push({ kind: 'decloak', ...fx, at: to });
    } else if (from && to) {
      if (d.value !== p.value && d.rolls === p.rolls && (head?.kind === 'clever' || used.has('flexible'))) {
        out.push({ kind: d.value > p.value ? 'raise' : 'lower', ...fx, at: to });
      }
    }
  }

  if (head?.kind === 'dangerous') {
    const att = was.get(head.attacker);
    const def = was.get(head.defender);
    const a = att && cellOf(att);
    const b = def && cellOf(def);
    const gone = (id: string) => !cellOf(game.dice.find((d) => d.id === id)!);
    if (a && b && gone(head.attacker) && gone(head.defender)) {
      out.push({ kind: 'arc', id: `dangerous:${step}`, at: b, to: a, color: colorOf(head.player) });
    }
  }

  if (game.tunnels.length === 2 && tunnelsKey(game) !== tunnelsKey(before)) {
    const [a, b] = game.tunnels;
    out.push({ kind: 'beam', id: `tunnels:${step}`, at: a, to: b, color: TUNNEL_COLOR });
    // A new pair closes the old one.
    before.tunnels.forEach((g, i) => {
      if (!game.tunnels.some((x) => same(x, g))) out.push({ kind: 'implode', id: `tunnel${i}:${step}`, at: g, color: TUNNEL_COLOR });
    });
  }
  return out;
}
