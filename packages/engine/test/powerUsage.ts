/**
 * Power-usage measurement: plays AI games in each mode and counts how often each ship's power is
 * used against how often it was on offer. Shared by powerUsage.test.ts and scripts/power-usage.ts,
 * so a new dice action (a RuleSet.ships entry) shows up here without any extra wiring.
 */
import { apply, createGame, legalActions, rulesOf, type Action, type GameMode, type GameState } from '../src';
import { aiAction, players, seededRandom } from './helpers';

/** The actions that spend a ship's once-per-turn power (carry and strike have tactical twins we don't count). */
const POWER_ACTIONS = new Set<Action['type']>(['freeAttack', 'carry', 'swap', 'change', 'power']);

interface PowerRow {
  /** Die value of the ship (1 to 6). */
  value: number;
  ship: string;
  power: string;
  /** Times the power was used. */
  used: number;
  /** Player-turns in which a ship of this value had a legal power action at some point. */
  offeredTurns: number;
  /** Player-turns in which it was used at least once. */
  usedTurns: number;
  /** False for powers with no action of their own (the Interceptor's diagonals are automatic). */
  hasAction: boolean;
}

export interface ModeUsage {
  mode: GameMode;
  games: number;
  finished: number;
  playerTurns: number;
  rows: PowerRow[];
}

export interface UsageOptions {
  games: number;
  players?: number;
  /** AI level of every player (default 1). */
  level?: 1 | 2 | 3 | 4 | 5;
  /** Seed of the first game; later games count up from it. */
  seed?: number;
  /** Safety cap on actions per game. */
  maxSteps?: number;
}

export function measurePowerUsage(mode: GameMode, opts: UsageOptions): ModeUsage {
  const n = opts.players ?? 2;
  const levels = Array.from({ length: n }, () => opts.level ?? 1) as never;
  const ships = rulesOf(createGame({ players: players(n), seed: 1, mode })).ships;
  const rows: PowerRow[] = Object.entries(ships).map(([v, def]) => ({
    value: Number(v),
    ship: def.name,
    power: def.ability.name,
    used: 0,
    offeredTurns: 0,
    usedTurns: 0,
    hasAction: !!def.hooks?.action || !!def.power,
  }));
  const row = (value: number) => rows.find((r) => r.value === value)!;
  const out: ModeUsage = { mode, games: opts.games, finished: 0, playerTurns: 0, rows };

  for (let g = 0; g < opts.games; g++) {
    let s: GameState = createGame({ players: players(n), seed: (opts.seed ?? 100) + g, mode });
    const random = seededRandom(g * 7919 + 13);
    const offered = new Set<string>();
    const used = new Set<string>();
    const turns = new Set<string>();
    for (let step = 0; s.phase !== 'over' && step < (opts.maxSteps ?? 3000); step++) {
      if (s.phase === 'play' && s.pending.length === 0) {
        const turnKey = `${s.turn.number}`;
        turns.add(turnKey);
        for (const a of legalActions(s, { includeCarry: true })) {
          if (POWER_ACTIONS.has(a.type) && 'die' in a) offered.add(`${turnKey}:${s.dice.find((d) => d.id === a.die)!.value}`);
        }
      }
      const action = aiAction(s, levels, random, 1);
      if (!action) throw new Error(`${mode} game ${g}: no action at step ${step}`);
      if (POWER_ACTIONS.has(action.type) && 'die' in action) {
        const value = s.dice.find((d) => d.id === action.die)!.value;
        row(value).used++;
        used.add(`${s.turn.number}:${value}`);
      }
      s = apply(s, action);
    }
    if (s.phase === 'over') out.finished++;
    out.playerTurns += turns.size;
    for (const key of offered) row(Number(key.split(':')[1])).offeredTurns++;
    for (const key of used) row(Number(key.split(':')[1])).usedTurns++;
  }
  return out;
}

/** A text table of a mode's usage: uses per game, and the share of offered turns the power was used. */
export function formatUsage(u: ModeUsage): string {
  const lines = [`${u.mode}: ${u.finished}/${u.games} games finished, ${u.playerTurns} player-turns`];
  lines.push(
    `  ${'ship'.padEnd(16)}${'power'.padEnd(22)}${'used'.padStart(6)}${'/game'.padStart(8)}${'offered'.padStart(9)}${'use rate'.padStart(10)}`,
  );
  for (const r of u.rows) {
    const rate = r.hasAction ? (r.offeredTurns ? `${Math.round((100 * r.usedTurns) / r.offeredTurns)}%` : '–') : 'auto';
    lines.push(
      `  ${`${r.value} ${r.ship}`.padEnd(16)}${r.power.slice(0, 20).padEnd(22)}${String(r.used).padStart(6)}${(r.used / Math.max(1, u.games)).toFixed(1).padStart(8)}${String(r.offeredTurns).padStart(9)}${rate.padStart(10)}`,
    );
  }
  return lines.join('\n');
}
