import {
  actor,
  attackOdds,
  cellOf,
  conquerCheck,
  die,
  dieAt,
  distance,
  isEmptySpace,
  legalActions,
  movementRange,
  mulberry32,
  orbitals,
  planetFreeSlots,
  rulesOf,
  shipOf,
  shipsOnBoard,
  tryApply,
  type Action,
  type GameState,
  type Pending,
  type PlayerId,
} from '@regolith/engine';
import { shuffleUnseen } from './hidden';
import { candidates } from './candidates';
import { storedTactics } from './patient';

/**
 * Level 1 (Cadet): greedy one-ply search. Every legal action is simulated (dice outcomes are
 * sampled with a fresh random seed, so the AI never sees the game's real RNG; the decks are
 * shuffled, so it never sees their real order either), the resulting position is scored with a
 * heuristic, and the best action wins.
 *
 * Kept as it was first written: it is the weakest level, and the golden tests replay it.
 * Its known weaknesses (one action at a time, few noisy samples, no idea of the opponent's
 * next turn) are what the higher levels in search.ts fix.
 */

const RANDOM_ACTIONS = new Set<Action['type']>(['attack', 'power', 'freeAttack', 'reconfigure', 'resourceful', 'takeCard', 'peekChoice']);

export interface GreedyOptions {
  /** Samples per random action. Higher is stronger and slower. */
  samples?: number;
  /** 0 = always best move, higher = more random (easier). */
  noise?: number;
  random?: () => number;
}

export function chooseAction(state: GameState, opts: GreedyOptions = {}): Action | null {
  const me = actor(state);
  const head = state.pending[0];
  if (head?.kind === 'combat') return { type: 'resolveCombat' };
  const options = candidates(state);
  if (!options.length) return null;
  if (options.length === 1) return options[0];
  return best(hidden(state), me, options, opts);
}

/**
 * The position as the player knows it: the unseen cards shuffled and the game's RNG replaced. Both
 * come from a generator of its own, seeded from the position, rather than `opts.random`: the AI's
 * random stream, and so every seeded replay of level 1 (the golden tests), stays as it was before
 * the decks were hidden. Only the decks change, so only they are copied.
 */
function hidden(state: GameState): GameState {
  const random = mulberry32((state.rng ^ 0x9e3779b9) >>> 0);
  const { market } = state;
  const s = { ...state, market: { ...market, skillDeck: [...market.skillDeck], tacticDeck: [...market.tacticDeck] } };
  shuffleUnseen(s, random);
  return withRandomSeed(s, random);
}

/**
 * Should `player` fire a missile into the current combat? The combat dice are already rolled, so who
 * wins is exact; what follows (re-rolled ships, cards drawn) is played on the hidden position.
 */
export function chooseMissile(real: GameState, player: PlayerId): Action | null {
  const head = real.pending[0];
  if (head?.kind !== 'combat' || real.players[player].missiles <= 0) return null;
  const state = hidden(real);
  const options: Action[] = [
    { type: 'missile', by: player, side: 'attacker' },
    { type: 'missile', by: player, side: 'defender' },
  ];
  const baseline = scoreAfter(state, player, { type: 'resolveCombat' });
  let pick: Action | null = null;
  let top = baseline + 15; // a missile is worth keeping unless it clearly helps
  for (const a of options) {
    const s = tryApply(state, a);
    if (!s) continue;
    const v = scoreAfter(s, player, { type: 'resolveCombat' });
    if (v > top) {
      top = v;
      pick = a;
    }
  }
  return pick;
}

function best(state: GameState, me: PlayerId, candidates: Action[], opts: GreedyOptions): Action {
  const rand = opts.random ?? Math.random;
  const samples = opts.samples ?? 3;
  let top = -Infinity;
  let pick = candidates[0];
  for (const a of candidates) {
    const n = RANDOM_ACTIONS.has(a.type) ? samples : 1;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const sim = withRandomSeed(state, rand);
      total += scoreAfter(sim, me, a);
    }
    const v = total / n + (opts.noise ? (rand() - 0.5) * opts.noise : 0) + tieBreak(state, a);
    if (v > top) {
      top = v;
      pick = a;
    }
  }
  return pick;
}

/** Small preferences so equal-scoring actions resolve sensibly. */
function tieBreak(s: GameState, a: Action): number {
  if (a.type === 'endTurn') return -0.5;
  // Free abilities must actually improve the position, not just shuffle ships around.
  if (a.type === 'swap' || a.type === 'change' || a.type === 'flexible') return -2;
  // Regolith's Barrier is there for good: only where it clearly helps.
  if (a.type === 'power' && shipOf(s, die(s, a.die).value).ability?.name === 'Barrier') return -8;
  if (a.type === 'advance' && a.move) return 0.2;
  if (a.type === 'ruthless' && a.skill) return 0.5;
  if (a.type === 'prideful' && a.take) return 0.5;
  return 0;
}

function withRandomSeed(state: GameState, rand: () => number): GameState {
  return { ...state, rng: Math.floor(rand() * 2 ** 32) >>> 0 };
}

/** Scores the position after `a`. An illegal action scores -Infinity; an engine crash propagates. */
function scoreAfter(state: GameState, me: PlayerId, a: Action): number {
  const s = tryApply(state, a);
  if (!s) return -Infinity;
  return score(playOutDecisions(s, me), me);
}

/** Resolves follow-up decisions with a quick default policy so the position can be scored. */
function playOutDecisions(state: GameState, me: PlayerId): GameState {
  let s = state;
  for (let i = 0; i < 12 && s.pending.length && s.phase !== 'over'; i++) {
    const head = s.pending[0];
    if (head.kind === 'setupRoll' || head.kind === 'skillDraft' || head.kind === 'placeStart' || head.kind === 'placeShips') break;
    const a = quickPolicy(s, me);
    const next = a && tryApply(s, a);
    if (!next) break;
    s = next;
  }
  return s;
}

/** The follow-up option `quickPolicy` prefers for each kind of decision; otherwise the first legal one. */
const PREFERRED: { [K in Pending['kind']]?: (a: Action, s: GameState, me: PlayerId) => boolean } = {
  showOfForce: (a, s, me) => a.type === 'showOfForce' && die(s, a.die).owner !== me,
  kineticShunt: (a, s, me) => a.type === 'kineticShunt' && die(s, a.die).owner !== me,
  takeCard: (a) => a.type === 'takeCard' && a.deck === 'expansion',
  patientTactic: (a) => a.type === 'patientTactic' && a.index !== undefined,
  unveil: (a) => a.type === 'unveilDeploy',
  placeExpansion: (a) => a.type === 'placeExpansion' && !!a.to,
  ruthless: (a) => a.type === 'ruthless' && !!a.skill,
  prideful: (a) => a.type === 'prideful' && a.take,
};

function quickPolicy(s: GameState, me: PlayerId): Action | null {
  const head = s.pending[0];
  if (!head) return null;
  if (head.kind === 'combat') return { type: 'resolveCombat' };
  if (head.kind === 'peek') return { type: 'peekChoice', takeTop: false };
  const options = legalActions(s);
  const prefer = PREFERRED[head.kind];
  return (prefer && options.find((a) => prefer(a, s, me))) ?? options[0] ?? null;
}

// ---------------------------------------------------------------------------
// Evaluation

const SKILL_VALUE = 60;
/** A Tactic stored with Patient: worth keeping when playing it now would gain less. */
const STORED_TACTIC_VALUE = 30;

function score(s: GameState, me: PlayerId): number {
  if (s.phase === 'over') return s.winner === me ? 1e6 : -1e6;
  const mine = playerValue(s, me, true);
  let rival = 0;
  for (const p of s.players) if (p.id !== me) rival = Math.max(rival, playerValue(s, p.id, false));
  return mine - 0.7 * rival;
}

function playerValue(s: GameState, p: PlayerId, detailed: boolean): number {
  const pl = s.players[p];
  let v = -pl.cubesLeft * 1000;
  v += pl.dominance * pl.dominance * 6;
  v += pl.research * 14;
  v += pl.missiles * 25;
  v += Math.min(pl.skills.filter((sk) => sk.active).length, 5) * SKILL_VALUE;
  v += storedTactics(s, p) * STORED_TACTIC_VALUE;
  for (const d of s.dice) {
    if (d.owner !== p) continue;
    if (d.loc.zone === 'board') v += 40;
    else if (d.loc.zone === 'scrapyard') v += 15;
  }
  v += conquerPotential(s, p);
  if (detailed) v -= danger(s, p);
  return v;
}

function conquerPotential(s: GameState, p: PlayerId): number {
  const values: number[] = [];
  const myShips = shipsOnBoard(s, p);
  for (const planet of s.board.planets) {
    const full = planetFreeSlots(planet) <= 0;
    if (full ? !rulesOf(s).overConquest || !planet.cubes.some((x) => x !== p) : planet.cubes.includes(p)) continue;
    const slots = orbitals(s.board, planet);
    const inOrbit = slots.map((c) => dieAt(s, c)).filter((d) => d && d.owner === p);
    const sum = inOrbit.reduce((a, d) => a + d!.value, 0);
    const empty = slots.filter((c) => isEmptySpace(s, c)).length;
    const target = full ? 12 : planet.number;
    let v: number;
    const check = conquerCheck(s, p, planet.id);
    if (check.ok || (!full && conquerCheck(s, p, planet.id, true).ok)) v = 320;
    // Contested orbit: the sum is made, but enemy ships in orbit have to be destroyed first.
    else if (check.blocked) v = 100;
    else if (sum < target && empty > 0 && target - sum <= 6) v = 40 + 30 * inOrbit.length;
    else if (sum < target) v = 12 * inOrbit.length;
    else v = Math.max(0, 8 * inOrbit.length - (sum - target) * 6);
    // Ships that could reach an empty orbital slot next turn.
    if (empty > 0) {
      for (const d of myShips) {
        if (inOrbit.includes(d)) continue;
        const c = cellOf(d)!;
        const near = slots.some((q) => isEmptySpace(s, q) && distance(q, c, s.board) <= movementRange(s, d));
        if (near) v += 6;
      }
    }
    values.push(v);
  }
  values.sort((a, b) => b - a);
  return (values[0] ?? 0) + 0.3 * (values[1] ?? 0);
}

/** Expected loss from enemy ships that could attack ours next turn (rough reach estimate). */
function danger(s: GameState, p: PlayerId): number {
  let total = 0;
  const enemies = s.dice.filter((d) => d.loc.zone === 'board' && d.owner !== p);
  for (const mine of shipsOnBoard(s, p)) {
    const c = cellOf(mine)!;
    let worst = 0;
    for (const e of enemies) {
      const dist = distance(cellOf(e)!, c, s.board);
      if (dist <= movementRange(s, e) + 1 && dist > 0) worst = Math.max(worst, attackOdds(e.value, mine.value));
    }
    total += worst * 45;
  }
  return total;
}
