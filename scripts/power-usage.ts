/**
 * Ship-power usage per mode over AI self-play.
 *   npm run power:usage -- [games=20] [modes=basic,regolith] [players=2] [level=4]
 */
import type { GameMode } from '../packages/engine/src';
import { formatUsage, measurePowerUsage, type UsageOptions } from '../packages/engine/test/powerUsage';

const [games = '20', modes = 'basic,regolith', players = '2', level = '4'] = process.argv.slice(2);
for (const mode of modes.split(',')) {
  console.log(
    formatUsage(
      measurePowerUsage(mode as GameMode, {
        games: Number(games),
        players: Number(players),
        level: Number(level) as UsageOptions['level'],
      }),
    ) + '\n',
  );
}
