import { lazy, Suspense, useEffect, useState } from 'react';
import { createGame, type GameState } from '@regolith/engine';
import { useGame } from './game/useGame';
import { clearSavedGame, gameOnScreenBeforeReload, markGameOnScreen, saveGame } from './game/savedGame';
import { begin, saved } from './game/past';
import { devStartGame } from './game/devStart';
import { Lobby, type LobbyResult } from './components/lobby/Lobby';
import { Game } from './components/GameScreen';
import { onlineSecret } from './online/link';
import { ambience } from './ambience';

// Loaded when first wanted, so the lobby and a game on this device start without them: the manual, and
// online play (with its cryptography).
const Rules = lazy(() => import('./components/Rules').then((m) => ({ default: m.Rules })));
const OnlineScreen = lazy(() => import('./online/OnlineScreen').then((m) => ({ default: m.OnlineScreen })));
let creatingOnline = false;

export function App() {
  const [game, setGame] = useState<GameState | null>(() => devStartGame() ?? (onlineSecret() ? null : gameOnScreenBeforeReload()));
  const [rules, setRules] = useState(false);
  // An online game is opened by its link: #online/<secret>.
  const [online, setOnline] = useState(onlineSecret);
  useEffect(() => markGameOnScreen(!!game && !online), [game, online]);
  // The music plays from the lobby on, as soon as the browser lets it: after the first tap or key.
  useEffect(ambience, []);
  useEffect(() => {
    const follow = () => {
      const secret = onlineSecret();
      setOnline(secret);
      // Leaving a game on this device (Back, or an invite link): it lives on as the saved game, to
      // resume from the lobby. Its screen would otherwise come back at the state it started from.
      if (secret) setGame(null);
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const start = (r: LobbyResult) => {
    if (r.online) {
      // The online code loads first: a second tap meanwhile would create a second game.
      if (creatingOnline) return;
      creatingOnline = true;
      void import('./online/create')
        .then(({ createOnlineGame }) => (location.hash = `#online/${createOnlineGame(r)}`))
        .finally(() => (creatingOnline = false));
    } else {
      const g = createGame({ players: r.players, mapId: r.mapId, mode: r.mode });
      // A new game's past starts with it, so what its creation wrote in the log can be looked back at.
      saveGame(g, saved(begin(g)));
      setGame(g);
    }
  };
  /** Back to the lobby; the game lives on as the saved game, to resume from there. */
  const toLobby = () => setGame(null);
  const quit = () => {
    clearSavedGame();
    setGame(null);
  };

  return (
    <>
      {online ? (
        <Suspense fallback={null}>
          <OnlineScreen key={online} secret={online} onLeave={() => (location.hash = '')} onRules={() => setRules(true)} />
        </Suspense>
      ) : game ? (
        <LocalGame key={game.seed} initial={game} onQuit={quit} onLobby={toLobby} onRules={() => setRules(true)} />
      ) : (
        <Lobby onStart={start} onRules={() => setRules(true)} onResume={setGame} />
      )}
      {/* Its own boundary: while the manual loads, the screen under it stays. */}
      {rules && (
        <Suspense fallback={null}>
          <Rules onClose={() => setRules(false)} />
        </Suspense>
      )}
    </>
  );
}

function LocalGame({
  initial,
  onQuit,
  onLobby,
  onRules,
}: {
  initial: GameState;
  onQuit: () => void;
  onLobby: () => void;
  onRules: () => void;
}) {
  const view = useGame(initial);
  return <Game view={view} onQuit={onQuit} onLobby={onLobby} onRules={onRules} />;
}
