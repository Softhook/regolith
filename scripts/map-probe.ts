/**
 * What kind of game a map makes: AI self-play per map, reporting length (rounds), how it ends (conquest or
 * Take Over), how much fighting, how much the first player wins, and how often a game stalls.
 *
 *   npm run selfplay:maps -- [--games=20] [--maps=all|id,id|group:name|new] [--level=2] [--jobs=fast cores] [--seed=0]
 *
 * `maps=new` plays the maps that start with something on the board (an Ice Tunnel or barriers). Each map's
 * games have seeds of their own, so a rerun replays them exactly.
 */
import { fileURLToPath } from 'node:url';
import { chooseAction, chooseCombatResponse, type AiLevel } from '../packages/ai/src';
import { apply, createGame, MAPS, mulberry32, RULESETS, type Action, type GameState } from '../packages/engine/src';
import { args } from './args';
import { defaultJobs, pool } from './pool';

const o = args({ games: '20', maps: 'all', level: '2', jobs: defaultJobs, seed: '0' });
const MAX_STEPS = 6000;

interface Task {
  map: string;
  game: number;
}
interface Result extends Task {
  finished: boolean;
  rounds: number;
  /** Seat order: 0 is the first player. */
  winnerPlace: number;
  conquests: number;
  takeOvers: number;
  attacks: number;
  destroyed: number;
  barriers: number;
  tunnels: number;
  /** Longest stretch, in rounds, without a cube placed. */
  drought: number;
  ms: number;
}

function play({ map: mapId, game }: Task): Result {
  const map = MAPS.find((m) => m.id === mapId)!;
  const seed = Number(o.seed) * 100_000 + game;
  const random = mulberry32(seed * 7919 + 13);
  const t0 = Date.now();
  const level = Number(o.level) as AiLevel;
  let s: GameState = createGame({
    players: Array.from({ length: map.players }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true })),
    seed: 900_000 + seed,
    mode: 'regolith',
    mapId,
  });
  const r: Result = {
    map: mapId,
    game,
    finished: false,
    rounds: 0,
    winnerPlace: -1,
    conquests: 0,
    takeOvers: 0,
    attacks: 0,
    destroyed: 0,
    barriers: 0,
    tunnels: 0,
    drought: 0,
    ms: 0,
  };
  const cubes = (g: GameState) => g.board.planets.reduce((n, q) => n + q.cubes.length, 0);
  let first = -1;
  let lastCube = 0;
  for (let step = 0; s.phase !== 'over' && step < MAX_STEPS; step++) {
    if (first < 0 && s.phase === 'play') first = s.turn.player;
    let action: Action | null = null;
    if (s.pending[0]?.kind === 'combat') for (const p of s.players) action ??= chooseCombatResponse(s, p.id, { level, random });
    action ??= chooseAction(s, { level, random });
    if (!action) throw new Error(`no action, ${mapId} game ${game}`);
    const before = cubes(s);
    const barriers = s.barriers?.length ?? 0;
    const lost = s.players.reduce((n, p) => n + (p.stats?.shipsLost ?? 0), 0);
    s = apply(s, action);
    if (action.type === 'attack' || action.type === 'freeAttack') r.attacks++;
    r.destroyed += s.players.reduce((n, p) => n + (p.stats?.shipsLost ?? 0), 0) - lost;
    r.barriers += (s.barriers?.length ?? 0) - barriers;
    if (s.phase !== 'setup' && cubes(s) > before && s.turn.number > 0) {
      if (action.type === 'infamy') r.takeOvers++;
      else r.conquests++;
      r.drought = Math.max(r.drought, (s.turn.number - lastCube) / map.players);
      lastCube = s.turn.number;
    }
  }
  r.finished = s.phase === 'over';
  r.rounds = s.turn.number / map.players;
  if (r.finished) r.winnerPlace = (s.winner! - first + map.players) % map.players;
  if (!r.finished) r.drought = Math.max(r.drought, (s.turn.number - lastCube) / map.players);
  r.ms = Date.now() - t0;
  return r;
}

const wanted = MAPS.filter((m) => RULESETS.regolith.mapGroups.includes(m.group)).filter((m) =>
  o.maps === 'all'
    ? true
    : o.maps === 'new'
      ? !!(m as { start?: unknown }).start
      : o.maps.startsWith('group:')
        ? m.group === o.maps.slice(6)
        : o.maps.split(',').includes(m.id),
);
const tasks: Task[] = wanted.flatMap((m) => Array.from({ length: Number(o.games) }, (_, game) => ({ map: m.id, game })));
const results: Result[] = [];
let n = 0;
await pool(fileURLToPath(import.meta.url), tasks, Number(o.jobs), play, (r) => results.push(r), {
  progress: () => process.stderr.write(`\r${++n}/${tasks.length} games`),
});
if (tasks.length) process.stderr.write('\n');

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f = (x: number, d = 1) => (Number.isNaN(x) ? '–' : x.toFixed(d));
console.log(
  '| Map | P | Cubes | Games | Unfin | Rounds | Min–Max | Conq | TakeOv | Attacks | Killed | Barr | Drought | 1st wins | Last wins | ms/game |',
);
console.log('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
for (const m of wanted) {
  const rs = results.filter((r) => r.map === m.id);
  const done = rs.filter((r) => r.finished);
  const rounds = done.map((r) => r.rounds);
  const place = (p: number) => `${Math.round((100 * done.filter((r) => r.winnerPlace === p).length) / Math.max(1, done.length))}%`;
  console.log(
    `| ${m.name} | ${m.players} | ${m.cubes} | ${rs.length} | ${rs.length - done.length} | ${f(avg(rounds))} | ${rounds.length ? `${Math.min(...rounds).toFixed(0)}–${Math.max(...rounds).toFixed(0)}` : '–'} | ${f(avg(done.map((r) => r.conquests)))} | ${f(avg(done.map((r) => r.takeOvers)))} | ${f(avg(done.map((r) => r.attacks)))} | ${f(avg(done.map((r) => r.destroyed)))} | ${f(avg(rs.map((r) => r.barriers)))} | ${f(avg(rs.map((r) => r.drought)))} | ${place(0)} | ${place(m.players - 1)} | ${f(avg(rs.map((r) => r.ms)), 0)} |`,
  );
}
