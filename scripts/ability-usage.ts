/**
 * Mech-ability usage per mode over AI self-play.
 *   npm run ability:usage -- [games=20] [modes=basic,regolith] [players=2] [level=4]
 */
import type { GameMode } from '../packages/engine/src';
import { formatUsage, measureAbilityUsage, type UsageOptions } from '../packages/engine/test/abilityUsage';

const [games = '20', modes = 'basic,regolith', players = '2', level = '4'] = process.argv.slice(2);
for (const mode of modes.split(',')) {
  console.log(
    formatUsage(
      measureAbilityUsage(mode as GameMode, {
        games: Number(games),
        players: Number(players),
        level: Number(level) as UsageOptions['level'],
      }),
    ) + '\n',
  );
}
