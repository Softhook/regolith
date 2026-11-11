/**
 * How much each mech ability is used in each mode (AI self-play). Prints a table per mode; the
 * assertions only guard the measurement itself, so an ability can be judged by eye:
 * an ability that is offered often but never used is dead weight, one used every time may be too strong.
 * By default one quick game per mode, so the suite stays fast; the numbers worth reading need more games
 * and level 4, the lowest that uses Behemoth carries:
 * ABILITY_USAGE_GAMES=4 ABILITY_USAGE_LEVEL=4 npx vitest run abilityUsage  (or `npm run ability:usage`).
 */
import { describe, expect, it } from 'vitest';
import { MODES } from '../src';
import { formatUsage, measureAbilityUsage } from './abilityUsage';

const GAMES = Number(process.env.ABILITY_USAGE_GAMES ?? 1);
const LEVEL = Number(process.env.ABILITY_USAGE_LEVEL ?? 2) as 1 | 2 | 3 | 4 | 5;

describe('ability usage by mode', () => {
  for (const { id: mode } of MODES) {
    it(`${mode}`, () => {
      const u = measureAbilityUsage(mode, { games: GAMES, level: LEVEL });
      console.log(`\n${formatUsage(u)}`);
      expect(u.finished).toBe(GAMES);
      for (const r of u.rows) {
        expect(r.usedTurns).toBeLessThanOrEqual(r.offeredTurns);
        expect(r.used).toBeGreaterThanOrEqual(r.usedTurns);
        if (!r.hasAction) expect(r.used).toBe(0);
      }
      // Some ability gets used in every mode.
      expect(u.rows.reduce((a, r) => a + r.used, 0)).toBeGreaterThan(0);
    }, 120_000);
  }

  // The quick games above are below level 4, so no transport is played in them: one game that plays some (about 2s).
  it('counts Behemoth transports', () => {
    const behemoth = measureAbilityUsage('basic', { games: 1, level: 4 }).rows.find((r) => r.mech === 'Behemoth')!;
    expect(behemoth.used).toBeGreaterThan(0);
    expect(behemoth.usedTurns).toBeLessThanOrEqual(behemoth.offeredTurns);
  }, 120_000);
});
