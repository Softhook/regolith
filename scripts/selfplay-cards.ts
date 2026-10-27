/**
 * AI self-play card benchmark: card usage, win rates, pick rates, and draft timing/context.
 *
 * Plays 2-player games through the card audit (packages/engine/test/audit.ts), so every step is
 * checked as in the audit, and stops on the first game with an anomaly. Unlike the audit's games,
 * no skills are dealt: every card is drafted by the AI.
 *
 * "Used" is the audit's "fired": each use of an activated skill or choice, each Tactic played, each
 * trigger of a triggered skill, each battle in which a combat skill changed a roll or total, and
 * each move, deploy or conquer a movement, deployment or conquer skill could have changed.
 * Win rates over a handful of games are noise: check "Taken" before reading anything into them.
 *
 * The games are played on the fast cores (pool.ts); the results are the same with any number of jobs.
 *
 *   npm run selfplay:cards -- [games=50] [mode=community|original] [level=1] [jobs=fast cores]
 *
 * Any argument may be given by name instead, in any order: `--level=3` (args.ts).
 */
import { fileURLToPath } from 'node:url';
import type { AiLevel } from '../packages/ai/src';
import type { CardDef, GameMode, GameState, PlayerId } from '../packages/engine/src';
import { auditGame, cardTaken, modeCards, type Anomaly } from '../packages/engine/test/audit';
import { args } from './args';
import { defaultJobs, isWorker, pool } from './pool';

const { games: argGames, mode: argMode, level: argLevel, jobs } = args({ games: '50', mode: 'regolith', level: '1', jobs: defaultJobs });
const numGames = Number(argGames);
const mode = argMode as GameMode;
const level = Number(argLevel) as AiLevel;

interface CardStats {
  card: CardDef;
  taken: number;
  played: number;
  turnsActive: number;
  gamesPresent: number;
  wins: number;
  losses: number;
  /** The drafting player's position at each pick. */
  picks: { turn: number; cubesLeft: number; dominance: number; research: number; standing: 'leading' | 'tied' | 'behind' }[];
}

const stats = new Map<string, CardStats>(
  modeCards(mode).map((card) => [card.id, { card, taken: 0, played: 0, turnsActive: 0, gamesPresent: 0, wins: 0, losses: 0, picks: [] }]),
);

/** Where `p` stands against the other player: fewer cubes left is ahead. */
function standing(s: GameState, p: PlayerId): CardStats['picks'][number]['standing'] {
  const mine = s.players[p].cubesLeft;
  const foe = s.players.find((o) => o.id !== p)!.cubesLeft;
  return mine < foe ? 'leading' : mine > foe ? 'behind' : 'tied';
}

/** What one game did to the card stats, as plain data (it comes back from a worker). */
interface GameRecord {
  anomalies: Anomaly[];
  /** Each card taken, and the drafting player's position at the pick. */
  picks: [string, CardStats['picks'][number]][];
  /** Each use of a card. */
  fired: string[];
  /** Turns each card was held. */
  heldTurns: [string, number][];
  /** Cards in play this game, and the cards each player held or took (credited with the result). */
  inGame: string[];
  credited: string[][];
  /** Turns played, and the winner (null if none), when the game finished. */
  finished?: { turns: number; winner: PlayerId | null };
}

function playGame(g: number): GameRecord {
  const inGame = new Set<string>();
  const credited = [new Set<string>(), new Set<string>()];
  const rec: GameRecord = { anomalies: [], picks: [], fired: [], heldTurns: [], inGame: [], credited: [] };
  let last: GameState | undefined;

  const result = auditGame(
    { mode, players: 2, levels: [level, level], seed: 6000 + g },
    {
      onStep: ({ before, action, after, fired }) => {
        last = after;
        const taken = cardTaken(before, action, after);
        if (taken && stats.has(taken.id)) {
          inGame.add(taken.id);
          credited[taken.p].add(taken.id);
          const pl = before.players[taken.p];
          rec.picks.push([
            taken.id,
            {
              turn: Math.max(1, before.turn.number),
              cubesLeft: pl.cubesLeft,
              dominance: pl.dominance,
              research: pl.research,
              standing: standing(before, taken.p),
            },
          ]);
        }
        for (const id of fired) {
          rec.fired.push(id);
          inGame.add(id);
        }
        for (const p of after.players) for (const sk of p.skills) credited[p.id].add(sk.id);
      },
    },
  );

  rec.anomalies = result.anomalies;
  for (const [id, c] of result.coverage) {
    rec.heldTurns.push([id, c.heldTurns]);
    if (c.heldTurns) inGame.add(id);
  }
  rec.inGame = [...inGame];
  rec.credited = credited.map((ids) => [...ids]);
  if (result.finished && last) rec.finished = { turns: last.turn.number, winner: last.winner };
  return rec;
}

if (!isWorker) console.log(`Starting self-play: ${numGames} ${mode} games with Level ${level} AI...`);

let completedGames = 0;
let totalTurns = 0;
let played = 0;

const games = Array.from({ length: numGames }, (_, g) => g);
await pool(fileURLToPath(import.meta.url), games, Number(jobs), playGame, (rec, g) => {
  if (rec.anomalies.length) {
    for (const a of rec.anomalies)
      console.log(`\nGame ${g}, step ${a.step}${a.card ? ` [${a.card}]` : ''}: ${a.message}\n  ${a.context.join('\n  ')}`);
    process.exit(1);
  }
  for (const [id, pick] of rec.picks) {
    const st = stats.get(id)!;
    st.taken++;
    st.picks.push(pick);
  }
  for (const id of rec.fired) stats.get(id)!.played++;
  for (const [id, turns] of rec.heldTurns) stats.get(id)!.turnsActive += turns;
  if (rec.finished) {
    completedGames++;
    totalTurns += rec.finished.turns;
    if (rec.finished.winner !== null) {
      rec.credited.forEach((ids, p) => {
        for (const id of ids) {
          const st = stats.get(id);
          if (!st) continue;
          if (p === rec.finished!.winner) st.wins++;
          else st.losses++;
        }
      });
    }
    for (const id of rec.inGame) stats.get(id)!.gamesPresent++;
  }
  process.stdout.write(`\rPlayed game ${++played}/${numGames}...`);
});

console.log(
  `\n\nCompleted ${completedGames}/${numGames} games, avg ${(totalTurns / Math.max(1, completedGames)).toFixed(1)} turns/game.\n`,
);

const average = (xs: number[]) => xs.reduce((sum, v) => sum + v, 0) / Math.max(1, xs.length);
const percent = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Report 1: Performance & Win Rate

console.log('=== CARD PERFORMANCE & WIN RATE REPORT ===');
console.log(
  'Name'.padEnd(20) +
    'Type'.padEnd(10) +
    'Taken'.padStart(7) +
    'Used'.padStart(8) +
    'Wins'.padStart(6) +
    'Losses'.padStart(8) +
    'Win Rate'.padStart(10) +
    'Pick Rate'.padStart(11) +
    'Active Turns'.padStart(14),
);
console.log('-'.repeat(94));

// By win rate among cards drafted at least once, then by wins; undecided cards last, by times taken.
const winRate = (st: CardStats) => (st.wins + st.losses ? st.wins / (st.wins + st.losses) : -1);
const byWinRate = [...stats.values()].sort((a, b) => {
  if (winRate(a) < 0 && winRate(b) < 0) return b.taken - a.taken;
  if (Math.abs(winRate(b) - winRate(a)) > 0.001) return winRate(b) - winRate(a);
  return b.wins - a.wins;
});

let usedCount = 0;
for (const st of byWinRate) {
  if (st.taken || st.turnsActive || st.played) usedCount++;
  const decided = st.wins + st.losses;
  console.log(
    st.card.name.padEnd(20) +
      (st.card.category ?? 'card').padEnd(10) +
      String(st.taken).padStart(7) +
      String(st.played).padStart(8) +
      String(st.wins).padStart(6) +
      String(st.losses).padStart(8) +
      (decided ? percent(st.wins, decided) : '-').padStart(10) +
      percent(st.gamesPresent, completedGames).padStart(11) +
      String(st.turnsActive).padStart(14),
  );
}
console.log('-'.repeat(94));
console.log(`Cards drafted/used: ${usedCount}/${stats.size} (${percent(usedCount, stats.size)})\n`);

// ---------------------------------------------------------------------------
// Report 2: When Cards Are Chosen (Timing & Draft Context)

console.log('=== WHEN CARDS ARE CHOSEN (TIMING & BOARD STATE CONTEXT) ===');
console.log(
  'Name'.padEnd(20) +
    'Type'.padEnd(10) +
    'Taken'.padStart(6) +
    'Avg Turn'.padStart(10) +
    'Phase'.padStart(11) +
    'Avg Cubes'.padStart(11) +
    'Avg Dom'.padStart(9) +
    'Avg Res'.padStart(9) +
    'Leading %'.padStart(11) +
    'Behind %'.padStart(10),
);
console.log('-'.repeat(107));

const avgTurn = (st: CardStats) => average(st.picks.map((x) => x.turn));
for (const st of [...stats.values()].filter((x) => x.taken).sort((a, b) => avgTurn(a) - avgTurn(b))) {
  const turn = avgTurn(st);
  const phase = turn >= 9 ? 'Endgame' : turn >= 4 ? 'Mid-game' : 'Opening';
  const share = (standing: string) => `${((st.picks.filter((x) => x.standing === standing).length / st.picks.length) * 100).toFixed(0)}%`;
  console.log(
    st.card.name.padEnd(20) +
      (st.card.category ?? 'card').padEnd(10) +
      String(st.taken).padStart(6) +
      `Turn ${turn.toFixed(1)}`.padStart(10) +
      phase.padStart(11) +
      `${average(st.picks.map((x) => x.cubesLeft)).toFixed(1)} left`.padStart(11) +
      average(st.picks.map((x) => x.dominance))
        .toFixed(1)
        .padStart(9) +
      average(st.picks.map((x) => x.research))
        .toFixed(1)
        .padStart(9) +
      share('leading').padStart(11) +
      share('behind').padStart(10),
  );
}
console.log('-'.repeat(107));
