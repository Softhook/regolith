import type { GameState, PlayerId, PlayerState } from '@regolith/engine';
import { lastLogId } from '../game/useTransient';

/** The numbers a player's panel shows that a step can change: their tracks, then the chips under them. */
const NUMBERS = {
  dominance: (p) => p.dominance,
  research: (p) => p.research,
  missiles: (p) => p.missiles,
  planAhead: (p) => p.planAhead,
  penalty: (p) => p.actionPenalty,
  ambition: (p) => p.ambitionTokens,
} satisfies Record<string, (p: PlayerState) => number>;

type PanelNumber = keyof typeof NUMBERS;

/**
 * A moment's mark on a player's panel (PlayerList): one of its numbers going up or down (from `from` to
 * `to`), a card chip arriving (taken, stolen by Prideful, stored by Patient) or switched off (Ruthless),
 * or a skill gone (discarded, to Sabotage or the skill limit, or stolen), on the whole panel.
 */
export type PanelEffect = { id: string; player: PlayerId } & (
  | { spot: PanelNumber; kind: 'up' | 'down'; from: number; to: number }
  | { spot: `skill:${string}` | `stored:${string}`; kind: 'in' | 'off' }
  | { spot: 'skills'; kind: 'out' }
);

/** Long enough for a card flying from the market (CardFlight) to land on the chip it becomes. */
export const PANEL_EFFECT_MS = 900;

/** How many of each card a list holds, for telling a new copy from an old one. */
const counts = (ids: readonly string[]) => ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());

/** What the step from `before` to `game` changed on each player's panel, as effects. */
export function panelEffectsOf(before: GameState, game: GameState): PanelEffect[] {
  const step = lastLogId(game);
  const out: PanelEffect[] = [];
  for (const p of game.players) {
    const was = before.players[p.id];
    const fx = (spot: string) => ({ id: `${p.id}:${spot}:${step}`, player: p.id });
    for (const [spot, of] of Object.entries(NUMBERS) as [PanelNumber, (p: PlayerState) => number][]) {
      const from = of(was);
      const to = of(p);
      // Plan Ahead counts down at each turn's end on its own: only its start is news.
      if (to === from || (spot === 'planAhead' && from > 0)) continue;
      out.push({ ...fx(spot), spot, kind: to > from ? 'up' : 'down', from, to });
    }
    const had = counts(was.skills.map((s) => s.id));
    for (const s of p.skills) {
      const n = had.get(s.id) ?? 0;
      if (n === 0) {
        out.push({ ...fx(`skill:${s.id}`), spot: `skill:${s.id}`, kind: 'in' });
        continue;
      }
      had.set(s.id, n - 1);
      const old = was.skills.find((x) => x.id === s.id);
      if (old?.disabledUntil === undefined && s.disabledUntil !== undefined) {
        out.push({ ...fx(`off:${s.id}`), spot: `skill:${s.id}`, kind: 'off' });
      }
    }
    if ([...had.values()].some((n) => n > 0)) out.push({ ...fx('skills'), spot: 'skills', kind: 'out' });
    const stored = counts(was.storedTactics ?? []);
    for (const id of p.storedTactics ?? []) {
      const n = stored.get(id) ?? 0;
      if (n > 0) stored.set(id, n - 1);
      else out.push({ ...fx(`stored:${id}`), spot: `stored:${id}`, kind: 'in' });
    }
  }
  return out;
}
