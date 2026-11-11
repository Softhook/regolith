import {
  tunnelPairs,
  attackChance,
  barrierAt,
  discoveryAt,
  canGainResearch,
  cellOf,
  claimCheck,
  distance,
  grid,
  hasSkill,
  hooksOf,
  movementRange,
  perimeterBlockers,
  perimeterSpaces,
  objectiveFreeSlots,
  rulesOf,
  salvageYard,
  mechReach,
  mechsByIndex,
  mechsOnBoard,
  skillLimit,
  type Die,
  type GameState,
  type Objective,
  type PlayerId,
  type MechReach,
} from '@regolith/engine';
import { skillValue } from './cardValues';
import { storedTacticsValue } from './strategicPlan';

/**
 * Position evaluation for levels 2 and up, in "cube points": one cube is worth CUBE.
 *
 * Unlike the level-1 heuristic it knows whose turn comes next, measures reach with real
 * paths (objectives and mechs block), values power as progress towards Take Over, and counts
 * what each player's mechs risk from the enemy mechs that can actually reach them.
 */

const CUBE = 1000;
const WIN = 1e6;

/** Value of each power level (index = power). Reaching 6 is Take Over, worth a cube. */
const POWER = [0, 0, 60, 150, 290, 500];
const MECH_ON_BOARD = 70;
const MECH_IN_SALVAGE_YARD = 30;
const ATOMIC = 40;
/** A card still to be taken at the end of this turn (a claim, or a Discovery). */
const CARD = 120;

/**
 * Share of a cube an objective is worth when claiming it takes this many actions from now
 * (the Claim action itself costs 2). Three actions fit in one turn, four or more need two.
 */
const PROGRESS: Record<number, number> = { 2: 0.8, 3: 0.45, 4: 0.28, 5: 0.18 };
/** Chance that a refit-based plan works out (about 1 in 5 per roll, two tries). */
const REFIT_ODDS = 0.4;
/** Share of a cube for a perimeter that makes up the whole target sum (less for part of it), on top of the plan. */
const PERIMETER_PROGRESS = 0.12;
/** Share of a cube for a mech two moves from an objective's perimeter; less the further it is (below one reacher's presence). */
const APPROACH = 0.024;
/** Chance of clearing an enemy mech from perimeter that none of mine can attack yet: it takes a move first. */
const UNREACHED_BLOCKER = 0.3;
/**
 * Ganging up: a rival this many cubes from winning (cubes left less their best objective's potential)
 * or closer costs extra, growing with the square of how close they are, so that stopping a rival
 * about to win can outweigh a cube of my own (the game ends before my cube counts). Only in full
 * for a rival half a cube or more closer to winning than me; one as far as me or further is left
 * to the race.
 */
const THREAT_RANGE = 2;
const THREAT = 0.5;

interface Ctx {
  s: GameState;
  /** The player who moves next: they act before anyone can react. */
  mover: PlayerId;
  /** Empty spaces each mech on the map can reach with one move (marked by board cell index, r * cols + c), by die id. */
  reach: Map<string, MechReach>;
  /** Chance each mech is destroyed by an enemy before its owner moves again, by die id. */
  kill: Map<string, number>;
  /** Expected cube points each player loses to attacks on their mechs. */
  exposure: number[];
  /** The mechs on the map by board cell index, and by player. */
  at: (Die | undefined)[];
  byPlayer: Die[][];
}

/**
 * Scores `s` for `me`: my value minus the strongest rival's (and a little of the others'), less
 * the threat of each rival close to winning. `mover` is who moves next, if not the usual (see
 * nextMover).
 */
export function evaluate(s: GameState, me: PlayerId, mover = nextMover(s, me)): number {
  if (s.phase === 'over') return s.winner === me ? WIN : -WIN;
  const ctx = context(s, mover);
  const scores = s.players.map((p) => playerScore(ctx, p.id));
  const rivals = scores.filter((_, i) => i !== me);
  const top = Math.max(...rivals.map((x) => x.value));
  const rest = rivals.reduce((a, x) => a + x.value, 0) - top;
  const threat = rivals.reduce((a, x) => a + threatOf(x.left, scores[me].left), 0);
  return scores[me].value - top - 0.25 * rest - threat;
}

/** How much a rival `left` cubes from winning costs on top of their value, when I am `mine` from it. */
function threatOf(left: number, mine: number): number {
  if (left >= THREAT_RANGE) return 0;
  const closer = Math.min(1, Math.max(0, mine - left + 0.5));
  return CUBE * THREAT * (THREAT_RANGE - left) ** 2 * closer;
}

/**
 * Who moves next, from the evaluating player's point of view. A position in my own turn is
 * scored as if I end my turn now (the search decides whether to do more first).
 */
function nextMover(s: GameState, me: PlayerId): PlayerId {
  const t = s.turn;
  if (t.phase === 'actions' && t.player !== me) return t.player;
  if (s.players[t.player].bonusTurns.length) return t.player;
  return t.resume ?? (t.player + 1) % s.players.length;
}

function context(s: GameState, mover: PlayerId): Ctx {
  const mechs = mechsOnBoard(s);
  const at = mechsByIndex(s);
  const byPlayer: Die[][] = s.players.map(() => []);
  for (const d of mechs) byPlayer[d.owner].push(d);
  const reach = new Map<string, MechReach>();
  const kill = new Map<string, number>();
  const exposure = s.players.map(() => 0);
  for (const d of mechs) {
    const opts = mechReach(s, d, at);
    reach.set(d.id, opts);
    for (const target of opts.attacks) {
      // The next mover attacks first; later players only if the target is still there.
      const odds = attackChance(s, d, target) * (d.owner === mover ? 1 : 0.5);
      kill.set(target.id, Math.max(kill.get(target.id) ?? 0, odds));
    }
  }
  for (const d of mechs) {
    const k = kill.get(d.id) ?? 0;
    if (!k) continue;
    // Losing a mech costs the mech, a power step, and gives a rival one (maybe Take Over).
    const pl = s.players[d.owner];
    const attacker = strongestAttackerPower(s, d.owner);
    const loss = MECH_ON_BOARD - MECH_IN_SALVAGE_YARD + powerStep(pl.power - 1) + powerGain(attacker);
    exposure[d.owner] += k * loss * (d.owner === mover ? 0.3 : 0.75);
  }
  return { s, mover, reach, kill, exposure, at, byPlayer };
}

/** Value lost by dropping from `to + 1` to `to` power. */
function powerStep(to: number): number {
  return to < 1 || to >= 5 ? 0 : POWER[to + 1] - POWER[to];
}

/** Value gained by rising one step from `from` power; 5 → 6 is Take Over. */
function powerGain(from: number): number {
  return from >= 5 ? CUBE + POWER[1] - POWER[5] : POWER[from + 1] - POWER[from];
}

function strongestAttackerPower(s: GameState, victim: PlayerId): number {
  return Math.max(...s.players.filter((p) => p.id !== victim).map((p) => p.power));
}

/** Player p's value, and how many cubes they are from winning. */
function playerScore(ctx: Ctx, p: PlayerId): { value: number; left: number } {
  const { total, best } = claimPotential(ctx, p);
  return { value: playerValue(ctx, p) + total, left: Math.max(0, ctx.s.players[p].cubesLeft - best / CUBE) };
}

/** Player p's value, without claim potential. */
function playerValue(ctx: Ctx, p: PlayerId): number {
  const { s } = ctx;
  const pl = s.players[p];
  const cards = !!rulesOf(s).cards;
  let v = -pl.cubesLeft * CUBE;
  v += POWER[Math.min(pl.power, 5)];
  if (cards) {
    const at = discoveryAt(s, p);
    v += CARD * 0.7 * Math.min(1, (pl.research - 1) / Math.max(1, at - 1));
    if (s.turn.player === p && s.turn.phase === 'actions') v += s.turn.claims * CARD;
    // Cards already earned but taken later: an Take Over cube on another player's turn, or picks
    // carried into a Forced March turn.
    if (s.turn.phase === 'actions') v += (s.turn.offTurnCubes ?? []).filter((x) => x === p).length * CARD;
    v += (pl.carriedPicks ?? 0) * CARD;
  }
  // The best skills up to the limit (one over it is discarded at once).
  v += pl.skills
    .map((sk) => skillValue(sk.id))
    .sort((a, b) => b - a)
    .slice(0, skillLimit(s, p))
    .reduce((a, b) => a + b, 0);
  v += storedTacticsValue(s, p);
  v += pl.atomics * ATOMIC;
  v += ctx.byPlayer[p].length * MECH_ON_BOARD;
  v += salvageYard(s, p).length * MECH_IN_SALVAGE_YARD;
  v -= ctx.exposure[p];
  return v;
}

/** A combat won with the attacker's roll set to 1 by an atomic, against the defender's die. */
function atomicOdds(attacker: number, defender: number): number {
  let wins = 0;
  for (let y = 1; y <= 6; y++) if (1 + attacker <= defender + y) wins++;
  return wins / 6;
}

/**
 * Contested perimeter: the chance of clearing `blockers` from an objective's perimeter, and the attack actions it
 * takes. Each blocker needs a mech of its own, as a mech acts once a turn. A mech in `perimeter` (making
 * the sum) only counts where it attacks without leaving its space, next to the blocker or with its ability
 * (Shoot); an atomic left sets the attacker's roll to 1. A blocker none of mine can attack yet takes a
 * move first (UNREACHED_BLOCKER).
 */
function clearing(ctx: Ctx, p: PlayerId, blockers: Die[], perimeter: Die[]): { odds: number; actions: number } {
  const { s } = ctx;
  const g = grid(s.board);
  const index = (d: Die) => {
    const c = cellOf(d)!;
    return c.r * g.cols + c.c;
  };
  const used = new Set<string>();
  let atomics = s.players[p].atomics;
  let odds = 1;
  let actions = 0;
  for (const b of blockers) {
    let best = 0;
    let by: Die | undefined;
    let byAtomic = false;
    for (const d of ctx.byPlayer[p]) {
      if (used.has(d.id)) continue;
      const shoots = !!hooksOf(s, d)?.threatens?.(s, d).includes(b);
      const attacks = perimeter.includes(d) ? g.ortho[index(b)].includes(index(d)) : !!ctx.reach.get(d.id)?.attacks.includes(b);
      if (!shoots && !attacks) continue;
      const plain = attackChance(s, d, b);
      const fired = atomics > 0 ? atomicOdds(d.value, b.value) : 0;
      if (Math.max(plain, fired) > best) [best, by, byAtomic] = [Math.max(plain, fired), d, fired > plain];
    }
    if (by) {
      used.add(by.id);
      if (byAtomic) atomics--;
      odds *= best;
      actions += 1;
    } else {
      odds *= UNREACHED_BLOCKER;
      actions += 2;
    }
  }
  return { odds, actions };
}

/** The best objectives this player is working towards: best + a little of the next two (and the best alone). */
function claimPotential(ctx: Ctx, p: PlayerId): { total: number; best: number } {
  const values = ctx.s.board.objectives.map((objective) => objectivePotential(ctx, p, objective)).sort((a, b) => b - a);
  const best = values[0] ?? 0;
  return { total: best + 0.35 * (values[1] ?? 0) + 0.15 * (values[2] ?? 0), best };
}

function objectivePotential(ctx: Ctx, p: PlayerId, objective: Objective): number {
  const { s } = ctx;
  const full = objectiveFreeSlots(objective) <= 0;
  // A full objective is only open by over-claim, displacing an opponent's cube.
  if (full && (!rulesOf(s).overClaim || !objective.cubes.some((x) => x !== p))) return 0;
  // An objective with my cube is only open again through Entanglement.
  if (!full && objective.cubes.includes(p) && s.board.objectives.some((q) => objectiveFreeSlots(q) > 0 && !q.cubes.includes(p))) return 0;
  let check = claimCheck(s, p, objective.id);
  // An objective with room can also be over-claimed, if the perimeter already makes the 12.
  if (!check.ok && !full && rulesOf(s).overClaim) {
    const over = claimCheck(s, p, objective.id, true);
    if (over.ok) check = over;
  }
  const mover = ctx.mover === p;
  // The others move first: any perimeter mech they destroy breaks the sum.
  const safe = () => check.mechs.reduce((a, d) => a * (1 - (ctx.kill.get(d.id) ?? 0)), 1);
  const clear = clearing(ctx, p, perimeterBlockers(s, p, objective), check.mechs);
  if (check.blocked) {
    const value = CUBE * (PROGRESS[2 + clear.actions] ?? 0) * clear.odds;
    return mover ? value : value * (0.35 + 0.55 * safe());
  }

  if (check.ok) {
    // Still my turn with the actions to claim: nobody can stop it.
    const t = s.turn;
    if (t.player === p && t.phase === 'actions' && !s.pending.length && t.actionsLeft >= 2) return CUBE * 0.95;
    if (mover) return CUBE * PROGRESS[2];
    return CUBE * PROGRESS[2] * (0.35 + 0.55 * safe());
  }

  const { sum, target, mechs: onPerimeter } = check;
  const gap = target - sum;
  const { cols, space, cells } = grid(s.board);
  // A barrier (Regolith) holds its space for good: no mech can fly in.
  const empty = perimeterSpaces(s.board, objective)
    .filter((c) => !barrierAt(s, c))
    .map((c) => c.r * cols + c.c)
    .filter((i) => space[i] && !ctx.at[i]);
  const reaches = (d: Die) => empty.some((i) => ctx.reach.get(d.id)?.moves[i]);
  const outside = ctx.byPlayer[p].filter((d) => !onPerimeter.includes(d));
  const reachers = outside.filter(reaches);

  let best = 0;
  const option = (actions: number, odds = 1) => (best = Math.max(best, (PROGRESS[actions + clear.actions] ?? 0) * odds * clear.odds));
  // One mech of the right value flies in.
  if (reachers.some((d) => d.value === gap)) option(3);
  // One perimeter mech flies off and leaves the right sum.
  if (onPerimeter.some((d) => sum - d.value === target && (ctx.reach.get(d.id)?.count ?? 0) > 0)) option(3);
  // Refit a perimeter mech to the missing value.
  for (const d of onPerimeter) {
    const need = target - (sum - d.value);
    if (need >= 1 && need <= 6 && need !== d.value) option(3, REFIT_ODDS);
  }
  // Two mechs fly in to fill the gap.
  if (empty.length >= 2) {
    for (let i = 0; i < reachers.length; i++)
      for (let j = i + 1; j < reachers.length; j++) if (reachers[i].value + reachers[j].value === gap) option(4);
  }
  // Any mech flies in and is refitted to fit (one die covers a gap of at most 6).
  if (reachers.length && gap >= 1 && gap <= 6) option(4, REFIT_ODDS);
  // Two mechs fly in, one of them refitted to fit.
  if (empty.length >= 2 && reachers.length >= 2 && gap >= 2 && gap <= 12) option(5, REFIT_ODDS);
  // Science: research actions raise Research (one each) until the part above 1 covers how far the perimeter is off.
  if (hasSkill(s, p, 'science')) {
    const { research } = s.players[p];
    const steer = (off: number, moves: number) => {
      const need = Math.abs(off) + 1;
      const raise = Math.max(0, need - research);
      const actions = moves + raise + 2;
      if (need > rulesOf(s).researchLimit || (raise && !canGainResearch(s, p))) return;
      // A Discovery resets Research at the end of the turn, so Research that high has to be spent this turn.
      if (need < discoveryAt(s, p) || actions <= 3) option(actions);
    };
    steer(gap, 0);
    for (const d of reachers) steer(gap - d.value, 1);
  }

  // Presence: mechs that could join the perimeter are a start even without a plan yet.
  const presence = 0.015 * Math.min(reachers.length, 3);
  // Approach: an objective no mech reaches in one move is still worth heading for, a little more the
  // fewer moves it takes, so that a distant last objective doesn't leave every move scoring the same.
  // With PLANNING.walls the moves are counted around barriers (a walled-off objective draws nobody), and a
  // mech already on the perimeter doesn't stop the others heading there to finish the sum.
  let approach = 0;
  if ((PLANNING.walls || !onPerimeter.length) && !reachers.length && empty.length) {
    const steps = PLANNING.walls ? stepsTo(s, objective) : undefined;
    for (const d of outside) {
      const from = cellOf(d);
      if (!from) continue;
      const far = steps ? steps[from.r * cols + from.c] : Math.min(...empty.map((i) => distance(from, cells[i])));
      if (far < 0) continue;
      const moves = Math.ceil(far / Math.max(1, movementRange(s, d)));
      approach = Math.max(approach, APPROACH / Math.max(2, moves));
    }
  }
  // Progress: mechs already on the perimeter are part of the sum, worth more the more of it they make up.
  // A perimeter over the target has to shed mechs first, so it counts for nothing; with PLANNING.walls, so
  // does one nothing can finish (no plan, and no other mech that can get there), or a mech would sit in it for good.
  const finishable = !PLANNING.walls || best > 0 || reachers.length > 0 || approach > 0;
  const progress = gap > 0 && finishable ? PERIMETER_PROGRESS * (sum / target) : 0;
  const value = CUBE * (Math.max(best, presence, approach) + progress);
  return mover ? value : value * 0.8;
}

/** Whether planning counts barriers (stepsTo) and keeps heading for half-filled perimeters. Mutable for the self-play tests. */
export const PLANNING = { walls: true };

/** stepsTo's results, by board, then by where the barriers and tunnels are, then by objective id. */
const STEPS = new WeakMap<object, Map<string, Int16Array[]>>();

/**
 * Steps from every cell to the nearest perimeter space of `objective` that isn't a barrier, around barriers
 * and objectives and through a pair of Ice Tunnels; -1 where no path gets there. Mechs don't block: they move.
 */
function stepsTo(s: GameState, objective: Objective): Int16Array {
  const g = grid(s.board);
  let byWalls = STEPS.get(s.board.cells);
  if (!byWalls) STEPS.set(s.board.cells, (byWalls = new Map()));
  const walls = `${(s.barriers ?? []).map((b) => `${b.r},${b.c}`).join(';')}|${[...(s.wormhole ?? []), ...s.tunnels].map((c) => `${c.r},${c.c}`).join(';')}`;
  let fields = byWalls.get(walls);
  if (!fields) byWalls.set(walls, (fields = []));
  if (fields[objective.id]) return fields[objective.id];
  const blocked = new Uint8Array(g.size);
  for (const b of s.barriers ?? []) blocked[b.r * g.cols + b.c] = 1;
  const partner = new Map<number, number>();
  for (const [a, b] of tunnelPairs(s).map((p) => p.map((c) => c.r * g.cols + c.c))) partner.set(a, b).set(b, a);
  const steps = new Int16Array(g.size).fill(-1);
  const queue: number[] = [];
  for (const c of perimeterSpaces(s.board, objective)) {
    const i = c.r * g.cols + c.c;
    if (!blocked[i]) {
      steps[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const through = partner.get(cur);
    const next = through === undefined ? g.ortho[cur] : [...g.ortho[cur], through];
    for (const nb of next) {
      if (steps[nb] >= 0 || !g.space[nb] || blocked[nb]) continue;
      steps[nb] = steps[cur] + 1;
      queue.push(nb);
    }
  }
  return (fields[objective.id] = steps);
}

/** Player p's own value, without the rivals', scored as if p moves next (scripts/interaction.ts). */
export function valueOf(s: GameState, p: PlayerId): number {
  return playerScore(context(s, p), p).value;
}
