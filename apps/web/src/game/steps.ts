import { effectOf, type GameState } from '@regolith/engine';

/** The id of the game's last log entry, 0 before there is one. */
export const lastLogId = (game: GameState) => game.log.at(-1)?.id ?? 0;

/** Whether the step from `before` to `game` was play: undo moves ships and takes cubes away too, but never adds log entries. */
export const isPlayStep = (before: GameState, game: GameState) => lastLogId(game) > lastLogId(before);

/** The log entries the step from `before` to `game` added. */
export function logSince(before: GameState, game: GameState) {
  const last = lastLogId(before);
  return game.log.filter((e) => e.id > last);
}

/** The effects of the cards the step from `before` to `game` played or used (the engine names each on the entry its owner logged). */
export const cardsUsed = (before: GameState, game: GameState) =>
  new Set(logSince(before, game).flatMap((e) => (e.card ? [effectOf(e.card)] : [])));
