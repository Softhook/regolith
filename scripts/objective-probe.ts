/**
 * What hard objectives (11 to 16) do to a game: AI self-play on the setups in
 * packages/engine/test/objectiveSetups.ts, each map's middle objective (the hub) played at the base map's own
 * number (the control) and at each hub number asked for, at each hub capacity and cube count.
 *
 *   npm run selfplay:objectives -- [--setups=all|id,id|players:2] [--hubs=11,12,13,14,15,16] [--caps=1,P,game]
 *     [--cubes=setup|n,n] [--games=24] [--level=2] [--jobs=fast cores] [--seed=0] [--json=file] [--resume=file]
 *
 * `caps`: 1 (a race: the first claim fills it), a number, P (one per player: everyone can claim it), or game
 * (the game's own, 11 → 2 and 12 → 3; skipped for 13 and up). `cubes`: the setup's own pair (open, forced),
 * or counts to play on every setup. Every configuration plays the same seeds, so they differ only by the hub.
 * `resume`: each game's result is added to this file (a JSON line) as it finishes, and games already in it (at
 * the same level and seed) are not played again, so a run stopped part way picks up where it was and reports
 * the same numbers as one that ran through.
 *
 * For each configuration: Slack (cube places left over with the hub, and without it: below 0, the hub is
 * forced), rounds, how often anyone put a cube on the hub, hub cubes per game, and the share by Take Over, the
 * round of the first, the mechs each hub claim used, how often the winner holds a hub cube and placed their
 * last cube there, claims back to your own objective, mechs destroyed on a hub perimeter, mechs standing on a
 * hub perimeter at the start of a turn (all players), attacks, and how often the first player wins.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chooseAction, chooseCombatResponse, type AiLevel } from '../packages/ai/src';
import { apply, cellOf, createGame, mulberry32, orbitals, type Action, type GameState } from '../packages/engine/src';
import { OBJECTIVE_SETUPS, hubCapacity, hubMap, hubTiles, slack, type ObjectiveSetup } from '../packages/engine/test/objectiveSetups';
import { args } from './args';
import { defaultJobs, deliverWaiting, isWorker, pool } from './pool';

const o = args({
  setups: 'all',
  hubs: '11,12,13,14,15,16',
  caps: '1,P,game',
  cubes: 'setup',
  games: '24',
  level: '2',
  jobs: defaultJobs,
  seed: '0',
  json: '',
  resume: '',
});
const MAX_STEPS = 8000;

interface Task {
  setup: string;
  hub: number;
  cap: number;
  cubes: number;
  game: number;
}
interface Result extends Task {
  finished: boolean;
  rounds: number;
  winnerPlace: number;
  /** Combats: attacks and shots. */
  attacks: number;
  /** Cubes placed on a hub, by Claim and by Take Over. */
  hubClaims: number;
  hubTakeOvers: number;
  /** Round of the first cube on a hub, or -1. */
  hubFirst: number;
  /** Mechs on the perimeter for each hub claim. */
  hubMechs: number[];
  /** The winner holds a cube on a hub; the winning cube went on one. */
  winnerOnHub: boolean;
  winningCubeOnHub: boolean;
  /** Players holding a hub cube at the end. */
  hubHolders: number;
  backToOwn: number;
  /** Mechs destroyed while standing on a hub perimeter. */
  hubKills: number;
  /** Mechs on hub perimeters at the start of each turn, summed (divide by turns). */
  hubCamp: number;
  turns: number;
  /** Longest stretch, in rounds, without a cube placed. */
  drought: number;
}

const setupOf = (id: string) => OBJECTIVE_SETUPS.find((s) => s.id === id)!;

function play(t: Task): Result {
  const setup = setupOf(t.setup);
  const map = hubMap(setup, t.hub, t.cap, t.cubes);
  const seed = Number(o.seed) * 100_000 + t.game;
  const random = mulberry32(seed * 7919 + 13);
  const level = Number(o.level) as AiLevel;
  let s: GameState = createGame({
    players: Array.from({ length: setup.players }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true })),
    seed: 900_000 + seed,
    mode: 'regolith',
    mapId: map.id,
  });
  const tiles = new Set(hubTiles(setup));
  const hubs = t.hub ? s.board.planets.filter((p) => tiles.has(s.board.cells[p.r][p.c].tile)) : [];
  if (t.hub && hubs.length !== tiles.size) throw new Error(`${map.id}: ${hubs.length} hubs laid, ${tiles.size} in the layout`);
  const hubIds = new Set(hubs.map((p) => p.id));
  const perimeter = new Set(hubs.flatMap((p) => orbitals(s.board, p).map((c) => `${c.r},${c.c}`)));
  const onPerimeter = (g: GameState) =>
    g.dice.filter((d) => {
      const c = cellOf(d);
      return !!c && perimeter.has(`${c.r},${c.c}`);
    });
  const r: Result = {
    ...t,
    finished: false,
    rounds: 0,
    winnerPlace: -1,
    attacks: 0,
    hubClaims: 0,
    hubTakeOvers: 0,
    hubFirst: -1,
    hubMechs: [],
    winnerOnHub: false,
    winningCubeOnHub: false,
    hubHolders: 0,
    backToOwn: 0,
    hubKills: 0,
    hubCamp: 0,
    turns: 0,
    drought: 0,
  };
  const cubes = (g: GameState) => g.board.planets.reduce((n, q) => n + q.cubes.length, 0);
  let first = -1;
  let lastCube = 0;
  let turn = -1;
  let lastPlanet = -1;
  for (let step = 0; s.phase !== 'over' && step < MAX_STEPS; step++) {
    if (first < 0 && s.phase === 'play') first = s.turn.player;
    if (s.phase === 'play' && s.turn.number !== turn) {
      turn = s.turn.number;
      r.turns++;
      r.hubCamp += onPerimeter(s).length;
    }
    let action: Action | null = null;
    if (s.pending[0]?.kind === 'combat') for (const p of s.players) action ??= chooseCombatResponse(s, p.id, { level, random });
    action ??= chooseAction(s, { level, random });
    if (!action) throw new Error(`no action, ${map.id} game ${t.game}`);
    const before = cubes(s);
    const fights = s.combatCounter;
    const standing = onPerimeter(s);
    const mover = s.turn.player;
    const target = action.type === 'conquer' || action.type === 'infamy' ? action.planet : -1;
    const ownThere = target >= 0 ? s.board.planets[target].cubes.includes(mover) : false;
    const mechs = target >= 0 ? onPerimeter(s).filter((d) => d.owner === mover).length : 0;
    s = apply(s, action);
    r.attacks += s.combatCounter - fights;
    r.hubKills += standing.filter((d) => s.dice.find((x) => x.id === d.id)?.loc.zone === 'scrapyard').length;
    if (s.phase !== 'setup' && cubes(s) > before && s.turn.number > 0) {
      lastPlanet = target;
      if (action.type === 'conquer' && ownThere) r.backToOwn++;
      if (hubIds.has(target)) {
        if (action.type === 'infamy') r.hubTakeOvers++;
        else {
          r.hubClaims++;
          r.hubMechs.push(mechs);
        }
        if (r.hubFirst < 0) r.hubFirst = s.turn.number / setup.players;
      }
      r.drought = Math.max(r.drought, (s.turn.number - lastCube) / setup.players);
      lastCube = s.turn.number;
    }
  }
  r.finished = s.phase === 'over';
  r.rounds = s.turn.number / setup.players;
  r.hubHolders = new Set(hubs.flatMap((p) => s.board.planets[p.id].cubes)).size;
  if (r.finished) {
    const w = s.winner!;
    r.winnerPlace = (w - first + setup.players) % setup.players;
    r.winnerOnHub = hubs.some((p) => s.board.planets[p.id].cubes.includes(w));
    r.winningCubeOnHub = hubIds.has(lastPlanet);
  } else r.drought = Math.max(r.drought, (s.turn.number - lastCube) / setup.players);
  return r;
}

const list = (x: string) => x.split(',').filter(Boolean);
const wanted = OBJECTIVE_SETUPS.filter((st) =>
  o.setups === 'all' ? true : o.setups.startsWith('players:') ? st.players === Number(o.setups.slice(8)) : list(o.setups).includes(st.id),
);
if (!wanted.length) throw new Error(`No setups match ${o.setups} (known: ${OBJECTIVE_SETUPS.map((s) => s.id).join(', ')})`);

interface Config {
  setup: ObjectiveSetup;
  hub: number;
  cap: number;
  cubes: number;
  control: boolean;
}
const configs: Config[] = wanted.flatMap((setup) => {
  const cubeCounts = o.cubes === 'setup' ? setup.cubes : list(o.cubes).map(Number);
  return cubeCounts.flatMap((cubes) => {
    const control = {
      setup,
      hub: setup.control,
      cap: setup.control ? hubCapacity('game', setup.control, setup.players)! : 0,
      cubes,
      control: true,
    };
    const seen = new Set<string>();
    const rest = list(o.hubs)
      .map(Number)
      .filter((h) => h !== setup.control)
      .flatMap((hub) =>
        list(o.caps).flatMap((c) => {
          const cap = hubCapacity(c, hub, setup.players);
          if (cap === undefined || seen.has(`${hub}x${cap}`)) return [];
          seen.add(`${hub}x${cap}`);
          return [{ setup, hub, cap, cubes, control: false }];
        }),
      );
    return [control, ...rest];
  });
});
const tasks: Task[] = configs.flatMap((c) =>
  Array.from({ length: Number(o.games) }, (_, game) => ({ setup: c.setup.id, hub: c.hub, cap: c.cap, cubes: c.cubes, game })),
);
const taskKey = (t: Task) => `${t.setup}|${t.hub}|${t.cap}|${t.cubes}|${t.game}`;
const wantedKeys = new Set(tasks.map(taskKey));
// Results from an earlier run into the same file, at this level and seed, for games this run asks for.
const kept: Result[] =
  o.resume && existsSync(o.resume)
    ? readFileSync(o.resume, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Result & { level: string; seed: string })
        .filter((r) => r.level === o.level && r.seed === o.seed && wantedKeys.has(taskKey(r)))
    : [];
const keptKeys = new Set(kept.map(taskKey));
const todo = tasks.filter((t) => !keptKeys.has(taskKey(t)));
const results: Result[] = [...kept];
let n = kept.length;
if (kept.length) process.stderr.write(`${kept.length} games kept from ${o.resume}\n`);
if (!isWorker && o.resume)
  // Stopped part way: every game finished goes into the file, so the next run plays only the rest.
  process.on('SIGINT', () => {
    deliverWaiting();
    process.stderr.write(`\nStopped: ${results.length} games in ${o.resume}; run again with it to go on.\n`);
    process.exit(130);
  });
await pool(
  fileURLToPath(import.meta.url),
  todo,
  Number(o.jobs),
  play,
  (r) => {
    results.push(r);
    if (o.resume) appendFileSync(o.resume, JSON.stringify({ ...r, level: o.level, seed: o.seed }) + '\n');
  },
  { progress: () => process.stderr.write(`\r${++n}/${tasks.length} games`) },
);
if (todo.length) process.stderr.write('\n');

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const se = (xs: number[]) => (xs.length > 1 ? Math.sqrt(avg(xs.map((x) => (x - avg(xs)) ** 2)) / (xs.length - 1)) : NaN);
const f = (x: number, d = 1) => (Number.isNaN(x) ? '–' : x.toFixed(d));
const pct = (k: number, of: number) => (of ? `${Math.round((100 * k) / of)}%` : '–');

const rows = configs.map((c) => {
  const rs = results.filter((r) => r.setup === c.setup.id && r.hub === c.hub && r.cap === c.cap && r.cubes === c.cubes);
  const done = rs.filter((r) => r.finished);
  const sl = slack(c.setup, c.hub, c.cap, c.cubes);
  const hubCubes = rs.map((r) => r.hubClaims + r.hubTakeOvers);
  const firsts = rs.map((r) => r.hubFirst).filter((x) => x >= 0);
  return {
    setup: c.setup.id,
    players: c.setup.players,
    hub: c.hub,
    cap: c.cap,
    cubes: c.cubes,
    control: c.control,
    slack: sl.all,
    slackWithoutHub: sl.withoutHub,
    games: rs.length,
    unfinished: rs.length - done.length,
    rounds: avg(done.map((r) => r.rounds)),
    roundsSe: se(done.map((r) => r.rounds)),
    hubGames: rs.filter((r) => r.hubClaims + r.hubTakeOvers > 0).length / Math.max(1, rs.length),
    hubCubes: avg(hubCubes),
    takeOverShare: avg(hubCubes) ? avg(rs.map((r) => r.hubTakeOvers)) / avg(hubCubes) : NaN,
    hubFirst: avg(firsts),
    hubMechs: avg(rs.flatMap((r) => r.hubMechs)),
    winnerOnHub: done.filter((r) => r.winnerOnHub).length / Math.max(1, done.length),
    winningCubeOnHub: done.filter((r) => r.winningCubeOnHub).length / Math.max(1, done.length),
    hubHolders: avg(rs.map((r) => r.hubHolders)),
    backToOwn: avg(rs.map((r) => r.backToOwn)),
    hubKills: avg(rs.map((r) => r.hubKills)),
    hubCamp: avg(rs.map((r) => (r.turns ? r.hubCamp / r.turns : 0))),
    attacks: avg(rs.map((r) => r.attacks)),
    drought: avg(rs.map((r) => r.drought)),
    firstWins: done.filter((r) => r.winnerPlace === 0).length / Math.max(1, done.length),
  };
});

for (const setup of wanted) {
  console.log(`\n### ${setup.name} (${setup.id}), ${setup.players} players\n\n${setup.note}\n`);
  console.log(
    '| Hub | Cap | Cubes | Slack (no hub) | Games | Unfin | Rounds | Δ | Hub used | Hub cubes | by TO | 1st hub rd | Mechs/claim | Winner on hub | Won on hub | Back to own | Hub kills | Camp | Attacks | Drought | 1st wins |',
  );
  console.log('|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const x of rows.filter((x) => x.setup === setup.id)) {
    const base = rows.find((y) => y.setup === x.setup && y.cubes === x.cubes && y.control)!;
    const hub = x.control ? `${x.hub || 'void'} (map)` : String(x.hub);
    const d = x.control ? '' : `${x.rounds - base.rounds >= 0 ? '+' : ''}${f(x.rounds - base.rounds)}`;
    const hasHub = x.hub > 0;
    console.log(
      `| ${hub} | ${x.cap || '–'} | ${x.cubes} | ${x.slack} (${x.slackWithoutHub}) | ${x.games} | ${x.unfinished} | ${f(x.rounds)} ±${f(x.roundsSe)} | ${d} | ${hasHub ? pct(x.hubGames, 1) : '–'} | ${hasHub ? f(x.hubCubes) : '–'} | ${hasHub && x.hubCubes ? pct(x.takeOverShare, 1) : '–'} | ${f(x.hubFirst)} | ${f(x.hubMechs)} | ${hasHub ? pct(x.winnerOnHub, 1) : '–'} | ${hasHub ? pct(x.winningCubeOnHub, 1) : '–'} | ${f(x.backToOwn)} | ${hasHub ? f(x.hubKills) : '–'} | ${hasHub ? f(x.hubCamp) : '–'} | ${f(x.attacks)} | ${f(x.drought)} | ${pct(x.firstWins, 1)} |`,
    );
  }
}
if (o.json) {
  writeFileSync(o.json, JSON.stringify({ options: o, setups: wanted, rows }, null, 2));
  console.error(`wrote ${o.json}`);
}
