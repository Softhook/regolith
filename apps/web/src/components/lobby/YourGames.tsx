import { useEffect, useState } from 'react';
import { rulesOf, type GameState } from '@regolith/engine';
import { Confirm } from '../Dialog';
import { forgetFinishedGames, forgetGame, onlineGames } from '../../online/games';
import { WhereIcon } from './WhereIcon';

/** One game to pick up: opened by its link (online) or a click (this device), and removable. */
function GameRow({
  title,
  meta,
  online,
  yourMove,
  checking,
  href,
  onOpen,
  onRemove,
  removeLabel,
}: {
  title: string;
  meta: string;
  online: boolean;
  yourMove?: boolean;
  /** Still asking the relays whether there have been moves since. */
  checking?: boolean;
  href?: string;
  onOpen?: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const body = (
    <>
      <WhereIcon online={online} />
      <span className="game-row-text">
        <strong>{title}</strong>
        <span className="muted">{meta}</span>
      </span>
    </>
  );
  return (
    <li className={yourMove ? 'my-turn' : ''}>
      {href ? (
        <a className="game-row-open" href={href}>
          {body}
        </a>
      ) : (
        <button className="game-row-open" onClick={onOpen}>
          {body}
        </button>
      )}
      {checking && <span className="spinner" role="status" aria-label="Checking for new moves" title="Checking for new moves" />}
      {yourMove && <span className="tag your-turn">Your move</span>}
      <button className="icon-btn" title={removeLabel} aria-label={removeLabel} onClick={onRemove}>
        ×
      </button>
    </li>
  );
}

/** The games to pick up: the one on this device, then the online ones (those waiting on you first). */
export function YourGames({ saved, onResume, onDiscard }: { saved: GameState | null; onResume: () => void; onDiscard: () => void }) {
  // Finished games are done with: they leave the list once the lobby shows again.
  const [games, setGames] = useState(forgetFinishedGames);
  // The list holds how each game stood when this browser last had it open: follow the unfinished
  // ones on the relays, so a move made since then shows (the online code loads for it, if there are any).
  // Those listed when the lobby opens: games added later are opened from here anyway.
  const [watched] = useState(() => onlineGames().filter((g) => !g.over));
  // The games still being checked on the relays, each until one has answered.
  const [checking, setChecking] = useState(() => new Set(watched.map((g) => g.secret)));
  /** The game being asked about before it's removed: the one on this device, or an online one. */
  const [removing, setRemoving] = useState<{ saved: true } | { secret: string } | null>(null);
  const forget = (secret: string) => {
    setRemoving(null);
    forgetGame(secret);
    setGames(onlineGames());
  };
  useEffect(() => {
    if (!watched.length) return;
    let stop: (() => void) | undefined;
    let gone = false;
    const checked = (secret: string) =>
      setChecking((c) => {
        const next = new Set(c);
        next.delete(secret);
        return next;
      });
    import('../../online/watch')
      .then(({ watchGames }) => {
        if (!gone) stop = watchGames(watched, () => setGames(onlineGames()), checked);
      })
      .catch(() => setChecking(new Set()));
    return () => {
      gone = true;
      stop?.();
    };
  }, [watched]);
  if (!saved && !games.length) return null;
  const online = [...games].sort((a, b) => Number(!!b.myTurn) - Number(!!a.myTurn));
  return (
    <div className="lobby-card your-games">
      <h2>Your games</h2>
      <ul>
        {saved && (
          <GameRow
            title={saved.players.map((p) => p.name).join(', ')}
            meta={[
              'On this device',
              rulesOf(saved).name,
              saved.board.mapName,
              saved.phase === 'setup' ? 'Setting up' : `Turn ${saved.turn.number}`,
            ].join(' · ')}
            online={false}
            onOpen={onResume}
            removeLabel="Discard this game"
            onRemove={() => setRemoving({ saved: true })}
          />
        )}
        {online.map((g) => (
          <GameRow
            key={g.secret}
            title={g.players?.join(', ') ?? 'New game'}
            meta={['Online', g.mode, g.map, g.status].filter(Boolean).join(' · ')}
            online
            yourMove={g.myTurn}
            checking={checking.has(g.secret)}
            href={`#online/${g.secret}`}
            removeLabel="Remove from this browser"
            onRemove={() => (g.over ? forget(g.secret) : setRemoving({ secret: g.secret }))}
          />
        ))}
      </ul>
      {removing && 'saved' in removing ? (
        <Confirm
          title="Discard this game?"
          message="The game on this device is gone for good."
          yes="Discard"
          onYes={() => {
            setRemoving(null);
            onDiscard();
          }}
          onNo={() => setRemoving(null)}
        />
      ) : removing ? (
        <Confirm
          title="Remove this game?"
          message="It goes from this browser. The others can go on playing; you can rejoin with the link."
          yes="Remove"
          onYes={() => forget(removing.secret)}
          onNo={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
