/**
 * Stalls and shutouts in Regolith self-play: how often barriers wall players off from every planet they
 * could still claim, how long that lasts and what ends it, against games without the Wisp's barriers and
 * with a cap on them.
 *
 * At the start of every turn each player is open (a planet they can still claim on the board), locked
 * (none, but an enemy mech they can reach, so combat can still earn Infamy) or sealed (neither: only
 * cards help, research breakthroughs to Ice Tunnel, Power Grab, Orbital Cannon or Infiltration). What a
 * player can reach is a flood fill over spaces, walled by barriers, planets and the board's edge, through
 * the Ice Tunnel pair, from their mechs and the orbits they can drop into; mechs don't wall (they move).
 * A planet is live if it has room and the open orbit spaces they reach can make its number (Martial Law,
 * Science and Hacking counted). A stall is the longest stretch without a cube placed, in rounds.
 *
 *   npm run selfplay:stalls -- [games=60] [players=2,3,4] [variants=on,off,cap3] [level=3] [jobs=fast cores] [seed=0] [out=test-results/stalls.jsonl] [fresh=0]
 *
 * Each game goes into `out` as a JSON line the moment it finishes, so a run can be stopped at any point
 * (Ctrl-C reports on what is done) and run again to carry on: games already in the file are left out, the
 * same games as before, as each has its own seeds. `fresh=1` starts the file over; `games=0` only reports. Variants: `on` (as the rules are), `off` (no Wisp barriers; Barricade
 * still deals them), `capN` (at most N barriers per player on the map, the oldest removed), `oldai` (the AI
 * without PLANNING.walls) and `abwalls` (PLANNING.walls for one seat only; the report adds that seat's wins).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseAction, chooseCombatResponse, type AiLevel } from '../packages/ai/src';
import { PLANNING } from '../packages/ai/src/evaluate';
import {
  actor,
  apply,
  barrierAt,
  createGame,
  cellAt,
  linked,
  MAPS,
  mulberry32,
  orbitals,
  planetFreeSlots,
  RULESETS,
  skillRules,
  spaces,
  type Action,
  type Cell,
  type GameState,
  type PlayerId,
} from '../packages/engine/src';
import { args } from './args';
import { defaultJobs, deliverWaiting, isWorker, pool } from './pool';

const o = args({
  games: '60',
  players: '2,3,4',
  variants: 'on,off,cap3',
  level: '3',
  jobs: defaultJobs,
  seed: '0',
  out: 'test-results/stalls.jsonl',
  fresh: '0',
});
const MAX_STEPS = 8000;

type Standing = 'open' | 'locked' | 'sealed';

interface Task {
  variant: string;
  players: number;
  game: number;
}

interface Shutout {
  /** Turns it lasted. */
  turns: number;
  /** Every player sealed at some point in it. */
  sealed: boolean;
  /** What ended it: a cube by conquest or Infamy, an Ice Tunnel opening a way, a mech destroyed, or the game cut off. */
  end: 'conquer' | 'infamy' | 'tunnel' | 'other' | 'unfinished';
}

interface GameResult extends Task {
  map: string;
  finished: boolean;
  rounds: number;
  /** Longest run of rounds without a cube placed. */
  longestDrought: number;
  barriers: number;
  barriersByCard: number;
  tunnels: number;
  infamy: number;
  conquests: number;
  /** Player-turns locked or sealed (any player), and sealed. */
  lockedTurns: number;
  sealedTurns: number;
  /** Turns with at least one player locked or sealed, of all turns. */
  anyLockedTurns: number;
  turns: number;
  /** Stretches when no player had a live planet. */
  shutouts: Shutout[];
  /** With `abwalls`: whether side A, the seat with PLANNING.walls, won. */
  sideAWon?: boolean;
  /** The run's AI level and seed, as given. */
  level?: string;
  seed?: string;
}

/** The spaces `p` can reach: from their mechs and drop orbits, through spaces and the Ice Tunnel, not barriers. */
function reach(s: GameState, p: PlayerId): Set<string> {
  const k = (c: Cell) => `${c.r},${c.c}`;
  const seen = new Set<string>();
  const queue: Cell[] = [];
  const add = (c: Cell) => {
    if (cellAt(s.board, c)?.kind !== 'space' || barrierAt(s, c) || seen.has(k(c))) return;
    seen.add(k(c));
    queue.push(c);
  };
  for (const d of s.dice) if (d.owner === p && d.loc.zone === 'board') add({ r: d.loc.r, c: d.loc.c });
  for (const planet of s.board.planets) if (planet.cubes.includes(p)) for (const c of orbitals(s.board, planet)) add(c);
  if (skillRules(s, p).some((r) => r.deployIsolated)) for (const c of spaces(s.board)) add(c);
  while (queue.length) for (const n of linked(s, queue.pop()!)) add(n);
  return seen;
}

function standing(s: GameState, p: PlayerId): Standing {
  const area = reach(s, p);
  const pl = s.players[p];
  const rules = skillRules(s, p).flatMap((r) => (r.conquer ? [r.conquer] : []));
  // How far past six a ship the claim's skills reach: Hacking's tolerance, Science's research, Martial Law's Power.
  const bonus =
    Math.max(0, ...rules.map((r) => r.tolerance ?? 0)) +
    (rules.some((r) => r.spendResearch) ? pl.research - 1 : 0) +
    Math.max(0, ...rules.flatMap((r) => r.sums?.({ sum: 0, ships: [], dominance: pl.dominance, research: pl.research }) ?? []));
  const roomy = s.board.planets.filter((q) => planetFreeSlots(q) > 0);
  const live = roomy.some((planet) => {
    const own = planet.cubes.filter((x) => x === p).length;
    // Entanglement: a second cube only once you hold every planet with room.
    if (own && roomy.some((q) => !q.cubes.includes(p))) return false;
    const open = orbitals(s.board, planet).filter((c) => area.has(`${c.r},${c.c}`)).length;
    return open > 0 && 6 * open + bonus >= planet.number + 3 * own;
  });
  if (live) return 'open';
  const enemy = s.dice.some((d) => d.owner !== p && d.loc.zone === 'board' && area.has(`${d.loc.r},${d.loc.c}`));
  return enemy ? 'locked' : 'sealed';
}

const cubesOnBoard = (s: GameState) => s.board.planets.reduce((n, q) => n + q.cubes.length, 0);

/** The state the turn player chooses from: with `off`, their Wisps' barrier already used this turn. */
function chooser(s: GameState, variant: string): GameState {
  if (variant !== 'off' || s.phase !== 'play') return s;
  const abilityUsed = { ...s.turn.abilityUsed };
  for (const d of s.dice) if (d.owner === s.turn.player && d.value === 6) abilityUsed[d.id] = true;
  return { ...s, turn: { ...s.turn, abilityUsed } };
}

function play({ variant, players, game }: Task): GameResult {
  const seed = Number(o.seed) * 100_000 + game;
  const random = mulberry32(seed * 7919 + 13);
  const maps = MAPS.filter((m) => m.players === players && RULESETS.regolith.mapGroups.includes(m.group));
  const map = maps[game % maps.length];
  let s = createGame({
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true })),
    seed: 900_000 + seed,
    mode: 'regolith',
    mapId: map.id,
  });
  const cap = variant.startsWith('cap') ? Number(variant.slice(3)) : Infinity;
  // With `abwalls`, side A (seat game % 2) has what side B lacks.
  const sideA = game % players;
  const level = Number(o.level) as AiLevel;
  const r: GameResult = {
    variant,
    players,
    game,
    map: map.id,
    finished: false,
    rounds: 0,
    longestDrought: 0,
    barriers: 0,
    barriersByCard: 0,
    tunnels: 0,
    infamy: 0,
    conquests: 0,
    lockedTurns: 0,
    sealedTurns: 0,
    anyLockedTurns: 0,
    turns: 0,
    shutouts: [],
  };
  let turnSeen = -1;
  let lastCubeTurn = 0;
  let shutout: Shutout | undefined;
  for (let step = 0; s.phase !== 'over' && step < MAX_STEPS; step++) {
    // Each turn's start: where everyone stands.
    if (s.phase === 'play' && s.turn.number !== turnSeen) {
      turnSeen = s.turn.number;
      r.turns++;
      const all = s.players.map((p) => standing(s, p.id));
      const out = all.filter((x) => x !== 'open').length;
      r.lockedTurns += out;
      r.sealedTurns += all.filter((x) => x === 'sealed').length;
      if (out) r.anyLockedTurns++;
      if (out === players) {
        shutout ??= { turns: 0, sealed: false, end: 'unfinished' };
        shutout.turns++;
        if (all.every((x) => x === 'sealed')) shutout.sealed = true;
      } else if (shutout) {
        if (shutout.end === 'unfinished') shutout.end = 'other';
        r.shutouts.push(shutout);
        shutout = undefined;
      }
    }
    // The AI's settings for whoever acts.
    PLANNING.walls = variant === 'oldai' ? false : variant === 'abwalls' ? actor(s) === sideA : true;
    let action: Action | null = null;
    if (s.pending[0]?.kind === 'combat') for (const p of s.players) action ??= chooseCombatResponse(s, p.id, { level, random });
    action ??= chooseAction(chooser(s, variant), { level, random });
    if (!action) throw new Error(`no action, ${variant} game ${game}`);
    const before = { cubes: cubesOnBoard(s), barriers: s.barriers?.length ?? 0, gates: JSON.stringify(s.gates) };
    s = apply(s, action);
    const placed = s.phase !== 'setup' && cubesOnBoard(s) > before.cubes;
    if (placed && s.turn.number > 0) {
      r.longestDrought = Math.max(r.longestDrought, (s.turn.number - lastCubeTurn) / players);
      lastCubeTurn = s.turn.number;
      if (action.type === 'infamy') r.infamy++;
      else r.conquests++;
      if (shutout && shutout.end === 'unfinished') shutout.end = action.type === 'infamy' ? 'infamy' : 'conquer';
    }
    const added = (s.barriers?.length ?? 0) - before.barriers;
    if (added > 0) {
      r.barriers += added;
      if (action.type !== 'power') r.barriersByCard += added;
      if (cap < Infinity) {
        // The cap: each owner's oldest barriers go first.
        const kept = [...s.barriers!].reverse().filter((b, i, all) => all.slice(0, i).filter((x) => x.owner === b.owner).length < cap);
        s = { ...s, barriers: kept.reverse() };
      }
    }
    if (JSON.stringify(s.gates) !== before.gates && s.gates.length === 2) {
      r.tunnels++;
      if (shutout && shutout.end === 'unfinished') shutout.end = 'tunnel';
    }
  }
  r.finished = s.phase === 'over';
  if (variant === 'abwalls' && r.finished) r.sideAWon = s.winner === sideA;
  r.rounds = s.turn.number / players;
  if (!r.finished) r.longestDrought = Math.max(r.longestDrought, (s.turn.number - lastCubeTurn) / players);
  if (shutout) r.shutouts.push(shutout);
  return r;
}

/** What makes a game the same game: a rerun with these replays it exactly. */
const keyOf = (t: Task & { level?: string; seed?: string }) =>
  `${t.variant}/${t.players}/${t.game}/${t.level ?? o.level}/${t.seed ?? o.seed}`;

if (!isWorker && o.fresh === '1' && existsSync(o.out)) rmSync(o.out);
/** Games already played into `out`, by an earlier run, finished or stopped part way. */
const results: GameResult[] = existsSync(o.out)
  ? readFileSync(o.out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as GameResult)
  : [];
const played = new Set(results.map(keyOf));
const tasks: Task[] = [];
for (const players of o.players.split(',').map(Number))
  for (const variant of o.variants.split(','))
    for (let game = 0; game < Number(o.games); game++)
      if (!played.has(keyOf({ variant, players, game }))) tasks.push({ variant, players, game });

if (!isWorker) {
  mkdirSync(dirname(o.out), { recursive: true });
  if (results.length) process.stderr.write(`${results.length} games already in ${o.out}, ${tasks.length} to play\n`);
  // Stopped part way: report on every game finished, then leave.
  process.on('SIGINT', () => {
    deliverWaiting();
    process.stderr.write('\nStopped.\n');
    report();
    process.exit(130);
  });
}
let finishedTasks = 0;
await pool(
  fileURLToPath(import.meta.url),
  tasks,
  Number(o.jobs),
  play,
  (r) => {
    // Each game goes into the file as it finishes, so a stopped run keeps it and the next one carries on.
    const row = { ...r, level: o.level, seed: o.seed };
    results.push(row);
    appendFileSync(o.out, JSON.stringify(row) + '\n');
  },
  { progress: () => process.stderr.write(`\r${++finishedTasks}/${tasks.length} games`) },
);
if (tasks.length) process.stderr.write('\n');
report();

function report() {
  const pct = (n: number, d: number) => `${d ? Math.round((100 * n) / d) : 0}%`;
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–');
  console.log(
    '| Players | Variant | Games | Unfinished | Rounds | Barriers | Longest drought | Drought ≥ 5 rounds | Any player locked out | Full shutout | Full seal | Shutout ends (conquer/infamy/tunnel/other/unfinished) | Side A wins |',
  );
  console.log('|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|');
  for (const players of o.players.split(',').map(Number))
    for (const variant of o.variants.split(',')) {
      const rs = results.filter(
        (r) => r.players === players && r.variant === variant && keyOf(r) === keyOf({ ...r, level: o.level, seed: o.seed }),
      );
      const shut = rs.filter((r) => r.shutouts.length);
      const ends = { conquer: 0, infamy: 0, tunnel: 0, other: 0, unfinished: 0 };
      for (const r of rs) for (const x of r.shutouts) ends[x.end]++;
      console.log(
        `| ${players} | ${variant} | ${rs.length} | ${rs.filter((r) => !r.finished).length} | ${avg(rs.filter((r) => r.finished).map((r) => r.rounds))} | ${avg(rs.map((r) => r.barriers))} | ${avg(rs.map((r) => r.longestDrought))} | ${pct(rs.filter((r) => r.longestDrought >= 5).length, rs.length)} | ${pct(
          rs.reduce((a, r) => a + r.anyLockedTurns, 0),
          rs.reduce((a, r) => a + r.turns, 0),
        )} of turns | ${pct(shut.length, rs.length)} (avg ${avg(shut.flatMap((r) => r.shutouts.map((x) => x.turns / players)))} rounds) | ${pct(rs.filter((r) => r.shutouts.some((x) => x.sealed)).length, rs.length)} | ${Object.values(ends).join('/')} | ${variant === 'abwalls' ? pct(rs.filter((r) => r.sideAWon).length, rs.filter((r) => r.finished).length) : '–'} |`,
      );
    }
}
