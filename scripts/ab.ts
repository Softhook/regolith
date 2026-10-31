/**
 * The A/B value tests (skill-ab.ts, power-ab.ts): the same AI level on both sides of 2-player games,
 * side A with something side B lacks, one variant at a time. Seats swap every game and each pair of
 * games shares a map seed, so a variant worth nothing comes out near 50%.
 *
 * The games are played on the fast cores (pool.ts), a pair at a time; the results are the same with
 * any number of jobs, as each game has its own seeds. Each variant stops early once it is clear
 * whether side A wins `margin` percentage points more than 50%, as much less, or neither ("verdict":
 * better, worse or even; sprt.ts); a margin of 0 always plays them all. One JSON line is printed per
 * variant, in the order given, as soon as it and the variants before it are done.
 */
import { chooseAction, chooseCombatResponse, type AiLevel } from '../packages/ai/src';
import { actor, apply, createGame, mulberry32, type Action, type GameMode, type GameState, type PlayerId } from '../packages/engine/src';
import { fileURLToPath } from 'node:url';
import { pool } from './pool';
import { addPair, FALSE_ALARM, noPairs, splitShare, sprt, type Verdict } from './sprt';

export interface AbOptions {
  /** The calling script's `import.meta.url`: its workers run it again. */
  script: string;
  /** What each variant is called in its JSON line (`skill`, `ship`). */
  name: string;
  variants: readonly string[];
  games: number;
  level: AiLevel;
  mode: string;
  jobs: number;
  /** Percentage points. */
  margin: number;
  /** Each seed plays games of its own. */
  seed: number;
  /** Where the map seeds start (each script its own, so its games stay as they were). */
  mapSeeds: number;
  /** Once play starts: set the game up for `variant`, side A in seat `a`. */
  start?: (s: GameState, variant: string, a: PlayerId) => void;
  /** The state side B chooses from, for `variant` (side A always sees the game as it is). */
  sideB?: (s: GameState, variant: string) => GameState;
  /** Whether side A may not take `action`: it then chooses again from the state side B sees. */
  veto?: (s: GameState, variant: string, action: Action) => boolean;
}

interface Result {
  winsA: number;
  unfinished: number;
  turns: number;
}

/** Plays games from-to of `variant` into a result. */
function play(o: AbOptions, variant: string, from: number, to: number): Result {
  const first = o.seed * 100_000;
  const r: Result = { winsA: 0, unfinished: 0, turns: 0 };
  for (let g = from; g < to; g++) {
    const a: PlayerId = g % 2;
    let s: GameState = createGame({
      players: [0, 1].map((i) => ({ name: `P${i}`, color: '#fff', ai: true })),
      seed: o.mapSeeds + first + Math.floor(g / 2),
      mode: o.mode as GameMode,
    });
    const random = mulberry32((first + g) * 7919 + 13);
    const { level } = o;
    let started = false;
    for (let step = 0; s.phase !== 'over' && step < 4000; step++) {
      if (s.phase === 'play' && !started) {
        started = true;
        o.start?.(s, variant, a);
      }
      let action: Action | null = null;
      if (s.pending[0]?.kind === 'combat') for (const p of s.players) action ??= chooseCombatResponse(s, p.id, { level, random });
      action ??= chooseAction(actor(s) === a || !o.sideB ? s : o.sideB(s, variant), { level, random });
      if (action && actor(s) === a && o.sideB && o.veto?.(s, variant, action))
        action = chooseAction(o.sideB(s, variant), { level, random });
      if (!action) throw new Error(`no action, game ${g}`);
      s = apply(s, action);
    }
    if (s.phase === 'over') {
      if (s.winner === a) r.winsA++;
      r.turns += s.turn.number;
    } else r.unfinished++;
  }
  return r;
}

/** Plays every variant's games and prints each one's line (see the top of this file). */
export async function runAb(o: AbOptions): Promise<void> {
  const { variants, games: n } = o;
  const tasks: [number, number, number][] = [];
  for (let k = 0; k < variants.length; k++) for (let from = 0; from < n; from += 2) tasks.push([k, from, Math.min(n, from + 2)]);
  const totals = variants.map(() => ({ winsA: 0, unfinished: 0, turns: 0, games: 0, pairs: noPairs(), verdict: 'undecided' as Verdict }));
  let printed = 0;
  await pool(
    fileURLToPath(o.script),
    tasks,
    o.jobs,
    ([k, from, to]) => play(o, variants[k], from, to),
    (r, [k, from, to]) => {
      const t = totals[k];
      t.winsA += r.winsA;
      t.unfinished += r.unfinished;
      t.turns += r.turns;
      t.games += to - from;
      addPair(t.pairs, r.winsA, to - from - r.unfinished);
      t.verdict = sprt(t.pairs, 0.5, o.margin / 100);
      for (; printed < variants.length && (totals[printed].games === n || totals[printed].verdict !== 'undecided'); printed++) {
        const { winsA, unfinished, turns, games, verdict, pairs } = totals[printed];
        console.log(
          JSON.stringify({
            [o.name]: variants[printed],
            level: o.level,
            mode: o.mode,
            games,
            winsA,
            unfinished,
            avgTurns: turns / Math.max(1, games - unfinished),
            verdict,
            split: splitShare(pairs).split,
          }),
        );
      }
    },
    { skip: ([k]) => totals[k].verdict !== 'undecided' },
  );
  if (variants.length > 1 && o.margin > 0) {
    const expected = (2 * FALSE_ALARM * variants.length).toFixed(1);
    console.error(
      `${variants.length} ${o.name}s: if none mattered, about ${expected} would still be called better or worse. Check a surprise with another seed.`,
    );
  }
}
