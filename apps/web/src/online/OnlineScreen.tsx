import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { say } from '@regolith/engine';
import { unclaimedSeats, type AskMode, type Replay } from '@regolith/online';
import { Dialog, Modal } from '../components/Dialog';
import { Game } from '../components/GameScreen';
import { resumeFullscreen } from '../fullscreen';
import { COARSE } from '../game/useMediaQuery';
import { inviteLink } from './create';
import { useOnlineGame, type OnlineGame } from './useOnlineGame';
import type { RelayStatus } from './relays';
import { remember, stored } from '../storage';
import { appKey, GAME_NAME } from '../appId';

const NAME = appKey('online.name');
/** How long to look for a game on the relays before saying it can't be found. */
const NOT_FOUND_MS = 15000;

export function OnlineScreen({ secret, onLeave, onRules }: { secret: string; onLeave: () => void; onRules: () => void }) {
  const g = useOnlineGame(secret);
  const [watching, setWatching] = useState(false);

  if (!g.view || !g.replay) return <Searching relays={g.relays} failure={g.failure} onLeave={onLeave} />;
  const openSeats = unclaimedSeats(g.replay);
  const joining = !g.mySeats.length && openSeats.length > 0 && !watching;

  return (
    <Game
      view={g.view}
      online
      onQuit={onLeave}
      onLobby={onLeave}
      onRules={onRules}
      side={
        <OnlinePanel
          g={g}
          secret={secret}
          onJoin={watching && openSeats.length && !g.mySeats.length ? () => setWatching(false) : undefined}
        />
      }
      overlay={joining && <JoinDialog replay={g.replay} onJoin={g.claim} onWatch={() => setWatching(true)} />}
    />
  );
}

function Searching({ relays, failure, onLeave }: { relays: RelayStatus; failure: string | null; onLeave: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLate(true), NOT_FOUND_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="lobby">
      <div className="lobby-card online-searching">
        <h2>
          {!failure && !late && <span className="spinner" />}{' '}
          {failure ? 'Can’t open this game' : !late ? 'Joining game…' : relays.connected ? 'Game not found' : 'No connection'}
        </h2>
        <p className="muted">
          {failure
            ? `This browser couldn’t open the game: ${failure}`
            : late && !relays.connected
              ? 'None of the relays that carry the game can be reached. Check your internet connection; this page keeps trying.'
              : late
                ? 'No relay has this game. Check that the link is complete, or ask whoever created the game to open it once so their browser can send it again.'
                : relays.connected
                  ? `Connected to ${relays.connected} of ${relays.total} relays, looking for the game…`
                  : 'Connecting to the relays…'}
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onLeave}>
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinDialog({ replay, onJoin, onWatch }: { replay: Replay; onJoin: (seat: number, name: string) => void; onWatch: () => void }) {
  const [name, setName] = useState(() => stored(NAME) ?? '');
  const open = unclaimedSeats(replay);
  const seated = replay.seats.filter((x) => x.owner || x.ai);
  const [seat, setSeat] = useState(open[0].id);
  const chosen = open.some((s) => s.id === seat) ? seat : open[0].id;
  const s = replay.steps[0].state;
  const join = () => {
    const n = name.trim();
    if (!n) return;
    remember(NAME, n);
    onJoin(chosen, n);
  };
  return (
    <Modal
      title="Join the game"
      subtitle={`${seated.map((x) => `${x.name}${x.ai ? ' (AI)' : ''}`).join(', ')} ${seated.length > 1 ? 'are' : 'is'} waiting for you.`}
      pc={s.players[chosen].color}
      className="join-dialog"
    >
      <label className="field">
        <span>Your name</span>
        <input
          autoFocus
          value={name}
          maxLength={14}
          placeholder="Commander"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && join()}
        />
      </label>
      {open.length > 1 && (
        <label className="field">
          <span>Colour</span>
          <div className="segmented">
            {open.map((o) => (
              <button
                key={o.id}
                className={o.id === chosen ? 'on' : ''}
                onClick={() => setSeat(o.id)}
                style={{ '--pc': s.players[o.id].color } as CSSProperties}
              >
                <span className="player-swatch" /> Player {o.id + 1}
              </button>
            ))}
          </div>
        </label>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onWatch}>
          Just watch
        </button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={join}>
          Join
        </button>
      </div>
    </Modal>
  );
}

/** When to wait for this player in a battle (to fire a missile or re-roll). */
const ASK_LABELS: Record<AskMode, string> = {
  own: 'Ask: my battles',
  never: 'Ask: never',
};

/** Online extras at the top of the sidebar: connection, invite link, and which battles to be asked about. */
function OnlinePanel({ g, secret, onJoin }: { g: OnlineGame; secret: string; onJoin?: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  /** The link shown to copy by hand, where it couldn't be shared or copied. */
  const [shown, setShown] = useState<string | null>(null);
  const r = g.replay!;
  const open = unclaimedSeats(r).length;
  const ask = g.mySeats.length ? r.seats[g.mySeats[0]].ask : null;
  const askTipText = "When to wait for you to fire a missile or re-roll in a battle. Battles you're not asked about resolve without you.";
  const askTip = g.view ? say(g.view.game, askTipText) : askTipText;
  const copy = async () => {
    const url = inviteLink(secret);
    try {
      if (navigator.share && matchMedia(COARSE).matches) await navigator.share({ title: `Join my game of ${GAME_NAME}`, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Closing the share sheet without sharing isn't a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setShown(url);
    }
    void resumeFullscreen();
  };
  const ok = g.relays.connected > 0;
  const unsent = g.relays.unsent;
  const status = open
    ? `${open} seat${open > 1 ? 's' : ''} open`
    : !ok
      ? unsent
        ? `Offline — ${unsent} move${unsent > 1 ? 's' : ''} waiting to be sent`
        : 'Offline — moves are kept and sent later'
      : unsent
        ? 'Sending…'
        : !g.live
          ? 'Catching up…'
          : 'Online';
  return (
    <section className="panel online-panel">
      <span
        className={`relay-dot ${ok ? 'ok' : ''}`}
        title={`Connected to ${g.relays.connected} of ${g.relays.total} relays. Your moves are saved in this browser and sent when a relay is reachable.`}
      />
      <span className="online-status">
        {ok && (unsent || !g.live) && !open ? <span className="spinner" /> : null} {status}
      </span>
      <button
        className={`btn ${open ? 'btn-primary' : ''}`}
        onClick={copy}
        title="Copy the link to this game. Anyone with it can join an open seat or watch."
      >
        {copied ? 'Copied' : open ? 'Invite' : 'Link'}
      </button>
      {onJoin && (
        <button className="btn btn-primary" onClick={onJoin}>
          Join
        </button>
      )}
      {shown && (
        <Dialog title="Invite friends" subtitle="Send this link to your friends:" onClose={() => setShown(null)}>
          <input
            className="invite-link"
            readOnly
            value={shown}
            autoFocus
            onFocus={(e) => e.target.select()}
            aria-label="Link to this game"
          />
        </Dialog>
      )}
      {r.crash && <Stopped replay={r} />}
      {r.desync && <OutOfSync replay={r} />}
      {ask && (
        <select
          className="ask-select"
          value={ask}
          aria-label="Battles to be asked about"
          title={askTip}
          onChange={(e) => g.setAsk(e.target.value as AskMode)}
        >
          {(Object.keys(ASK_LABELS) as AskMode[]).map((m) => (
            <option key={m} value={m}>
              {ASK_LABELS[m]}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

/**
 * Another browser played a move this one refuses, or got a different position from it. Both run
 * the same posts through the engine, so they almost certainly run different versions of the app.
 */
function OutOfSync({ replay }: { replay: Replay }) {
  const d = replay.desync!;
  const who = replay.seats[d.seat]?.name ?? 'Another player';
  return (
    <ReloadAlert title={`Out of sync with ${who}`}>
      {d.why === 'rejected'
        ? `A move by ${who} doesn’t fit the game as this browser sees it.`
        : `${who}’s browser sees a different game after their move.`}{' '}
      One of you is probably running an older version: both reload the page.
    </ReloadAlert>
  );
}

/** The engine failed on the next move or battle: a bug in this browser's engine, so the game can't go on here. */
function Stopped({ replay }: { replay: Replay }) {
  const { seat } = replay.crash!;
  const who = seat === null ? null : (replay.seats[seat]?.name ?? 'another player');
  return (
    <ReloadAlert title={who ? `The game stopped on a move by ${who}` : 'The game stopped resolving a battle'}>
      This browser’s game engine failed on it: a bug{who ? `, not a mistake by ${who}` : ''}. The details are in the browser console.
    </ReloadAlert>
  );
}

/** A problem this browser can't get past without reloading the page. */
function ReloadAlert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="online-desync" role="alert">
      <strong>{title}</strong>
      <span>{children}</span>
      <button className="btn" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  );
}
