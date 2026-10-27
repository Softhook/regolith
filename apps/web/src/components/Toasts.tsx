import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState, LogEntry, PlayerId } from '@regolith/engine';
import type { Toast } from '../game/toasts';
import { CardArt } from './CardViewer';
import { useCardCasts } from './CardCast';
import { repeatsLastTurn } from '../game/cast';

/** The game's news. `now`: the screen shows an earlier position (looking back), so it says the news is of the game now. */
export function Toasts({ toasts, game, now }: { toasts: Toast[]; game: GameState; now?: boolean }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.tone}`}
          style={{ '--pc': t.player !== undefined ? game.players[t.player]?.color : 'var(--accent)' } as CSSProperties}
        >
          {now && <small className="toast-now">Now</small>}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ErrorToast({ error }: { error: { id: number; text: string } | null }) {
  const [visible, setVisible] = useState<typeof error>(null);
  useEffect(() => {
    if (!error) return;
    setVisible(error);
    const t = window.setTimeout(() => setVisible(null), 2600);
    return () => window.clearTimeout(t);
  }, [error]);
  if (!visible) return null;
  return (
    <div className="error-toast" key={visible.id}>
      {visible.text}
    </div>
  );
}

/** How long a played card stays over the map; a card taken from the market, a little longer. */
const PLAYED_MS = 3200;
const TAKEN_MS = 4800;
const shownFor = (e: LogEntry) => (e.event === 'cardTaken' ? TAKEN_MS : PLAYED_MS);

/**
 * The card another player has just played, taken or used (a skill), shown large over the map for a
 * moment, one at a time.
 * `mine`: whether this screen plays for a player (their own plays aren't shown). Needs no tap to go.
 * `review`: the entries of the move being looked back at; the card among them, anyone's, is shown
 * instead, and the game's own wait until the review ends.
 * `hold`: something is in front of the map (a battle); the game's cards wait for it to go rather than cover it.
 * The card casts what it does: a flash, and beams to what it changes (useCardCasts).
 */
export function PlayedCard({
  game,
  mine,
  jumps,
  review,
  hold,
}: {
  game: GameState;
  mine: (p: PlayerId) => boolean;
  jumps?: number;
  review?: readonly LogEntry[];
  hold?: boolean;
}) {
  // The last log entry already seen: only plays made while the screen is open are shown.
  const seen = useRef(game.log.at(-1)?.id ?? 0);
  const jumped = useRef(jumps);
  const [queue, setQueue] = useState<LogEntry[]>([]);
  useEffect(() => {
    const last = game.log.at(-1)?.id ?? 0;
    // An undo takes entries back; a playback jump skips over them.
    if (last <= seen.current || jumped.current !== jumps) {
      seen.current = last;
      jumped.current = jumps;
      return;
    }
    const fresh = game.log.filter((e) => e.id > seen.current);
    seen.current = last;
    // A start-of-turn bonus is news only the first turn it comes (Arrogant, every turn its player leads).
    const played = fresh.filter((e) => e.card && e.player !== undefined && !mine(e.player) && !repeatsLastTurn(game.log, e));
    if (played.length) setQueue((q) => [...q, ...played]);
  }, [game, mine, jumps]);

  const reviewed = review?.find((e) => e.card && e.player !== undefined);
  const shown = review ? reviewed : hold ? undefined : queue[0];
  const art = useRef<HTMLDivElement>(null);
  const { beams, flash, spent } = useCardCasts(game, mine, review ? undefined : shown, art, jumps);
  useEffect(() => {
    if (!shown || review) return;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), shownFor(shown));
    return () => window.clearTimeout(t);
  }, [shown, review]);
  if (!shown) return beams || null;
  const player = game.players[shown.player!];
  const style = { '--pc': player.color, '--pc-ms': `${shownFor(shown)}ms` } as CSSProperties;
  return (
    <>
      <div className="played-card" key={`${review ? 'r' : 'l'}${shown.id}`} style={style} aria-hidden>
        <small>
          {player.name} {shown.event === 'cardPlayed' ? 'plays' : shown.event === 'cardTaken' ? 'takes' : 'uses'}
        </small>
        <div className={`played-card-art ${spent ? 'spent' : ''}`} ref={art}>
          <CardArt id={shown.card!} size="md" />
          {flash > 0 && <i key={flash} className="played-card-cast" />}
        </div>
      </div>
      {beams}
    </>
  );
}
