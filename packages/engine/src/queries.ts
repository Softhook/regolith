/** Read-only questions about a state: movement, deploying, conquering, combat totals… */
import {
  cellAt,
  grid,
  type Grid,
  key,
  linked,
  orbitals,
  otherGate,
  planetFreeSlots,
  same,
  spaces,
  stepNeighbours,
  straightLines,
  surrounding,
} from './board';
import { cardName, card, effectOf } from './data';
import { barrierAt, cellOf, die, dieAt, isEmptySpace, reserve, shipsOnBoard } from './lookups';
import { hooksOf, modeHasHook, rulesOf } from './rules';
import { activeSkills, anySkill, ruleOf, skillRules, type CombatPart, type SkillRule } from './skillRules';
import type { Barrier, Cell, CombatPending, CombatRole, Die, GameState, OncePerTurn, Planet, PlayerId, TurnState } from './types';

export type { CombatPart } from './skillRules';

// ---------------------------------------------------------------------------
// Turn limits

/** Whether a once-per-turn effect has been used this turn. */
export function usedThisTurn(state: GameState, tag: OncePerTurn): boolean {
  return state.turn.oncePerTurn.includes(tag);
}

/** Cunning: one ship ability may be used a second time each turn. */
export function cunningAvailable(state: GameState, player: PlayerId): boolean {
  return anySkill(state, player, (r) => r.abilityTwice) && !usedThisTurn(state, 'cunning');
}

export function canUseAbility(state: GameState, d: Die): boolean {
  return !state.turn.abilityUsed[d.id] || cunningAvailable(state, d.owner);
}

/**
 * Reconfigure targets one of your ships on the map or in your scrapyard (2013 rulebook p.5), which still
 * has a number it hasn't shown this turn (Community Edition).
 */
export function canReconfigure(state: GameState, d: Die): boolean {
  return d.loc.zone !== 'reserve' && (state.turn.seen[d.id]?.length ?? 1) < 6;
}

/**
 * Unlike other skills, a held Talented raises the limit at once, before it becomes active at the end
 * of the turn, so taking it as a 4th skill forces no discard (RULE-SUGGESTIONS #49).
 */
export function skillLimit(state: GameState, player: PlayerId): number {
  return Math.max(3, ...state.players[player].skills.map((s) => ruleOf(s.id).skillLimit ?? 0));
}

/** Research needed for a breakthrough at the end of the turn. */
export function breakthroughAt(state: GameState, player: PlayerId): number {
  const limit = rulesOf(state).researchLimit;
  return Math.min(limit, ...skillRules(state, player).map((r) => r.breakthroughAt ?? limit));
}

/** Dominance needed for Infamy (normally 6, or 4 with Prideful). */
export function infamyAt(state: GameState, player: PlayerId): number {
  return Math.min(6, ...skillRules(state, player).map((r) => r.infamyAt ?? 6));
}

/**
 * Whether no more actions may be taken this turn, only ending it (or playing a stored Tactic): after
 * the CE Curious extra action or a stored Tactic (Patient).
 */
export function actionsClosed(t: TurnState): boolean {
  return !!(t.curiousUsed || t.storedTacticPlayed);
}

/** CE Curious: whether the player may take an additional Move or Research action. */
export function canCurious(state: GameState, player: PlayerId): boolean {
  const t = state.turn;
  return (
    anySkill(state, player, (r) => r.peacefulExtraAction) &&
    player === t.player &&
    t.phase === 'actions' &&
    !t.attacked &&
    (t.conquered ?? 0) === 0 &&
    !t.curiousUsed
  );
}

/** Patient: whether the player can play a stored Tactic at the end of their turn. */
export function canPlayStoredTactic(state: GameState, player: PlayerId): boolean {
  const t = state.turn;
  const pl = state.players[player];
  return (
    anySkill(state, player, (r) => r.storeTactics) &&
    player === t.player &&
    t.phase === 'actions' &&
    !t.storedTacticPlayed &&
    (pl.storedTactics?.length ?? 0) > 0
  );
}

/** Profiteering: whether the current card pick may be taken as a missile instead. */
export function canProfiteer(state: GameState): boolean {
  const head = state.pending[0];
  return head?.kind === 'takeCard' && (head.conquer ?? 0) > 0 && anySkill(state, head.player, (r) => r.missileForConquest);
}

/** Whether the player can gain research at all. */
export function canGainResearch(state: GameState, player: PlayerId): boolean {
  return !anySkill(state, player, (r) => r.noResearch);
}

// ---------------------------------------------------------------------------
// Movement

/** The most a ship's die value counts for movement; skill bonuses add to it (ruling 2026-10-08, PROTOTYPING.md §2). */
export const MAX_MOVEMENT = 3;

/** The die value counts up to MAX_MOVEMENT; skill bonuses add to that. */
export function movementRange(state: GameState, d: Die): number {
  const base = Math.min(MAX_MOVEMENT, d.value);
  return base + skillRules(state, d.owner).reduce((n, r) => n + (r.movement ?? 0), 0);
}

/**
 * Spaces where `mover`'s ships must stop, by board cell index (`at` is shipsByIndex): around enemy
 * ships with `stopsEnemies` (a power, ShipHooks). Undefined when nothing stops them, so plain searches stay plain.
 * Devious ignores them: it slips past enemy ships (ruling 2026-10-12).
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
  /** Reachable empty spaces, keyed by "r,c". `diagonal` means the interceptor ability is needed. */
  moves: Map<string, { cell: Cell; steps: number; diagonal: boolean }>;
  /**
   * Attackable enemy dice, keyed by die id: every space the attack may be launched from (`launches`,
   * nearest first; the attacker chooses), and the first of them.
   */
  attacks: Map<string, AttackLaunch & { launches: AttackLaunch[] }>;
}

/** A space to attack from, the target's space, and whether it takes the interceptor ability. */
export interface AttackLaunch {
  from: Cell;
  at: Cell;
  diagonal: boolean;
}

/**
 * Spaces a ship can reach within `range` steps, with the fewest steps to each, by board cell index
 * (see board.ts grid): this runs for every ship in every position the AI scores. `found` lists
 * them in the order they were first reached, the start first. `ignore` lists occupied spaces
 * treated as empty. With `through` (Devious), the ship may pass through that player's enemies'
 * ships at no cost; such spaces are marked in `passing`, as it can't stop there. The search doesn't
 * go on from a space in `zone` (stopZone), other than the start.
 */
function reach(
  state: GameState,
  start: Cell,
  range: number,
  diagonal: boolean,
  ignore: Cell[] = [],
  through?: PlayerId,
  at = shipsByIndex(state),
  zone?: Uint8Array,
) {
  const g = grid(state.board);
  const ignored = ignore.map((p) => p.r * g.cols + p.c);
  const steps = new Int32Array(g.size).fill(-1);
  const passing = new Uint8Array(g.size);
  const from = start.r * g.cols + start.c;
  const found: number[] = [from];
  steps[from] = 0;
  const gate = gates(state, g);
  const near = diagonal ? g.around : g.ortho;
  const walls = barrierMask(state, g);
  /** 0 = blocked, 1 = free, 2 = passed through (Devious). */
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
    const partner = gate(cur);
    if (partner >= 0) visit(cur, partner);
  }
  return { found, steps, passing };
}

const BARRIER_MASKS = new WeakMap<readonly Barrier[], Uint8Array>();

/**
 * 1 on each space with a barrier (GameState.barriers), by board cell index; undefined when there are none.
 * Cached by the list, which a state keeps until a barrier is added: the AI asks for it for every ship it moves.
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

/** The two Warp Gates' cell indexes, or -1s until both are placed (see board.ts stepNeighbours). */
function gateIndexes(state: GameState, g: Grid): [number, number] {
  if (state.gates.length !== 2) return [-1, -1];
  const [a, b] = state.gates;
  return [a.r * g.cols + a.c, b.r * g.cols + b.c];
}

/** The Warp Gate partner of a cell index, or -1. */
function gates(state: GameState, g: Grid): (i: number) => number {
  const [a, b] = gateIndexes(state, g);
  return (i) => (i === a ? b : i === b ? a : -1);
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
    const launches = list.map((x) => ({ from: cells[x.from], at: cells[x.at], diagonal: x.diagonal }));
    result.attacks.set(id, { ...launches[0], launches });
  }
  return result;
}

/**
 * The spaces worth choosing between to attack `target` from (moveOptions launches), nearest first:
 * the nearest of each outcome. Where the attack goes in from is where a repelled ship, or a winner
 * that stays, ends up, so spaces differ when the chance to win, the planets it would orbit or the ships
 * next to it (zones of control, support; through a Warp Gate too) differ.
 */
export function attackLaunches(state: GameState, dieId: string, target: string, opts = moveOptions(state, dieId)): AttackLaunch[] {
  const launches = opts.attacks.get(target)?.launches ?? [];
  if (launches.length < 2) return launches;
  const attacker = die(state, dieId);
  const defender = die(state, target);
  const g = grid(state.board);
  const at = shipsByIndex(state);
  const gate = gates(state, g);
  const seen = new Set<string>();
  return launches.filter(({ from, diagonal }) => {
    const i = from.r * g.cols + from.c;
    const near: string[] = [];
    for (const p of g.ortho[i]) {
      const planet = cellAt(state.board, g.cells[p])?.planet;
      if (planet !== undefined) near.push(`objective ${planet}`);
    }
    for (const p of [...g.ortho[i], gate(i)]) {
      const ship = at[p];
      if (ship && ship !== attacker && ship !== defender) near.push(ship.id);
    }
    const outcome = [attackChance(state, attacker, defender, from), diagonal, ...near.sort()].join();
    if (seen.has(outcome)) return false;
    seen.add(outcome);
    return true;
  });
}

/**
 * The way a ship flies to `to` with a plain move (a destination in moveOptions, or the space an
 * attack goes in from), its own space first: one of the shortest, with as few turns as it can.
 * `diagonal`: with the interceptor ability, as moveOptions says. Each space is next to the one before
 * it, across a joined edge of the map or through a Warp Gate. Empty if the ship can't get there.
 */
export function movePath(state: GameState, dieId: string, to: Cell, diagonal = false): Cell[] {
  const d = die(state, dieId);
  const start = cellOf(d);
  if (!start) return [];
  const at = shipsByIndex(state);
  const through = anySkill(state, d.owner, (r) => r.moveThroughEnemies) ? d.owner : undefined;
  const zone = stopZone(state, d.owner, at);
  const range = movementRange(state, d);
  const { steps, passing } = reach(state, start, range, diagonal, [], through, at, zone);
  const g = grid(state.board);
  const gate = gates(state, g);
  const near = diagonal ? g.around : g.ortho;
  const from = start.r * g.cols + start.c;
  const path = [to.r * g.cols + to.c];
  if (steps[path[0]] < 0 || passing[path[0]]) return [];
  // Back from `to`, over spaces one step nearer the start (or as near, passed through for free), the
  // straight one first; back up from a dead end, which only a free pass can lead into.
  const back = (cur: number, next: number): boolean => {
    if (cur === from) return true;
    const before = [...near[cur], gate(cur)].filter(
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

/** The ships on the map by board cell index (see board.ts grid), for moveIndexes. */
export function shipsByIndex(state: GameState): (Die | undefined)[] {
  const cols = state.board.cols;
  const at: (Die | undefined)[] = [];
  for (const d of state.dice) if (d.loc.zone === 'board') at[d.loc.r * cols + d.loc.c] = d;
  return at;
}

/**
 * moveOptions by board cell index (see board.ts grid), for code that asks about many ships and positions: the AI.
 * It may pass the ship itself and `at` (shipsByIndex), to look them up once for all ships. Each
 * attack lists every space it may be launched from, nearest first, a space reached without the
 * interceptor ability before one that needs it.
 */
export function moveIndexes(state: GameState, ship: string | Die, at = shipsByIndex(state)) {
  const d = typeof ship === 'string' ? die(state, ship) : ship;
  const result = {
    moves: new Map<number, { steps: number; diagonal: boolean }>(),
    attacks: new Map<string, { from: number; at: number; diagonal: boolean }[]>(),
  };
  const start = cellOf(d);
  if (!start) return result;
  const range = movementRange(state, d);
  const passes: boolean[] = [false];
  const zone = stopZone(state, d.owner, at);

  // Devious: normal moves only, not Transport or the Tactical step (decided 2026-10-03, OPEN-QUESTIONS #65).
  const through = anySkill(state, d.owner, (r) => r.moveThroughEnemies) ? d.owner : undefined;
  const g = grid(state.board);
  const gate = gates(state, g);
  for (const diagonal of passes) {
    const { found, steps, passing } = reach(state, start, range, diagonal, [], through, at, zone);
    for (const i of found) {
      if (steps[i] === 0 || passing[i] || result.moves.has(i)) continue;
      result.moves.set(i, { steps: steps[i], diagonal });
    }
    const near = diagonal ? g.around : g.ortho;
    const attack = (from: number, nb: number) => {
      const target = at[nb];
      if (!target || target.owner === d.owner) return;
      const launches = result.attacks.get(target.id);
      if (!launches) result.attacks.set(target.id, [{ from, at: nb, diagonal }]);
      else if (!launches.some((x) => x.from === from)) launches.push({ from, at: nb, diagonal });
    };
    for (const i of found) {
      if (steps[i] >= range || passing[i]) continue;
      for (const nb of near[i]) attack(i, nb);
      const partner = gate(i);
      if (partner >= 0) attack(i, partner);
    }
  }
  return result;
}

export interface ShipReach {
  /** 1 on each empty space one move reaches, by board cell index (see board.ts grid). */
  moves: Uint8Array;
  /** How many spaces are marked in `moves`. */
  count: number;
  /** The enemy ships it can attack. */
  attacks: Die[];
}

/** Scratch space for shipReach's search, reused: it runs for every ship in every position the AI scores. */
let STEPS = new Int32Array(0);
let QUEUE = new Int32Array(0);

/**
 * Where a ship can go with one move: the same spaces and targets as moveIndexes, without the steps
 * to each, for the AI's evaluation. `at` is shipsByIndex(state).
 */
export function shipReach(state: GameState, d: Die, at: (Die | undefined)[]): ShipReach {
  const g = grid(state.board);
  const result: ShipReach = { moves: new Uint8Array(g.size), count: 0, attacks: [] };
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
  // The gates inline rather than gates(): a call per step is measurable here.
  const [gateA, gateB] = gateIndexes(state, g);
  const diagonals = false;
  const zone = stopZone(state, d.owner, at);
  const walls = barrierMask(state, g);
  for (let pass = 0; pass < (diagonals ? 2 : 1); pass++) {
    const near = pass ? g.around : g.ortho;
    // Plain breadth-first search: without Devious every step costs 1.
    STEPS.fill(-1, 0, g.size);
    STEPS[from] = 0;
    QUEUE[0] = from;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const cur = QUEUE[head++];
      const steps = STEPS[cur];
      if (steps >= range) continue;
      // stopZone: a ship stopped there may still attack from it, but not move on.
      const stopped = zone !== undefined && zone[cur] === 1 && cur !== from;
      const list = near[cur];
      for (let k = 0; k <= list.length; k++) {
        const nb = k < list.length ? list[k] : cur === gateA ? gateB : cur === gateB ? gateA : -1;
        if (nb < 0) continue;
        const ship = at[nb];
        if (ship) {
          if (ship.owner !== d.owner && !result.attacks.includes(ship)) result.attacks.push(ship);
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
  }
  return result;
}

/**
 * Destinations for a flagship carrying `passenger`, and where the passenger may be dropped.
 * `range` defaults to the flagship's movement; Tactical transports exactly 1 space.
 */
export function carryOptions(state: GameState, flagshipId: string, passengerId: string, range?: number) {
  const flag = die(state, flagshipId);
  const passenger = die(state, passengerId);
  const start = cellOf(flag);
  const pCell = cellOf(passenger);
  const result = new Map<string, { cell: Cell; drops: Cell[] }>();
  if (!start || !pCell) return result;
  range ??= movementRange(state, flag);
  const { cols, cells, space } = grid(state.board);
  const { found, steps } = reach(state, start, range, false, [pCell]);
  for (const i of found) {
    // The flagship must move, but may fly out and back to its own space (designer ruling,
    // BGG thread 1074052): that needs 2 movement and one free neighbouring space.
    if (steps[i] === 0 && (range < 2 || found.length < 2)) continue;
    const cell = cells[i];
    const drops = surrounding(state.board, cell).filter((q) => {
      if (!space[q.r * cols + q.c] || barrierAt(state, q)) return false;
      const occupant = dieAt(state, q);
      return !occupant || occupant.id === flag.id || occupant.id === passenger.id;
    });
    if (drops.length) result.set(key(cell), { cell, drops });
  }
  return result;
}

export function carryPassengers(state: GameState, flagshipId: string): Die[] {
  const flag = die(state, flagshipId);
  const start = cellOf(flag);
  if (!start) return [];
  return surrounding(state.board, start)
    .map((p) => dieAt(state, p))
    .filter((d): d is Die => !!d && d.owner === flag.owner);
}

/** Enemy ships a battlestation can attack with its free attack. */
export function freeAttackTargets(state: GameState, dieId: string): Die[] {
  const d = die(state, dieId);
  const start = cellOf(d);
  if (!start) return [];
  return stepNeighbours(state, start, false)
    .map((p) => dieAt(state, p))
    .filter((x): x is Die => !!x && x.owner !== d.owner);
}

export interface TacticalOptions {
  /** `diagonal` steps need the Interceptor's Maneuver ability. */
  moves: { cell: Cell; diagonal: boolean }[];
  attacks: { die: Die; diagonal: boolean }[];
}

/**
 * Tactical: one step (or an attack on an adjacent enemy) for a single ship. An Interceptor that
 * still has its ability may step or attack diagonally (forum consensus, BGG thread 2433096).
 */
export function tacticalOptions(state: GameState, dieId: string): TacticalOptions {
  const d = die(state, dieId);
  const start = cellOf(d);
  const result: TacticalOptions = { moves: [], attacks: [] };
  if (!start) return result;
  const straight = stepNeighbours(state, start, false);
  const near = straight.map((cell) => ({ cell, diagonal: false }));
  for (const { cell, diagonal } of near) {
    const target = dieAt(state, cell);
    if (!target && isEmptySpace(state, cell)) result.moves.push({ cell, diagonal });
    else if (target && target.owner !== d.owner) result.attacks.push({ die: target, diagonal });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Setup and cards

/** Empty orbital positions of a starting planet. */
export function startSlots(state: GameState, planetId: number): Cell[] {
  return orbitals(state.board, state.board.planets[planetId]).filter((p) => isEmptySpace(state, p));
}

/**
 * Whether the player may take this face-up card. An Expansion needs a ship in the reserve:
 * "If you already have both of your expansion ships in the game, you cannot use EXPANSION
 * cards" (2013 rulebook p.9).
 */
export function canTakeCard(state: GameState, player: PlayerId, id: string): boolean {
  return effectOf(id) !== 'expansion' || reserve(state, player).length > 0;
}

/** Whether there is anything the player could do with a card pick. */
export function canTakeAnyCard(state: GameState, player: PlayerId): boolean {
  const m = state.market;
  return (
    [...m.skillRow, ...m.tacticRow].some((id) => canTakeCard(state, player, id)) || (m.expansions > 0 && reserve(state, player).length > 0)
  );
}

// ---------------------------------------------------------------------------
// Deploy

export function deployTargets(state: GameState, player: PlayerId): Cell[] {
  const targets = new Map<string, Cell>();
  for (const planet of state.board.planets) {
    if (!planet.cubes.includes(player)) continue;
    for (const p of orbitals(state.board, planet)) {
      if (isEmptySpace(state, p)) targets.set(key(p), p);
    }
  }
  if (modeHasHook(state, 'deployTargets')) {
    for (const d of state.dice) {
      const extra = d.owner === player && d.loc.zone === 'board' ? hooksOf(state, d)?.deployTargets : undefined;
      if (extra) for (const p of extra(state, d)) if (isEmptySpace(state, p)) targets.set(key(p), p);
    }
  }
  if (anySkill(state, player, (r) => r.deployIsolated)) {
    for (const p of spaces(state.board)) {
      if (isEmptySpace(state, p) && !linked(state, p).some((q) => dieAt(state, q))) targets.set(key(p), p);
    }
  }
  // Contested deploy (PROTOTYPING.md §6.8): every way of deploying (Expansion, Stealthy, Beacon too) stays out of
  // a contested orbit, except a home shipyard's, so nobody is shut out.
  const home = homePlanet(state, player);
  for (const planet of state.board.planets) {
    if (planet !== home && orbitBlockers(state, player, planet).length)
      for (const p of orbitals(state.board, planet))
        if (!(home && orbitals(state.board, home).some((h) => same(h, p)))) targets.delete(key(p));
  }
  return [...targets.values()];
}

// ---------------------------------------------------------------------------
// Cubes: conquering, Infamy, Relocation

export interface ConquerCheck {
  ok: boolean;
  sum: number;
  target: number;
  ships: Die[];
  reason?: string;
  /** Over-conquest: owners whose cube may be displaced. */
  replace?: PlayerId[];
  /** Contested orbit: the ships make the sum, but opponents' ships in orbit stop the conquest. */
  blocked?: boolean;
  /** Research the conquest spends to move the sum onto the target (Science). */
  research?: number;
}

/** The player's home planet (home shipyard): their starting planet, unless their cube there has moved (`cubeLeft`). */
export function homePlanet(state: GameState, player: PlayerId): Planet | undefined {
  const id = state.players[player].home;
  return id === undefined ? undefined : state.board.planets[id];
}

/** Contested orbit (PROTOTYPING.md §6.8): opponents' ships in the planet's orbital positions, which stop `player` conquering it. */
export function orbitBlockers(state: GameState, player: PlayerId, planet: Planet): Die[] {
  return orbitals(state.board, planet)
    .map((p) => dieAt(state, p))
    .filter((d): d is Die => !!d && d.owner !== player);
}

/** The orbit sum that displaces an opponent's cube, on any planet (PROTOTYPING.md §6.10). */
const OVER_CONQUEST_TARGET = 12;

/**
 * Whether `player` may conquer the planet. With `displace` (over-conquest), the check is for taking
 * the place of an opponent's cube at a sum of 12 whatever the planet; on a full planet that is the only way.
 */
export function conquerCheck(state: GameState, player: PlayerId, planetId: number, displace = false): ConquerCheck {
  const planet = state.board.planets[planetId];
  const own = planet.cubes.filter((x) => x === player).length;
  let target = planet.number;
  const fail = (reason: string, ships: Die[] = [], sum = 0): ConquerCheck => ({
    ok: false,
    sum,
    target,
    ships,
    reason,
  });

  let replace: PlayerId[] | undefined;
  if (planetFreeSlots(planet) <= 0 || displace) {
    if (!rulesOf(state).overConquest) return fail('No empty cube location');
    replace = [...new Set(planet.cubes.filter((x) => x !== player))];
    if (!replace.length) return fail('No opponent cube to displace');
    target = OVER_CONQUEST_TARGET;
  } else if (own > 0) {
    // Quantum Entanglement: only once you hold every planet that still has room.
    const blocked = state.board.planets.some((p) => planetFreeSlots(p) > 0 && !p.cubes.includes(player));
    if (blocked) return fail('You already have a cube here');
    target += 3 * own;
  }

  const rules = skillRules(state, player).flatMap((r) => (r.conquer ? [r.conquer] : []));
  const mine = (spaces: readonly Cell[]) => spaces.map((p) => dieAt(state, p)).filter((d): d is Die => !!d && d.owner === player);
  const all = mine(orbitals(state.board, planet));
  const total = (ships: Die[]) => ships.reduce((a, d) => a + d.value, 0);
  // Contested orbit: named in every refusal, though the sum is checked first, so a blocked orbit still says how far it is from it.
  const blockers = orbitBlockers(state, player, planet);
  const blockade = blockers.length ? `; enemy mechs on the perimeter block it too (${blockers.map((d) => d.value).join(', ')})` : '';
  if (!all.length) return fail(`No mechs on the perimeter${blockade}`, all, 0);

  const p = state.players[player];
  const tolerance = Math.max(0, ...rules.map((r) => r.tolerance ?? 0));
  // Science: Research above 1 (the die's lowest face) moves the sum up or down, as little as needed.
  const spendable = rules.some((r) => r.spendResearch) ? Math.max(0, p.research - 1) : 0;
  // Every orbital ship counts.
  const sum = total(all);
  const ctx = { sum, ships: all, dominance: p.dominance, research: p.research };
  const sums = [sum, ...rules.flatMap((r) => r.sums?.(ctx) ?? [])];
  const research = Math.min(...sums.map((s) => Math.max(0, Math.abs(s - target) - tolerance)));
  if (research <= spendable) {
    if (blockers.length)
      return { ...fail(`Enemy mechs on the perimeter block it (${blockers.map((d) => d.value).join(', ')})`, all, sum), blocked: true };
    return { ok: true, sum, target, ships: all, replace, ...(research && { research }) };
  }
  return fail(`Perimeter totals ${sum}, needs ${target}${blockade}`, all, sum);
}

/** Any planet without your cube; if none has room, Quantum Entanglement allows your own planets. */
export function infamyTargets(state: GameState, player: PlayerId): Planet[] {
  const open = state.board.planets.filter((p) => planetFreeSlots(p) > 0);
  const fresh = open.filter((p) => !p.cubes.includes(player));
  return fresh.length ? fresh : open;
}

// ---------------------------------------------------------------------------
// Combat

export interface CombatTotal {
  roll: number;
  total: number;
  parts: CombatPart[];
}

/** The value a side's combat roll is set to, overriding the dice: a missile, Plan Ahead or Rational (in that priority). */
function rollOverride(state: GameState, combat: CombatPending, side: CombatRole): CombatPart | undefined {
  const s = combat[side];
  if (s.missile) return { kind: 'roll', set: true, label: 'Atomic', value: 1 };
  if (state.players[s.player].planAhead > 0) return { kind: 'roll', set: true, label: cardName('plan-ahead'), value: 1 };
  const fixed = activeSkills(state, s.player)
    .filter((a) => a.rule.combat?.roll !== undefined)
    .pop();
  return fixed && { kind: 'roll', set: true, label: card(fixed.card).name, value: fixed.rule.combat!.roll! };
}

/**
 * Combat roll pipeline (see docs/OPEN-QUESTIONS.md #10):
 * roll (Brutal: lower of two) → set effects (Rational 3, Plan Ahead 1) → missile (1) → modifiers.
 */
export function combatTotal(state: GameState, combat: CombatPending, side: CombatRole): CombatTotal {
  const s = combat[side];
  const skills = activeSkills(state, s.player).filter((a) => a.rule.combat);
  const parts: CombatPart[] = [];
  const set = rollOverride(state, combat, side);
  const roll = set?.value ?? (s.dice.length > 1 ? Math.min(...s.dice) : s.dice[0]);
  parts.push(set ?? { kind: 'roll', label: s.dice.length > 1 ? `${cardName('brutal')} roll` : 'Roll', value: roll });
  parts.push({ kind: 'ship', label: 'Mech', value: s.ship });
  for (const { card: id, rule } of skills) {
    const value = rule.combat!.modifier?.({ state, combat, side }) ?? 0;
    if (value) parts.push({ kind: 'modifier', label: card(id).name, value });
  }
  const total = parts.reduce((a, x) => a + x.value, 0);
  return { roll, total, parts };
}

export function combatOutcome(state: GameState, combat: CombatPending) {
  const a = combatTotal(state, combat, 'attacker');
  const d = combatTotal(state, combat, 'defender');
  const tie = a.total === d.total;
  const stubbornDefence = anySkill(state, combat.defender.player, (r) => r.combat?.stubborn);
  const attackerWins = a.total < d.total || (tie && !stubbornDefence);
  // Stubborn: when the defender wins (ties included), the attacker is destroyed.
  const stubborn = stubbornDefence && !attackerWins;
  return { attacker: a, defender: d, attackerWins, stubborn };
}

/**
 * Whether `by` is offered a missile on `side`'s combat roll. A combatant is only offered their own
 * roll (a lower roll for the opponent only helps them), and not while already winning. Players not
 * in the battle may not fire. A roll that is already 1 is never offered.
 */
export function missileOffered(state: GameState, combat: CombatPending, by: PlayerId, side: CombatRole): boolean {
  return missileRefusal(state, combat, by, side) === null;
}

/** Why `by` is not offered a missile on `side`'s roll (see missileOffered), or null if they are. */
export function missileRefusal(state: GameState, combat: CombatPending, by: PlayerId, side: CombatRole): string | null {
  if (state.players[by].missiles <= 0) return 'No atomics left';
  if (combat[side].missile || combatTotal(state, combat, side).roll === 1) return 'That combat roll is already 1';
  if (by !== combat.attacker.player && by !== combat.defender.player) return 'Only the attacker and defender may fire an atomic';
  if (combat[side].player !== by || combatOutcome(state, combat).attackerWins === (side === 'attacker'))
    return 'You may only fire an atomic on your own roll, while losing';
  return null;
}

/** Whether `player` can still respond to the battle with a missile. */
export function canRespondToCombat(state: GameState, combat: CombatPending, player: PlayerId): boolean {
  return (['attacker', 'defender'] as const).some((side) => missileOffered(state, combat, player, side));
}

/** How many combat dice the player rolls (the lowest counts). */
export function combatDice(state: GameState, player: PlayerId): number {
  return Math.max(1, ...skillRules(state, player).map((r) => r.combat?.dice ?? 1));
}

/** Probability that an attacker ship of value `a` beats a defender of value `d` with plain dice. */
export function attackOdds(a: number, d: number): number {
  let wins = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) if (a + x <= d + y) wins++;
  return wins / 36;
}

/** The battle `attacker` would start against `defender` from `from`, every die rolling a 6 (a placeholder). */
function previewCombat(attacker: Die, defender: Die, from: Cell): CombatPending {
  const side = (d: Die) => ({ player: d.owner, die: d.id, ship: d.value, dice: [6], missile: false });
  return { kind: 'combat', id: 0, attacker: side(attacker), defender: side(defender), from, at: cellOf(defender)! };
}

/**
 * Probability that `attacker` beats `defender` if it attacks from `from` (by default, where it is
 * now), with both players' combat skills and Plan Ahead (not re-rolls, missiles or Dangerous).
 */
export function attackChance(state: GameState, attacker: Die, defender: Die, from: Cell = cellOf(attacker)!): number {
  const plain = (p: PlayerId) => !state.players[p].planAhead && !activeSkills(state, p).some((a) => a.rule.combat);
  if (plain(attacker.owner) && plain(defender.owner)) return attackOdds(attacker.value, defender.value);
  const combat = previewCombat(attacker, defender, from);
  /** Chance of each total: the roll (a set value, or the lowest of n dice) plus what doesn't depend on it. */
  const totals = (role: CombatRole): Map<number, number> => {
    const t = combatTotal(state, combat, role);
    // A set roll (Rational, Plan Ahead): the 6 rolled was ignored.
    if (t.roll !== 6) return new Map([[t.total, 1]]);
    const n = combatDice(state, combat[role].player);
    // The lowest of n dice is r with chance ((7 - r)^n - (6 - r)^n) / 6^n.
    return new Map([1, 2, 3, 4, 5, 6].map((r) => [t.total - 6 + r, ((7 - r) ** n - (6 - r) ** n) / 6 ** n]));
  };
  const att = totals('attacker');
  const def = totals('defender');
  const stubborn = anySkill(state, defender.owner, (r) => r.combat?.stubborn);
  let wins = 0;
  for (const [a, pa] of att) for (const [d, pd] of def) if (a < d || (a === d && !stubborn)) wins += pa * pd;
  return wins;
}

/** The name of the player's active skill with this rule, as printed. */
function skillName(state: GameState, player: PlayerId, test: (r: SkillRule) => unknown): string | undefined {
  const held = state.players[player].skills.find((s) => s.active && test(ruleOf(s.id)));
  return held && card(held.id).name;
}

/**
 * What changes the odds of an attack (see attackChance) for each side, beyond the ships and the
 * dice, by the cards' names: e.g. "Armour Piercing −1", "Drill Sergeant: rolls 3", "Paired Cannons: lowest
 * of 2 dice", "Entrenched: wins ties".
 */
export function attackFactors(
  state: GameState,
  attacker: Die,
  defender: Die,
  from: Cell = cellOf(attacker)!,
): Record<CombatRole, string[]> {
  const combat = previewCombat(attacker, defender, from);
  const factors = (role: CombatRole): string[] => {
    const parts = combatTotal(state, combat, role).parts;
    const set = parts.find((part) => part.kind === 'roll' && part.set);
    const out = set ? [`${set.label}: rolls ${set.value}`] : [];
    for (const part of parts) if (part.kind === 'modifier') out.push(`${part.label} ${signed(part.value)}`);
    const n = combatDice(state, combat[role].player);
    if (n > 1 && !set) out.push(`${skillName(state, combat[role].player, (r) => (r.combat?.dice ?? 1) > 1)!}: lowest of ${n} dice`);
    const stubborn = role === 'defender' && skillName(state, defender.owner, (r) => r.combat?.stubborn);
    if (stubborn) out.push(`${stubborn}: wins ties`);
    return out;
  };
  return { attacker: factors('attacker'), defender: factors('defender') };
}

/** A modifier with its sign: "+1", "−2" (a minus sign, not a hyphen). */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/** Whether a barrier can go on `p`, by Barricade or a Wisp: an empty space with no warp gate on it. */
export function canHoldBarrier(state: GameState, p: Cell): boolean {
  return isEmptySpace(state, p) && !state.gates.some((g) => same(g, p));
}

/** The spaces Barricade can place a barrier on. */
export function barrierSpaces(state: GameState): Cell[] {
  return spaces(state.board).filter((p) => canHoldBarrier(state, p));
}

/** How far Kinetic Shunt pushes a mech. */
const SHUNT_RANGE = 4;

/** A space Kinetic Shunt can push a mech to, and whether it gets there through a warp gate. */
export interface ShuntPath {
  to: Cell;
  tunnel: boolean;
}

/**
 * Where Kinetic Shunt can push a mech: the empty spaces up to 4 away in a straight line, stopping before
 * anything in its way (a planet, a mech, a barrier, the void or the board's edge). A mech pushed onto a
 * warp gate (Ice Tunnel) may come out of the other one, which counts as a space, and go on in the same line;
 * one already on a gate may be pushed through it, then out of the other gate along any line.
 */
export function shuntPaths(state: GameState, d: Die): ShuntPath[] {
  const start = cellOf(d);
  if (!start) return [];
  const out: ShuntPath[] = [];
  // A space reached both ways counts as a straight push.
  const add = (to: Cell, tunnel: boolean) => {
    const seen = out.find((p) => same(p.to, to));
    if (!seen) out.push({ to, tunnel });
    else if (!tunnel) seen.tunnel = false;
  };
  /** The empty spaces at the start of `line`, at most `n` of them. */
  const clear = (line: Cell[], n: number) => {
    const blocked = line.slice(0, n).findIndex((p) => !isEmptySpace(state, p));
    return line.slice(0, blocked < 0 ? n : blocked);
  };
  const partner = otherGate(state, start);
  if (partner && isEmptySpace(state, partner)) {
    add(partner, true);
    for (const line of straightLines(state.board, partner)) for (const p of clear(line, SHUNT_RANGE - 1)) add(p, true);
  }
  straightLines(state.board, start).forEach((line, side) => {
    clear(line, SHUNT_RANGE).forEach((p, k) => {
      add(p, false);
      // Onto the gate at step k + 1, out of the other at k + 2, then on along the same line.
      const exit = otherGate(state, p);
      if (!exit || !isEmptySpace(state, exit) || k + 2 > SHUNT_RANGE) return;
      add(exit, true);
      for (const q of clear(straightLines(state.board, exit)[side], SHUNT_RANGE - k - 2)) add(q, true);
    });
  });
  return out;
}

/** The spaces Kinetic Shunt can push a mech to (shuntPaths). */
export function shuntTargets(state: GameState, d: Die): Cell[] {
  return shuntPaths(state, d).map((p) => p.to);
}

/** Whether Kinetic Shunt has anything to push: a mech on the map with somewhere to go. */
export function canShunt(state: GameState): boolean {
  return shipsOnBoard(state).some((d) => shuntPaths(state, d).length > 0);
}
