/** Asks the AI worker for a move; falls back to thinking on the main thread if workers fail. */
import { AI_LEVELS, chooseAction, chooseCombatResponse, DEFAULT_AI_LEVEL, type AiLevel } from '@regolith/ai';
import { legalActions, type Action, type GameState, type PlayerConfig, type PlayerId } from '@regolith/engine';
import type { AiRequest, AiResponse } from './aiWorker';

let worker: Worker | null | undefined;
const waiting = new Map<number, (r: AiResponse) => void>();
let nextId = 0;

export function aiLevelOf(p: PlayerConfig): AiLevel {
  return aiLevelInfo(p).level;
}

/** An AI player's level, named and summed up (AI_LEVELS). */
export function aiLevelInfo(p: PlayerConfig) {
  const level = p.aiLevel ?? DEFAULT_AI_LEVEL;
  return AI_LEVELS.find((candidate) => candidate.level === level) ?? AI_LEVELS.find((l) => l.level === DEFAULT_AI_LEVEL)!;
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AiResponse>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    worker.onerror = (e) => {
      console.error('[game] AI worker failed; thinking on the main thread from now on', e);
      worker = null;
      for (const [id, resolve] of waiting) resolve({ id, action: null, error: 'worker failed' });
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Rejects, rather than throwing, if the AI fails. */
const onMainThread = (state: GameState, level: AiLevel) =>
  new Promise<Action | null>((resolve) => resolve(chooseAction(state, { level, samples: 3 })));

function ask(state: GameState, level: AiLevel): Promise<Action | null> {
  const w = getWorker();
  if (!w) return onMainThread(state, level);
  const id = ++nextId;
  return new Promise((resolve) => {
    waiting.set(id, (r) => {
      // An error in the worker is retried here, where it surfaces with a full stack trace.
      if (r.error) resolve(onMainThread(state, level));
      else resolve(r.action);
    });
    w.postMessage({ id, state, level } satisfies AiRequest);
  });
}

/**
 * An AI's move. `error` is set when the AI failed (an engine bug, logged to the console with the
 * position): `action` is then a stand-in, so the game goes on.
 */
export interface AiMove {
  action: Action | null;
  error?: string;
}

/** The AI's move for whoever must act; if the AI fails, the first legal move stands in. Never rejects. */
export async function think(state: GameState, level: AiLevel): Promise<AiMove> {
  try {
    return { action: await ask(state, level) };
  } catch (e) {
    return failed(state, e, () => legalActions(state)[0] ?? null);
  }
}

/** Whether `player` fires a missile or re-rolls in the current battle; if the AI fails, it passes. */
export function combatResponse(state: GameState, player: PlayerId, level: AiLevel): AiMove {
  try {
    return { action: chooseCombatResponse(state, player, { level }) };
  } catch (e) {
    return failed(state, e, () => null);
  }
}

function failed(state: GameState, error: unknown, standIn: () => Action | null): AiMove {
  console.error('[game] the AI failed', { error, state: JSON.stringify(state) });
  let action: Action | null = null;
  try {
    action = standIn();
  } catch {
    // the engine fails here too: nothing to stand in
  }
  const message = error instanceof Error ? error.message : String(error);
  return { action, error: `Engine error in the AI: ${message} (details in the console)` };
}
