/** Cubes: claiming an objective, Take Over, and the home objective. */
import { objectiveFreeSlots, perimeterSpaces } from '../board';
import { dieAt } from '../lookups';
import { rulesOf } from '../rules';
import { skillRules } from '../skillRules';
import type { Cell, Die, GameState, Objective, PlayerId } from '../types';

export interface ClaimCheck {
  ok: boolean;
  sum: number;
  target: number;
  mechs: Die[];
  reason?: string;
  /** Over-claim: owners whose cube may be displaced. */
  replace?: PlayerId[];
  /** Contested perimeter: the mechs make the sum, but opponents' mechs on the perimeter stop the claim. */
  blocked?: boolean;
  /** Research the claim spends to move the sum onto the target (Science). */
  research?: number;
}

/** The player's home objective: their starting objective, unless their cube there has left (`cubeLeft`). */
export function homeObjective(state: GameState, player: PlayerId): Objective | undefined {
  const id = state.players[player].home;
  return id === undefined ? undefined : state.board.objectives[id];
}

/** Contested perimeter (PROTOTYPING.md §6.8): opponents' mechs in the objective's perimeter positions, which stop `player` claiming it. */
export function perimeterBlockers(state: GameState, player: PlayerId, objective: Objective): Die[] {
  return perimeterSpaces(state.board, objective)
    .map((p) => dieAt(state, p))
    .filter((d): d is Die => !!d && d.owner !== player);
}

/** The perimeter sum that displaces an opponent's cube, on any objective (PROTOTYPING.md §6.10). */
const OVER_CLAIM_TARGET = 12;

/**
 * Whether `player` may claim the objective. With `displace` (over-claim), the check is for taking
 * the place of an opponent's cube at a sum of 12 whatever the objective; on a full objective that is the only way.
 */
export function claimCheck(state: GameState, player: PlayerId, objectiveId: number, displace = false): ClaimCheck {
  const objective = state.board.objectives[objectiveId];
  const own = objective.cubes.filter((x) => x === player).length;
  let target = objective.number;
  const fail = (reason: string, mechs: Die[] = [], sum = 0): ClaimCheck => ({
    ok: false,
    sum,
    target,
    mechs,
    reason,
  });

  let replace: PlayerId[] | undefined;
  if (objectiveFreeSlots(objective) <= 0 || displace) {
    if (!rulesOf(state).overClaim) return fail('No empty cube location');
    replace = [...new Set(objective.cubes.filter((x) => x !== player))];
    if (!replace.length) return fail('No opponent cube to displace');
    target = OVER_CLAIM_TARGET;
  } else if (own > 0) {
    // Entanglement: only once you hold every objective that still has room.
    const blocked = state.board.objectives.some((p) => objectiveFreeSlots(p) > 0 && !p.cubes.includes(player));
    if (blocked) return fail('You already have a cube here');
    target += 3 * own;
  }

  const rules = skillRules(state, player).flatMap((r) => (r.claim ? [r.claim] : []));
  const mine = (spaces: readonly Cell[]) => spaces.map((p) => dieAt(state, p)).filter((d): d is Die => !!d && d.owner === player);
  const all = mine(perimeterSpaces(state.board, objective));
  const total = (mechs: Die[]) => mechs.reduce((a, d) => a + d.value, 0);
  // Contested perimeter: named in every refusal, though the sum is checked first, so a blocked perimeter still says how far it is from it.
  const blockers = perimeterBlockers(state, player, objective);
  const blockade = blockers.length ? `; enemy mechs on the perimeter block it too (${blockers.map((d) => d.value).join(', ')})` : '';
  if (!all.length) return fail(`No mechs on the perimeter${blockade}`, all, 0);

  const p = state.players[player];
  const tolerance = Math.max(0, ...rules.map((r) => r.tolerance ?? 0));
  // Science: Research above 1 (the die's lowest face) moves the sum up or down, as little as needed.
  const spendable = rules.some((r) => r.spendResearch) ? Math.max(0, p.research - 1) : 0;
  // Every perimeter mech counts.
  const sum = total(all);
  const ctx = { sum, mechs: all, power: p.power, research: p.research };
  const sums = [sum, ...rules.flatMap((r) => r.sums?.(ctx) ?? [])];
  const research = Math.min(...sums.map((s) => Math.max(0, Math.abs(s - target) - tolerance)));
  if (research <= spendable) {
    if (blockers.length)
      return { ...fail(`Enemy mechs on the perimeter block it (${blockers.map((d) => d.value).join(', ')})`, all, sum), blocked: true };
    return { ok: true, sum, target, mechs: all, replace, ...(research && { research }) };
  }
  return fail(`Perimeter totals ${sum}, needs ${target}${blockade}`, all, sum);
}

/** Any objective without your cube; if none has room, Entanglement allows your own objectives. */
export function takeOverTargets(state: GameState, player: PlayerId): Objective[] {
  const open = state.board.objectives.filter((p) => objectiveFreeSlots(p) > 0);
  const fresh = open.filter((p) => !p.cubes.includes(player));
  return fresh.length ? fresh : open;
}
