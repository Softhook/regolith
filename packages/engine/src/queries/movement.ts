/** Movement: where a mech can go with a move, the way it flies there, what it can attack, and the abilities and skills that move mechs. */
import { adjacent, cellAt, grid, key, stepNeighbours, tunnelPairs, type Grid } from '../board';
import { barrierAt, cellOf, die, dieAt, isEmptySpace } from '../lookups';
import { hooksOf, modeHasHook } from '../rules';
import { anySkill, skillRules } from '../skillRules';
import type { Barrier, Cell, Die, GameState, PlayerId } from '../types';
import { attackChance } from './combat';

/** How far a mech moves: the 1 moves 1, every other mech MAX_MOVEMENT (ruling 2026-11-12, from 2026-10-08's cap of 3, PROTOTYPING.md §2). */
export const MAX_MOVEMENT = 3;

/** A mech's movement before skills: 1 for the 1, MAX_MOVEMENT for the rest (the 2 too, since 2026-11-12). */
export function baseMovement(value: number): number {
  return value === 1 ? 1 : MAX_MOVEMENT;
}

/** baseMovement, plus skill bonuses. */
export function movementRange(state: GameState, d: Die): number {
  const base = baseMovement(d.value);
  return base + skillRules(state, d.owner).reduce((n, r) => n + (r.movement ?? 0), 0);
}

/**
 * Spaces where `mover`'s mechs must stop, by board cell index (`at` is mechsByIndex): around enemy
 * mechs with `stopsEnemies` (an ability, MechHooks). Undefined when nothing stops them, so plain searches stay plain.
 * Sneak ignores them: it slips past enemy mechs (ruling 2026-10-12).
 */
export function stopZone(state: GameState, mover: PlayerId, at: (Die | undefined)[]): Uint8Array | undefined {
  if (!modeHasHook(state, 'stopsEnemies') || anySkill(state, mover, (r) => r.moveThroughEnemies)) return undefined;
  let zone: Uint8Array | undefined;
  for (let i = 0; i < at.length; i++) {
    const d = at[i];
    const stops = d && d.owner !== mover ? hooksOf(state, d)?.stopsEnemies : undefined;
    if (!stops) continue;
    zone ??= new Uint8Array(grid(state.board).size);
    for (const nb of stops(state, d!, i)) zone[nb] = 1;
  }
  return zone;
}

export interface MoveOptions {
  /** Reachable empty spaces, keyed by "r,c". */
  moves: Map<string, { cell: Cell; steps: number }>;
  /**
   * Attackable enemy dice, keyed by die id: every space the attack may be launched from (`launches`,
   * nearest first; the attacker chooses), and the first of them.
   */
  attacks: Map<string, AttackLaunch & { launches: AttackLaunch[] }>;
}

/** A space to attack from, and the target's space. */
export interface AttackLaunch {
  from: Cell;
  at: Cell;
}

/**
 * Spaces a mech can reach within `range` steps, with the fewest steps to each, by board cell index
 * (see board.ts grid): this runs for every mech in every position the AI scores. `found` lists
 * them in the order they were first reached, the start first. `ignore` lists occupied spaces
 * treated as empty. With `through` (Sneak), the mech may pass through that player's enemies'
 * mechs at no cost; such spaces are marked in `passing`, as it can't stop there. The search doesn't
 * go on from a space in `zone` (stopZone), other than the start.
 */
function reach(
  state: GameState,
  start: Cell,
  range: number,
  ignore: Cell[] = [],
  through?: PlayerId,
  at = mechsByIndex(state),
  zone?: Uint8Array,
) {
  const g = grid(state.board);
  const ignored = ignore.map((p) => p.r * g.cols + p.c);
  const steps = new Int32Array(g.size).fill(-1);
  const passing = new Uint8Array(g.size);
  const from = start.r * g.cols + start.c;
  const found: number[] = [from];
  steps[from] = 0;
  const tunnel = tunnels(state, g);
  const near = g.ortho;
  const walls = barrierMask(state, g);
  /** 0 = blocked, 1 = free, 2 = passed through (Sneak). */
  const entry = (i: number): number => {
    if (!g.space[i] || walls?.[i]) return 0;
    const d = at[i];
    if (!d || (ignored.length && ignored.includes(i))) return 1;
    return through !== undefined && d.owner !== through ? 2 : 0;
  };
  // 0-1 breadth-first search: free passes go to the front of the queue. Without them it is a plain BFS.
  const queue: number[] = [from];
  let head = 0;
  const visit = (cur: number, nb: number) => {
    const kind = entry(nb);
    if (!kind) return;
    const cost = steps[cur] + (kind === 2 ? 0 : 1);
    if (steps[nb] >= 0 && steps[nb] <= cost) return;
    if (steps[nb] < 0) found.push(nb);
    steps[nb] = cost;
    passing[nb] = kind === 2 ? 1 : 0;
    if (kind === 2) {
      if (head > 0) queue[--head] = nb;
      else queue.unshift(nb);
    } else queue.push(nb);
  };
  while (head < queue.length) {
    const cur = queue[head++];
    if (steps[cur] >= range || (zone?.[cur] && cur !== from)) continue;
    for (const nb of near[cur]) visit(cur, nb);
    const partner = tunnel(cur);
    if (partner >= 0) visit(cur, partner);
  }
  return { found, steps, passing };
}

const BARRIER_MASKS = new WeakMap<readonly Barrier[], Uint8Array>();

/**
 * 1 on each space with a barrier (GameState.barriers), by board cell index; undefined when there are none.
 * Cached by the list, which a state keeps until a barrier is added: the AI asks for it for every mech it moves.
 */
function barrierMask(state: GameState, g: Grid): Uint8Array | undefined {
  const { barriers } = state;
  if (!barriers?.length) return undefined;
  let mask = BARRIER_MASKS.get(barriers);
  if (!mask) {
    mask = new Uint8Array(g.size);
    for (const b of barriers) mask[b.r * g.cols + b.c] = 1;
    BARRIER_MASKS.set(barriers, mask);
  }
  return mask;
}

/** The cell indexes of the linked pairs, wormhole then Ice Tunnel, -1s where one isn't placed (see board.ts stepNeighbours). */
function tunnelIndexes(state: GameState, g: Grid): [number, number, number, number] {
  const out: number[] = [-1, -1, -1, -1];
  tunnelPairs(state).forEach((pair, i) => pair.forEach((c, k) => (out[2 * i + k] = c.r * g.cols + c.c)));
  return out as [number, number, number, number];
}

/** The Ice Tunnel partner of a cell index, or -1. */
function tunnels(state: GameState, g: Grid): (i: number) => number {
  const [a, b, c, d] = tunnelIndexes(state, g);
  return (i) => (i === a ? b : i === b ? a : i === c ? d : i === d ? c : -1);
}

export function canMoveDie(state: GameState, d: Die): boolean {
  return d.loc.zone === 'board' && ((state.turn.moved[d.id] ?? 0) === 0 || anySkill(state, d.owner, (r) => r.moveRepeatedly));
}

export function moveOptions(state: GameState, dieId: string): MoveOptions {
  const { cells } = grid(state.board);
  const { moves, attacks } = moveIndexes(state, dieId);
  const result: MoveOptions = { moves: new Map(), attacks: new Map() };
  for (const [i, m] of moves) result.moves.set(key(cells[i]), { cell: cells[i], ...m });
  for (const [id, list] of attacks) {
    const launches = list.map((x) => ({ from: cells[x.from], at: cells[x.at] }));
    result.attacks.set(id, { ...launches[0], launches });
  }
  return result;
}

/**
 * The spaces worth choosing between to attack `target` from (moveOptions launches), nearest first:
 * the nearest of each outcome. Where the attack goes in from is where a repelled mech, or a winner
 * that stays, ends up, so spaces differ when the chance to win, the objectives it would perimeter or the mechs
 * next to it (zones of control, support; through an Ice Tunnel too) differ.
 */
export function attackLaunches(state: GameState, dieId: string, target: string, opts = moveOptions(state, dieId)): AttackLaunch[] {
  const launches = opts.attacks.get(target)?.launches ?? [];
  if (launches.length < 2) return launches;
  const attacker = die(state, dieId);
  const defender = die(state, target);
  const g = grid(state.board);
  const at = mechsByIndex(state);
  const tunnel = tunnels(state, g);
  const seen = new Set<string>();
  return launches.filter(({ from }) => {
    const i = from.r * g.cols + from.c;
    const near: string[] = [];
    for (const p of g.ortho[i]) {
      const objective = cellAt(state.board, g.cells[p])?.objective;
      if (objective !== undefined) near.push(`objective ${objective}`);
    }
    for (const p of [...g.ortho[i], tunnel(i)]) {
      const mech = at[p];
      if (mech && mech !== attacker && mech !== defender) near.push(mech.id);
    }
    const outcome = [attackChance(state, attacker, defender, from), ...near.sort()].join();
    if (seen.has(outcome)) return false;
    seen.add(outcome);
    return true;
  });
}

/**
 * The way a mech flies to `to` with a plain move (a destination in moveOptions, or the space an
 * attack goes in from), its own space first: one of the shortest, with as few turns as it can.
 * Each space is next to the one before
 * it, across a joined edge of the map or through an Ice Tunnel. Empty if the mech can't get there.
 */
export function movePath(state: GameState, dieId: string, to: Cell): Cell[] {
  const d = die(state, dieId);
  const start = cellOf(d);
  if (!start) return [];
  const at = mechsByIndex(state);
  const through = anySkill(state, d.owner, (r) => r.moveThroughEnemies) ? d.owner : undefined;
  const zone = stopZone(state, d.owner, at);
  const range = movementRange(state, d);
  const { steps, passing } = reach(state, start, range, [], through, at, zone);
  const g = grid(state.board);
  const tunnel = tunnels(state, g);
  const near = g.ortho;
  const from = start.r * g.cols + start.c;
  const path = [to.r * g.cols + to.c];
  if (steps[path[0]] < 0 || passing[path[0]]) return [];
  // Back from `to`, over spaces one step nearer the start (or as near, passed through for free), the
  // straight one first; back up from a dead end, which only a free pass can lead into.
  const back = (cur: number, next: number): boolean => {
    if (cur === from) return true;
    const before = [...near[cur], tunnel(cur)].filter(
      // A space the search went on from: reached, with movement left, and not in a zone of control.
      (p) =>
        p >= 0 &&
        steps[p] >= 0 &&
        steps[p] < range &&
        steps[p] + (passing[cur] ? 0 : 1) === steps[cur] &&
        (p === from || !zone?.[p]) &&
        !path.includes(p),
    );
    if (next >= 0) before.sort((a, b) => Number(b - cur === cur - next) - Number(a - cur === cur - next));
    for (const p of before) {
      path.push(p);
      if (back(p, cur)) return true;
      path.pop();
    }
    return false;
  };
  return back(path[0], -1) ? path.reverse().map((i) => g.cells[i]) : [];
}

/** The mechs on the map by board cell index (see board.ts grid), for moveIndexes. */
export function mechsByIndex(state: GameState): (Die | undefined)[] {
  const cols = state.board.cols;
  const at: (Die | undefined)[] = [];
  for (const d of state.dice) if (d.loc.zone === 'board') at[d.loc.r * cols + d.loc.c] = d;
  return at;
}

/**
 * moveOptions by board cell index (see board.ts grid), for code that asks about many mechs and positions: the AI.
 * It may pass the mech itself and `at` (mechsByIndex), to look them up once for all mechs. Each
 * attack lists every space it may be launched from, nearest first.
 */
export function moveIndexes(state: GameState, mech: string | Die, at = mechsByIndex(state)) {
  const d = typeof mech === 'string' ? die(state, mech) : mech;
  const result = {
    moves: new Map<number, { steps: number }>(),
    attacks: new Map<string, { from: number; at: number }[]>(),
  };
  const start = cellOf(d);
  if (!start) return result;
  const range = movementRange(state, d);
  const zone = stopZone(state, d.owner, at);

  // Sneak: normal moves only, not Carry & Move or the Advance step (RULES.md ruling 8).
  const through = anySkill(state, d.owner, (r) => r.moveThroughEnemies) ? d.owner : undefined;
  const g = grid(state.board);
  const tunnel = tunnels(state, g);
  const { found, steps, passing } = reach(state, start, range, [], through, at, zone);
  for (const i of found) {
    if (steps[i] === 0 || passing[i]) continue;
    result.moves.set(i, { steps: steps[i] });
  }
  const attack = (from: number, nb: number) => {
    const target = at[nb];
    if (!target || target.owner === d.owner) return;
    const launches = result.attacks.get(target.id);
    if (!launches) result.attacks.set(target.id, [{ from, at: nb }]);
    else if (!launches.some((x) => x.from === from)) launches.push({ from, at: nb });
  };
  for (const i of found) {
    if (steps[i] >= range || passing[i]) continue;
    for (const nb of g.ortho[i]) attack(i, nb);
    const partner = tunnel(i);
    if (partner >= 0) attack(i, partner);
  }
  return result;
}

export interface MechReach {
  /** 1 on each empty space one move reaches, by board cell index (see board.ts grid). */
  moves: Uint8Array;
  /** How many spaces are marked in `moves`. */
  count: number;
  /** The enemy mechs it can attack. */
  attacks: Die[];
}

/** Scratch space for mechReach's search, reused: it runs for every mech in every position the AI scores. */
let STEPS = new Int32Array(0);
let QUEUE = new Int32Array(0);

/**
 * Where a mech can go with one move: the same spaces and targets as moveIndexes, without the steps
 * to each, for the AI's evaluation. `at` is mechsByIndex(state).
 */
export function mechReach(state: GameState, d: Die, at: (Die | undefined)[]): MechReach {
  const g = grid(state.board);
  const result: MechReach = { moves: new Uint8Array(g.size), count: 0, attacks: [] };
  const start = cellOf(d);
  if (!start) return result;
  if (anySkill(state, d.owner, (r) => r.moveThroughEnemies)) {
    const opts = moveIndexes(state, d, at);
    for (const i of opts.moves.keys()) result.moves[i] = 1;
    result.count = opts.moves.size;
    for (const id of opts.attacks.keys()) result.attacks.push(die(state, id));
    return result;
  }
  if (STEPS.length < g.size) {
    STEPS = new Int32Array(g.size);
    QUEUE = new Int32Array(g.size);
  }
  const range = movementRange(state, d);
  const from = start.r * g.cols + start.c;
  // The tunnels inline rather than tunnels(): a call per step is measurable here.
  const [tunnelA, tunnelB, tunnelC, tunnelD] = tunnelIndexes(state, g);
  const zone = stopZone(state, d.owner, at);
  const walls = barrierMask(state, g);
  const near = g.ortho;
  // Plain breadth-first search: without Sneak every step costs 1.
  STEPS.fill(-1, 0, g.size);
  STEPS[from] = 0;
  QUEUE[0] = from;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const cur = QUEUE[head++];
    const steps = STEPS[cur];
    if (steps >= range) continue;
    // stopZone: a mech stopped there may still attack from it, but not move on.
    const stopped = zone !== undefined && zone[cur] === 1 && cur !== from;
    const list = near[cur];
    for (let k = 0; k <= list.length; k++) {
      const nb =
        k < list.length
          ? list[k]
          : cur === tunnelA
            ? tunnelB
            : cur === tunnelB
              ? tunnelA
              : cur === tunnelC
                ? tunnelD
                : cur === tunnelD
                  ? tunnelC
                  : -1;
      if (nb < 0) continue;
      const mech = at[nb];
      if (mech) {
        if (mech.owner !== d.owner && !result.attacks.includes(mech)) result.attacks.push(mech);
        continue;
      }
      if (stopped || STEPS[nb] >= 0 || !g.space[nb] || walls?.[nb]) continue;
      STEPS[nb] = steps + 1;
      QUEUE[tail++] = nb;
      if (!result.moves[nb]) {
        result.moves[nb] = 1;
        result.count++;
      }
    }
  }
  return result;
}

/**
 * Destinations for a mech carrying `passenger`, and where the passenger may be set down.
 * `range` defaults to the carrier's movement; Advance carries exactly 1 space.
 */
export function carryOptions(state: GameState, carrierId: string, passengerId: string, range?: number) {
  const carrier = die(state, carrierId);
  const passenger = die(state, passengerId);
  const start = cellOf(carrier);
  const pCell = cellOf(passenger);
  const result = new Map<string, { cell: Cell; setDowns: Cell[] }>();
  if (!start || !pCell) return result;
  range ??= movementRange(state, carrier);
  const { cols, cells, space } = grid(state.board);
  const { found, steps } = reach(state, start, range, [pCell]);
  for (const i of found) {
    // The carrier must move, but may fly out and back to its own space (designer ruling,
    // BGG thread 1074052): that needs 2 movement and one free neighbouring space.
    if (steps[i] === 0 && (range < 2 || found.length < 2)) continue;
    const cell = cells[i];
    const setDowns = adjacent(state.board, cell).filter((q) => {
      if (!space[q.r * cols + q.c] || barrierAt(state, q)) return false;
      const occupant = dieAt(state, q);
      return !occupant || occupant.id === carrier.id || occupant.id === passenger.id;
    });
    if (setDowns.length) result.set(key(cell), { cell, setDowns });
  }
  return result;
}

export function carryPassengers(state: GameState, carrierId: string): Die[] {
  const carrier = die(state, carrierId);
  const start = cellOf(carrier);
  if (!start) return [];
  return adjacent(state.board, start)
    .map((p) => dieAt(state, p))
    .filter((d): d is Die => !!d && d.owner === carrier.owner);
}

/** Enemy mechs a Breacher can attack with its free attack. */
export function freeAttackTargets(state: GameState, dieId: string): Die[] {
  const d = die(state, dieId);
  const start = cellOf(d);
  if (!start) return [];
  return stepNeighbours(state, start)
    .map((p) => dieAt(state, p))
    .filter((x): x is Die => !!x && x.owner !== d.owner);
}

export interface AdvanceSkillOptions {
  moves: { cell: Cell }[];
  attacks: { die: Die }[];
}

/** Advance: one step (or an attack on an adjacent enemy) for a single mech. */
export function advanceSkillOptions(state: GameState, dieId: string): AdvanceSkillOptions {
  const d = die(state, dieId);
  const start = cellOf(d);
  const result: AdvanceSkillOptions = { moves: [], attacks: [] };
  if (!start) return result;
  for (const cell of stepNeighbours(state, start)) {
    const target = dieAt(state, cell);
    if (!target && isEmptySpace(state, cell)) result.moves.push({ cell });
    else if (target && target.owner !== d.owner) result.attacks.push({ die: target });
  }
  return result;
}
