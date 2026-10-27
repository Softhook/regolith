/**
 * Player interaction and card impact over 2-player AI self-play (docs/HEX.md, *Interaction*).
 *
 *   npm run interaction -- [games=200] [levels=4,4] [setups=...] [jobs=fast cores]
 *
 * A setup is mode@map: the default compares Basic (Regolith without cards) and Regolith on Alpha Sector
 * (hex). Seats alternate between games and each pair of games shares a map seed. Prints one markdown table
 * of averages, a column per setup.
 *
 * Each player's value is the AI's evaluation of their own position (valueOf in evaluate.ts, in cube
 * points), scored after every action and credited to the player who acted and to what they did. The
 * interaction ratio is how much a player's value moves in the opponent's actions over how much it
 * moves in their own: near 0, each player plays their own game.
 *
 * Any argument may be given by name instead, in any order: `--levels=2,4` (args.ts). The games are
 * played on the fast cores, a pair at a time (pool.ts); the results are the same with any number of jobs.
 */
import { fileURLToPath } from 'node:url';
import type { AiLevel } from '../packages/ai/src';
import { valueOf } from '../packages/ai/src/evaluate';
import {
  actor,
  adjacent,
  apply,
  cellOf,
  createGame,
  distance,
  mulberry32,
  orbitals,
  shipsOnBoard,
  type Action,
  type GameMode,
  type GameState,
} from '../packages/engine/src';
import { aiAction } from '../packages/engine/test/helpers';
import { args } from './args';
import { defaultJobs, pool } from './pool';

const SETUPS = ['basic@alpha-hex', 'regolith@alpha-hex'];
const {
  games,
  levels: levelList,
  setups: setupList,
  jobs,
} = args({ games: '200', levels: '4,4', setups: SETUPS.join(','), jobs: defaultJobs });
const levels = levelList.split(',').map(Number) as AiLevel[];
const setups = setupList.split(',');

const CATS = ['attack', 'move', 'conquer', 'fleet', 'card', 'missile', 'other'] as const;
type Cat = (typeof CATS)[number];
const BY_TYPE: Partial<Record<Action['type'], Cat>> = {
  move: 'move',
  carry: 'move',
  swap: 'move',
  attack: 'attack',
  freeAttack: 'attack',
  power: 'attack',
  deploy: 'fleet',
  reconfigure: 'fleet',
  change: 'fleet',
  conquer: 'conquer',
  missile: 'missile',
  endTurn: 'other',
  setupKeep: 'other',
  setupReroll: 'other',
  placeStart: 'other',
  placeShip: 'other',
};
/** Follow-ups of a battle, credited to whatever started it. */
const FOLLOW = new Set<Action['type']>(['resolveCombat', 'advance', 'infamy']);
/** Every other action is research, a card pick, a skill or a tactic. */
const category = (x: Action): Cat => BY_TYPE[x.type] ?? 'card';

type Tally = Record<Cat, number>;
const tally = (): Tally => Object.fromEntries(CATS.map((c) => [c, 0])) as Tally;

interface Game {
  winnerSide: number | null;
  playerTurns: number;
  battles: number;
  /** |Δ| of each player's value in their own actions, and in the opponent's; losses in the opponent's. */
  bySelf: Tally;
  byFoe: Tally;
  harm: Tally;
  gain: Tally;
  /** Player-turns starting with the fleets at most 2 spaces apart, and the closest distance summed. */
  contact: number;
  closest: number;
  /** Player-turns starting with both players' ships in one orbit, and with the mover's orbit adding up but an enemy in it. */
  sharedOrbit: number;
  blocked: number;
  moves: number;
  contactMoves: number;
  conquers: number;
  /** Conquests of a planet the opponent had a ship orbiting in the last 2 player-turns. */
  contestedConquers: number;
  cardActions: number;
}

function play(setup: string, g: number): Game {
  const [modeName, map] = setup.split('@');
  const mode = modeName as GameMode;
  const swap = g % 2 === 1;
  const side = (p: number) => (swap ? 1 - p : p);
  let s: GameState = createGame({
    players: [0, 1].map((i) => ({ name: `P${i}`, color: '#fff', ai: true })),
    seed: 5000 + Math.floor(g / 2),
    mode,
    mapId: map,
  });
  const random = mulberry32(g * 7919 + 13);
  const r: Game = {
    winnerSide: null,
    playerTurns: 0,
    battles: 0,
    bySelf: tally(),
    byFoe: tally(),
    harm: tally(),
    gain: tally(),
    contact: 0,
    closest: 0,
    sharedOrbit: 0,
    blocked: 0,
    moves: 0,
    contactMoves: 0,
    conquers: 0,
    contestedConquers: 0,
    cardActions: 0,
  };
  const at = (d: { r: number; c: number }) => shipsOnBoard(s).find((x) => cellOf(x)!.r === d.r && cellOf(x)!.c === d.c);
  // Player-turn at which each player last had a ship in each planet's orbit.
  const inOrbit = s.board.planets.map(() => [-9, -9]);
  let turnKey = '';
  let chain: Cat = 'other';
  let values: number[] | null = null; // from the first player-turn on
  for (let step = 0; s.phase !== 'over' && step < 4000; step++) {
    const key = `${s.turn.number}:${s.turn.player}`;
    if (key !== turnKey && !s.pending.length && s.turn.phase === 'actions') {
      turnKey = key;
      r.playerTurns++;
      values ??= [0, 1].map((p) => valueOf(s, p));
      const p = s.turn.player;
      const ships = shipsOnBoard(s);
      let closest = 12;
      for (const x of ships)
        for (const y of ships) if (x.owner === p && y.owner !== p) closest = Math.min(closest, distance(cellOf(x)!, cellOf(y)!));
      r.closest += closest;
      if (closest <= 2) r.contact++;
      let shared = false;
      for (const pl of s.board.planets) {
        const here = orbitals(s.board, pl)
          .map(at)
          .filter((d) => !!d);
        for (const q of [0, 1]) if (here.some((d) => d.owner === q)) inOrbit[pl.id][q] = r.playerTurns;
        const foe = here.some((d) => d.owner !== p);
        if (foe && here.some((d) => d.owner === p)) shared = true;
        const sum = here.filter((d) => d.owner === p).reduce((n, d) => n + d.value, 0);
        if (foe && sum === pl.number && pl.cubes.length < pl.capacity) r.blocked++;
      }
      if (shared) r.sharedOrbit++;
    }
    const action = aiAction(s, [levels[side(0)], levels[side(1)]], random);
    if (!action) throw new Error(`${setup} game ${g}: no action at step ${step}`);
    const who = actor(s);
    const cat: Cat = FOLLOW.has(action.type) ? chain : category(action);
    if (!FOLLOW.has(action.type) && who === s.turn.player) chain = cat;
    if (values && cat === 'card') r.cardActions++;
    if (action.type === 'move' || action.type === 'carry') {
      r.moves++;
      if (adjacent(s.board, action.to).some((c) => at(c) && at(c)!.owner !== who)) r.contactMoves++;
    }
    if (action.type === 'conquer') {
      r.conquers++;
      if (r.playerTurns - inOrbit[action.planet][1 - who] <= 2) r.contestedConquers++;
    }
    s = apply(s, action);
    if (!values || s.phase === 'over') continue;
    const next = [0, 1].map((p) => valueOf(s, p));
    for (const p of [0, 1]) {
      const d = next[p] - values[p];
      if (who === p) {
        r.bySelf[cat] += Math.abs(d);
        if (d > 0) r.gain[cat] += d;
      } else {
        r.byFoe[cat] += Math.abs(d);
        if (d < 0) r.harm[cat] -= d;
      }
    }
    values = next;
  }
  if (s.phase === 'over') r.winnerSide = side(s.winner!);
  r.battles = s.players.reduce((n, p) => n + p.stats!.battlesWon + p.stats!.battlesLost, 0) / 2;
  return r;
}

/** Plays games from-to of one setup. */
function playRange(setup: string, from: number, to: number): Game[] {
  return Array.from({ length: to - from }, (_, i) => play(setup, from + i));
}

const sum = (gs: Game[], f: (g: Game) => number) => gs.reduce((n, g) => n + f(g), 0);
const total = (t: Tally) => CATS.reduce((n, c) => n + t[c], 0);
const pct = (x: number) => `${Math.round(100 * x)}%`;

function report(results: Map<string, Game[]>) {
  const rows: [string, (gs: Game[]) => string][] = [
    ['Games finished', (gs) => `${gs.length}`],
    ['Player-turns', (gs) => (sum(gs, (g) => g.playerTurns) / gs.length).toFixed(1)],
    ['Battles', (gs) => (sum(gs, (g) => g.battles) / gs.length).toFixed(1)],
    [
      'Interaction ratio',
      (gs) => {
        const xs = gs.map((g) => total(g.byFoe) / Math.max(1, total(g.bySelf)));
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        const se = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
        return `${m.toFixed(2)} ±${(1.96 * se).toFixed(2)}`;
      },
    ],
    ['Harm per player-turn (cubes)', (gs) => (sum(gs, (g) => total(g.harm)) / sum(gs, (g) => g.playerTurns) / 1000).toFixed(2)],
    ...(['attack', 'move', 'card', 'missile'] as const).map(
      (c) =>
        [
          `Harm from ${c === 'card' ? 'cards' : `${c}s`}`,
          (gs: Game[]) => pct(sum(gs, (g) => g.harm[c]) / sum(gs, (g) => total(g.harm))),
        ] as [string, (gs: Game[]) => string],
    ),
    ['Own gains from cards', (gs) => pct(sum(gs, (g) => g.gain.card) / sum(gs, (g) => total(g.gain)))],
    ['Card actions', (gs) => (sum(gs, (g) => g.cardActions) / gs.length).toFixed(1)],
    ['Turns with fleets ≤ 2 apart', (gs) => pct(sum(gs, (g) => g.contact) / sum(gs, (g) => g.playerTurns))],
    ['Closest enemy ship', (gs) => (sum(gs, (g) => g.closest) / sum(gs, (g) => g.playerTurns)).toFixed(1)],
    ['Moves ending next to an enemy', (gs) => pct(sum(gs, (g) => g.contactMoves) / sum(gs, (g) => g.moves))],
    ['Turns with a shared orbit', (gs) => pct(sum(gs, (g) => g.sharedOrbit) / sum(gs, (g) => g.playerTurns))],
    ['Conquests blocked per game', (gs) => (sum(gs, (g) => g.blocked) / gs.length).toFixed(2)],
    ['Conquests the opponent contested', (gs) => pct(sum(gs, (g) => g.contestedConquers) / sum(gs, (g) => g.conquers))],
  ];
  if (levels[0] !== levels[1])
    rows.push([
      `Level ${levels[1]} wins`,
      (gs) => {
        const p = sum(gs, (g) => g.winnerSide!) / gs.length;
        return `${pct(p)} ±${Math.round(196 * Math.sqrt((p * (1 - p)) / gs.length))}`;
      },
    ]);
  const finished = setups.map((x) => results.get(x)!.filter((g) => g.winnerSide !== null));
  console.log(`\nLevels ${levels.join(' vs ')}, ${games} games per setup\n`);
  console.log(`| | ${setups.join(' | ')} |`);
  console.log(`|---|${setups.map(() => '--:').join('|')}|`);
  for (const [name, f] of rows) console.log(`| ${name} | ${finished.map(f).join(' | ')} |`);
}

// Each setup's games, a pair (one map seed) at a time, collected in order.
const tasks = setups.flatMap((setup) =>
  Array.from({ length: Math.ceil(Number(games) / 2) }, (_, k) => [setup, 2 * k, Math.min(Number(games), 2 * k + 2)] as const),
);
const results = new Map(setups.map((x) => [x, [] as Game[]]));
await pool(
  fileURLToPath(import.meta.url),
  [...tasks],
  Number(jobs),
  ([setup, from, to]) => playRange(setup, from, to),
  (gs, [setup]) => results.get(setup)!.push(...gs),
);
report(results);
