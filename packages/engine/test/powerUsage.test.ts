/**
 * How much each ship power is used in each mode (AI self-play). Prints a table per mode; the
 * assertions only guard the measurement itself, so a power can be judged by eye:
 * a power that is offered often but never used is dead weight, one used every time may be too strong.
 * By default one quick game per mode, so the suite stays fast; the numbers worth reading need more games
 * and level 4, the lowest that uses Flagship transports:
 * POWER_USAGE_GAMES=4 POWER_USAGE_LEVEL=4 npx vitest run powerUsage  (or `npm run power:usage`).
 */
import { describe, expect, it } from 'vitest';
import { MODES } from '../src';
import { formatUsage, measurePowerUsage } from './powerUsage';

const GAMES = Number(process.env.POWER_USAGE_GAMES ?? 1);
const LEVEL = Number(process.env.POWER_USAGE_LEVEL ?? 2) as 1 | 2 | 3 | 4 | 5;

describe('power usage by mode', () => {
  for (const { id: mode } of MODES) {
    it(`${mode}`, () => {
      const u = measurePowerUsage(mode, { games: GAMES, level: LEVEL });
      console.log(`\n${formatUsage(u)}`);
      expect(u.finished).toBe(GAMES);
      for (const r of u.rows) {
        expect(r.usedTurns).toBeLessThanOrEqual(r.offeredTurns);
        expect(r.used).toBeGreaterThanOrEqual(r.usedTurns);
        if (!r.hasAction) expect(r.used).toBe(0);
      }
      // Some power gets used in every mode.
      expect(u.rows.reduce((a, r) => a + r.used, 0)).toBeGreaterThan(0);
    }, 120_000);
  }

  // The quick games above are below level 4, so no transport is played in them: one game that plays some (about 2s).
  it('counts Behemoth transports', () => {
    const flagship = measurePowerUsage('basic', { games: 1, level: 4 }).rows.find((r) => r.ship === 'Behemoth')!;
    expect(flagship.used).toBeGreaterThan(0);
    expect(flagship.usedTurns).toBeLessThanOrEqual(flagship.offeredTurns);
  }, 120_000);
});
