/**
 * Ability-usage measurement: plays AI games in each mode and counts how often each mech's ability is
 * used against how often it was on offer. Shared by abilityUsage.test.ts and scripts/ability-usage.ts,
 * so a new dice action (a RuleSet.mechs entry) shows up here without any extra wiring.
 */
import { apply, createGame, legalActions, rulesOf, type Action, type GameMode, type GameState } from '../src';
import { aiAction, players, seededRandom } from './helpers';

/** The actions that spend a mech's once-per-turn ability (carry and strike have tactical twins we don't count). */
const ABILITY_ACTIONS = new Set<Action['type']>(['freeAttack', 'carry', 'swap', 'change', 'ability']);

interface AbilityRow {
  /** Die value of the mech (1 to 6). */
  value: number;
  mech: string;
  ability: string;
  /** Times the ability was used. */
  used: number;
  /** Player-turns in which a mech of this value had a legal ability action at some point. */
  offeredTurns: number;
  /** Player-turns in which it was used at least once. */
  usedTurns: number;
  /** False for abilities with no action of their own (the Interceptor's diagonals are automatic). */
  hasAction: boolean;
}

export interface ModeUsage {
  mode: GameMode;
  games: number;
  finished: number;
  playerTurns: number;
  rows: AbilityRow[];
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

export function measureAbilityUsage(mode: GameMode, opts: UsageOptions): ModeUsage {
  const n = opts.players ?? 2;
  const levels = Array.from({ length: n }, () => opts.level ?? 1) as never;
  const mechs = rulesOf(createGame({ players: players(n), seed: 1, mode })).mechs;
  const rows: AbilityRow[] = Object.entries(mechs).map(([v, def]) => ({
    value: Number(v),
    mech: def.name,
    ability: def.ability.name,
    used: 0,
    offeredTurns: 0,
    usedTurns: 0,
    hasAction: !!def.hooks?.action || !!def.builtIn,
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
          if (ABILITY_ACTIONS.has(a.type) && 'die' in a) offered.add(`${turnKey}:${s.dice.find((d) => d.id === a.die)!.value}`);
        }
      }
      const action = aiAction(s, levels, random, 1);
      if (!action) throw new Error(`${mode} game ${g}: no action at step ${step}`);
      if (ABILITY_ACTIONS.has(action.type) && 'die' in action) {
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

/** A text table of a mode's usage: uses per game, and the share of offered turns the ability was used. */
export function formatUsage(u: ModeUsage): string {
  const lines = [`${u.mode}: ${u.finished}/${u.games} games finished, ${u.playerTurns} player-turns`];
  lines.push(
    `  ${'mech'.padEnd(16)}${'ability'.padEnd(22)}${'used'.padStart(6)}${'/game'.padStart(8)}${'offered'.padStart(9)}${'use rate'.padStart(10)}`,
  );
  for (const r of u.rows) {
    const rate = r.hasAction ? (r.offeredTurns ? `${Math.round((100 * r.usedTurns) / r.offeredTurns)}%` : '–') : 'auto';
    lines.push(
      `  ${`${r.value} ${r.mech}`.padEnd(16)}${r.ability.slice(0, 20).padEnd(22)}${String(r.used).padStart(6)}${(r.used / Math.max(1, u.games)).toFixed(1).padStart(8)}${String(r.offeredTurns).padStart(9)}${rate.padStart(10)}`,
    );
  }
  return lines.join('\n');
}
