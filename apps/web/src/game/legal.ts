import { legalActions, type Action, type ActionOf, type GameState } from '@regolith/engine';

/**
 * The legal actions of a state, indexed by type. The UI enables a button or highlights a space
 * only when a matching action is here, so it never re-implements a rule: whatever the engine
 * offers is clickable, and nothing else is.
 */
export interface Legal {
  of<K extends Action['type']>(type: K, where?: (a: ActionOf<K>) => boolean): ActionOf<K>[];
  can<K extends Action['type']>(type: K, where?: (a: ActionOf<K>) => boolean): boolean;
}

function legalIndex(actions: Action[]): Legal {
  const byType = new Map<Action['type'], Action[]>();
  for (const a of actions) {
    const list = byType.get(a.type);
    if (list) list.push(a);
    else byType.set(a.type, [a]);
  }
  const of = <K extends Action['type']>(type: K, where?: (a: ActionOf<K>) => boolean): ActionOf<K>[] => {
    const list = (byType.get(type) ?? []) as ActionOf<K>[];
    return where ? list.filter(where) : list;
  };
  return {
    of,
    can: (type, where) => (where ? of(type).some(where) : (byType.get(type)?.length ?? 0) > 0),
  };
}

export const NO_LEGAL: Legal = legalIndex([]);

/** Every legal action, Behemoth carries included. */
export function legalFor(game: GameState): Legal {
  return legalIndex(legalActions(game, { includeCarry: true }));
}

/**
 * What a tap on an objective does about claiming it: its one way to be claimed, `choose` when there
 * are several (an empty place, or over-claim displacing one of several opponents' cubes: the
 * player chooses, ClaimChoice), or null when it can't be claimed.
 */
export function claimTap(legal: Legal, objective: number): Action | 'choose' | null {
  const options = claimOptions(legal, objective);
  return options.length > 1 ? 'choose' : (options[0] ?? null);
}

/** The ways to claim `objective`. */
export function claimOptions(legal: Legal, objective: number): ActionOf<'claim'>[] {
  return legal.of('claim', (a) => a.objective === objective);
}
