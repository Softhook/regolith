import { type GameState, type LogEntry } from '@regolith/engine';
import { objectiveNames } from '../art/boardTiles';

/** A log entry's text, with each `objective N` it names shown by that objective's name: "Thalassa Prime (9)". */
export function logText(game: GameState, e: LogEntry): string {
  const ids = e.objectives;
  if (!ids?.length) return e.text;
  const names = objectiveNames(game.board);
  let i = 0;
  return e.text.replace(/objective (\d+)/g, (m, n) => {
    const name = names.get(ids[i++]);
    return name ? `${name} (${n})` : m;
  });
}
