/** Runs the AI off the main thread, so the board keeps animating while it thinks. */
import { chooseAction, type AiLevel } from '@regolith/ai';
import type { Action, GameState } from '@regolith/engine';

export interface AiRequest {
  id: number;
  state: GameState;
  level: AiLevel;
}

export interface AiResponse {
  id: number;
  action: Action | null;
  error?: string;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, level } = e.data;
  let reply: AiResponse;
  try {
    reply = { id, action: chooseAction(state, { level, samples: 3 }) };
  } catch (err) {
    reply = { id, action: null, error: (err as Error).message };
  }
  self.postMessage(reply);
};
