import { say, type GameState, type LogEntry } from '@regolith/engine';
import { planetNames } from '../art/boardTiles';

/**
 * A log entry's text in the game's words, with each `planet N` it names shown by that planet's name:
 * "Thalassa Prime (9)".
 */
export function logText(game: GameState, e: LogEntry): string {
  const ids = e.planets;
  if (!ids?.length) return say(game, e.text);
  const names = planetNames(game.board);
  const shown: string[] = [];
  let i = 0;
  const text = e.text.replace(/planet (\d+)/g, (m, n) => {
    const name = names.get(ids[i++]);
    if (!name) return m;
    shown.push(name);
    return `${name} (${n})`;
  });
  return say(game, text, shown);
}
