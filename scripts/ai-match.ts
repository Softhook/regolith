/**
 * AI benchmark: plays two AI levels against each other and reports wins and thinking time.
 *
 *   npm run ai:match -- <a> <b> [games=400] [mode=regolith] [players=2] [jobs=fast cores] [margin=10] [seed=0]
 *
 * `a` and `b` are the two levels. Any argument may be given by name instead, in any order:
 * `npm run ai:match -- 3 4 --seed=1` (args.ts).
 *
 * The match stops early once it is clear whether level A wins `margin` percentage points more than
 * an equal level would (50% with 2 players), as much less, or neither (sprt.ts). With the defaults
 * a large gap takes a few dozen games, a 10-point one under 200 on average, and equal levels about
 * 230; up to 400 games find 9 in 10 differences of the margin. A match that runs out of games first
 * is undecided. A margin of 0 always plays them all.
 *
 * A level may name a git commit to play that version of the AI against the current one:
 * `3@HEAD~1` is Commodore as of the previous commit (against today's engine). Its source is
 * extracted once into .cache/ai-match/<commit hash>.
 *
 * Seats alternate between games and each pair of games shares a map seed, so neither level
 * gets the better start. Another `seed` plays other games: to check a surprising result. With more than 2 players, level A plays seat 0 and level B the rest.
 * The games are played by `jobs` worker processes (pool.ts), a pair of games (one map seed) at a
 * time; the results, and where the match stops, are the same with any number, as each game has its
 * own seeds. Ctrl-C stops early and reports the games finished so far.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as current from '../packages/ai/src';
import { args } from './args';
import { defaultJobs, deliverWaiting, isWorker, pool } from './pool';
import { addPair, noPairs, splitShare, sprt, type Verdict } from './sprt';
import { actor, apply, createGame, mulberry32, type Action, type GameMode, type GameState } from '../packages/engine/src';

type Ai = Pick<typeof current, 'chooseAction' | 'chooseCombatResponse'>;

const { a, b, games, mode, players, jobs, margin, seed } = args({
  a: '1',
  b: '3',
  games: '400',
  mode: 'regolith',
  players: '2',
  jobs: defaultJobs,
  margin: '10',
  seed: '0',
});
const specs = [a, b];
// Split at the first @ only: refs such as main@{1} contain one too.
const parts = specs.map((x) => x.match(/^([^@]*)(?:@(.*))?$/)!);
const levels = parts.map(([, level]) => Number(level) as current.AiLevel);
const ais: Ai[] = await Promise.all(parts.map(([, , ref]) => loadAi(ref)));
const n = Number(games);
const seats = Number(players);
/** Where this run's game seeds start: each `seed` has games of its own. */
const first = Number(seed) * 100_000;

interface Result {
  wins: number[];
  unfinished: number;
  turns: number;
  time: number[];
  decisions: number[];
  slowest: number[];
}

/** The AI at git commit `ref` (extracted on first use), or the current one. */
async function loadAi(ref?: string): Promise<Ai> {
  if (!ref) return current;
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 28 });
  const commit = git('rev-parse', `${ref}^{commit}`).toString().trim();
  const dir = fileURLToPath(new URL(`../.cache/ai-match/${commit}`, import.meta.url));
  if (!existsSync(dir)) {
    // Extracted beside the final directory and renamed, so parallel workers never see half of it.
    const tmp = `${dir}.${process.pid}`;
    mkdirSync(tmp, { recursive: true });
    execFileSync('tar', ['-x', '-C', tmp, '--strip-components=3'], { input: git('archive', commit, 'packages/ai/src') });
    try {
      renameSync(tmp, dir);
    } catch {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return import(`${dir}/index.ts`);
}

function empty(): Result {
  return { wins: [0, 0], unfinished: 0, turns: 0, time: [0, 0], decisions: [0, 0], slowest: [0, 0] };
}

/** Adds `r` into `total`. */
function merge(total: Result, r: Result) {
  for (const i of [0, 1]) {
    total.wins[i] += r.wins[i];
    total.time[i] += r.time[i];
    total.decisions[i] += r.decisions[i];
    total.slowest[i] = Math.max(total.slowest[i], r.slowest[i]);
  }
  total.unfinished += r.unfinished;
  total.turns += r.turns;
}

/** Plays games from-to into a result. */
function play(from: number, to: number): Result {
  const r = empty();
  for (let g = from; g < to; g++) {
    const swap = seats === 2 && g % 2 === 1;
    // Which side (0 = level A, 1 = level B) plays seat p.
    const side = (p: number) => (seats === 2 ? (swap ? 1 - p : p) : p === 0 ? 0 : 1);
    let s: GameState = createGame({
      players: Array.from({ length: seats }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true })),
      seed: 5000 + first + Math.floor(g / 2),
      mode: mode as GameMode,
    });
    const random = mulberry32((first + g) * 7919 + 13);
    for (let step = 0; s.phase !== 'over' && step < 3000; step++) {
      let action: Action | null = null;
      if (s.pending[0]?.kind === 'combat') {
        for (const p of s.players) action ??= ais[side(p.id)].chooseCombatResponse(s, p.id, { level: levels[side(p.id)], random });
      }
      const who = side(actor(s));
      const t = performance.now();
      action ??= ais[who].chooseAction(s, { level: levels[who], random });
      const dt = performance.now() - t;
      r.time[who] += dt;
      r.decisions[who]++;
      r.slowest[who] = Math.max(r.slowest[who], dt);
      if (!action) throw new Error(`game ${g}: no action at step ${step}`);
      s = apply(s, action);
    }
    if (s.phase === 'over') {
      r.wins[side(s.winner!)]++;
      r.turns += s.turn.number;
    } else r.unfinished++;
  }
  return r;
}

function report(r: Result, stopped: boolean, verdict: Verdict) {
  const finished = r.wins[0] + r.wins[1];
  const played = finished + r.unfinished;
  console.log(
    `\n\n${mode}, ${seats} players, ${played} games${stopped ? ` (stopped early, of ${n})` : played < n && verdict !== 'undecided' ? ` (decided early, of ${n})` : ''}${r.unfinished ? ` (${r.unfinished} unfinished)` : ''}, ${(r.turns / Math.max(1, finished)).toFixed(1)} turns on average`,
  );
  for (const i of [0, 1]) {
    const avg = r.time[i] / Math.max(1, r.decisions[i]);
    console.log(`  level ${specs[i]}: ${r.wins[i]} wins, ${avg.toFixed(0)} ms per decision, slowest ${r.slowest[i].toFixed(0)} ms`);
  }
  if (seats === 2 && finished) {
    // How surprising the score would be between equal players: |z| > 2 is about p < 0.05.
    const z = (r.wins[0] - finished / 2) / Math.sqrt(finished / 4);
    console.log(`  level ${specs[0]} won ${((100 * r.wins[0]) / finished).toFixed(1)}% (z = ${z.toFixed(2)})`);
  }
  if (Number(margin) > 0) {
    const what = {
      better: `stronger than level ${specs[1]}`,
      worse: `weaker than level ${specs[1]}`,
      even: `no stronger or weaker than level ${specs[1]} by ${margin} points`,
      undecided: `undecided: more games needed to tell a ${margin}-point difference`,
    }[verdict];
    console.log(`  level ${specs[0]} is ${what} (SPRT)`);
  }
  if (pairsA.n) {
    const { split, independent } = splitShare(pairsA, 1 / seats);
    console.log(`  ${split}% of ${pairsA.n} pairs split 1–1 (about ${independent}% if games were independent and even)`);
  }
}

const total = empty();
const pairsA = noPairs();
let verdict: Verdict = 'undecided';
if (!isWorker) {
  process.on('SIGINT', () => {
    // The workers stop mid-game; the games they finished count.
    deliverWaiting();
    report(total, true, verdict);
    process.exit(130);
  });
}
const pairs: [number, number][] = [];
for (let from = 0; from < n; from += 2) pairs.push([from, Math.min(n, from + 2)]);
let finished = 0;
await pool(
  fileURLToPath(import.meta.url),
  pairs,
  Number(jobs),
  ([from, to]) => play(from, to),
  (r, [from, to]) => {
    merge(total, r);
    addPair(pairsA, r.wins[0], to - from - r.unfinished);
    verdict = sprt(pairsA, 1 / seats, Number(margin) / 100);
  },
  {
    skip: () => verdict !== 'undecided',
    progress: ([from, to]) => {
      finished += to - from;
      process.stdout.write(`\r${finished}/${n} games: L${specs[0]} ${total.wins[0]} – ${total.wins[1]} L${specs[1]}`);
    },
  },
);
report(total, false, verdict);
