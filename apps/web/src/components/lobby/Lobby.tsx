import { useRef, useState, type CSSProperties } from 'react';
import { defaultMapFor, MAPS, MODES, playerCounts, RULESETS, type GameMode, type GameState, type PlayerConfig } from '@regolith/engine';
import { Segmented } from '../Segmented';
import { Confirm } from '../Dialog';
import { FullscreenButton } from '../FullscreenButton';
import { defaultSeat } from '../../game/seats';
import { clearSavedGame, loadSavedGame } from '../../game/savedGame';
import { remember } from '../../storage';
import { PLAYER_COLORS } from '../../theme';
import { COARSE } from '../../game/useMediaQuery';
import { LobbyBackdrop } from './Backdrop';
import { HomeScreenHint } from './HomeScreenHint';
import { VersionLine } from './VersionLine';
import { WhereIcon } from './WhereIcon';
import { YourGames } from './YourGames';
import { Field, MapPicker, SeatRow } from './NewGameFields';
import { INTRO_RISE_MS, useIntro } from './useIntro';
import { MODE_KEY, PLAYER_COUNTS, isFriendSeat, mapKey, storedAiLevel, storedMap, storedMode } from './choices';
import { GAME_NAME } from '../../appId';
import { useWarmMapImages } from '../../art/tileImages';

export interface LobbyResult {
  players: PlayerConfig[];
  mapId: string;
  mode: GameMode;
  /** Played online: the human seats other than the first are for friends to claim. */
  online?: boolean;
}

export function Lobby({
  onStart,
  onRules,
  onResume,
}: {
  onStart: (r: LobbyResult) => void;
  onRules: () => void;
  onResume: (saved: GameState) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const intro = useIntro(title);
  // Read on each visit: a game played since keeps saving itself.
  const [saved, setSaved] = useState(loadSavedGame);
  const discard = () => {
    clearSavedGame();
    setSaved(null);
  };
  const [wanted, setWanted] = useState(2);
  const [online, setOnline] = useState(false);
  const [mode, setMode] = useState<GameMode>(storedMode);
  // A count the rules have no map for falls back to their largest.
  const counts = playerCounts(RULESETS[mode]);
  const count = counts.includes(wanted) ? wanted : counts[counts.length - 1];
  // Each way of playing keeps its own seats: AI opponents on this device, friends online.
  const [seatSets, setSeatSets] = useState<Record<'local' | 'online', PlayerConfig[]>>(() => {
    const aiLevel = storedAiLevel();
    return {
      local: PLAYER_COLORS.map((_, i) => defaultSeat(i, i !== 0, aiLevel)),
      online: PLAYER_COLORS.map((_, i) => defaultSeat(i, false, aiLevel)),
    };
  });
  const where = online ? 'online' : 'local';
  const seats = seatSets[where];
  const [mapIds, setMapIds] = useState<Record<number, string>>(() => Object.fromEntries(PLAYER_COUNTS.map((n) => [n, storedMap(n)])));
  const choices = MAPS.filter((m) => m.players === count && RULESETS[mode].mapGroups.includes(m.group));
  // A remembered map the chosen rules don't use falls back to their default map (it stays remembered).
  const map = choices.find((m) => m.id === mapIds[count]) ?? defaultMapFor(RULESETS[mode], count)!;
  useWarmMapImages(map);

  const chooseMode = (id: GameMode) => {
    setMode(id);
    remember(MODE_KEY, id);
  };
  const chooseMap = (id: string) => {
    setMapIds((ids) => ({ ...ids, [count]: id }));
    remember(mapKey(count), id);
  };
  const updateSeat = (i: number, patch: Partial<PlayerConfig>) =>
    setSeatSets((sets) => ({ ...sets, [where]: sets[where].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  // Online, the first seat is yours; human seats after it are for friends.
  const playing = seats.slice(0, count);
  const friendSeats = playing.filter((s, i) => isFriendSeat(s, i, online)).length;
  const canStart = !online || friendSeats > 0;

  // Starting a new game here discards the one in progress on this device: asked first.
  const [confirmingNew, setConfirmingNew] = useState(false);
  const start = () => {
    setConfirmingNew(false);
    onStart({
      players: playing.map((s, i) => ({
        ...s,
        name: isFriendSeat(s, i, online) ? `Player ${i + 1}` : s.name.trim() || `Player ${i + 1}`,
      })),
      mapId: map.id,
      mode,
      online,
    });
  };

  return (
    <div
      className={`lobby${intro.phase ? ` intro-${intro.phase}` : ''}`}
      style={{ '--intro-y': `${intro.offset}px`, '--intro-rise': `${INTRO_RISE_MS}ms` } as CSSProperties}
    >
      <LobbyBackdrop map={map} />
      <div className="lobby-hero">
        <h1 ref={title}>{GAME_NAME}</h1>
        {intro.phase && intro.waits && (
          <p className={`intro-prompt${intro.started ? ' gone' : ''}`}>{matchMedia(COARSE).matches ? 'Tap' : 'Click'} to start</p>
        )}
      </div>
      <div className="lobby-corner">
        <FullscreenButton />
      </div>
      <HomeScreenHint />

      <YourGames saved={saved} onResume={() => saved && onResume(saved)} onDiscard={discard} />

      <div className="lobby-card">
        <h2>New game</h2>
        <div className="lobby-form">
          <Field
            label="Play"
            hint={
              online
                ? 'You get a link to send to your friends. Play together live or one move at a time over days. No account needed.'
                : 'Against the AI, or pass the device around.'
            }
          >
            <Segmented
              options={[
                [
                  false,
                  <>
                    <WhereIcon online={false} />
                    On this device
                  </>,
                ],
                [
                  true,
                  <>
                    <WhereIcon online />
                    <span className="wide-only">Online with friends</span>
                    <span className="narrow-only">Online</span>
                  </>,
                ],
              ]}
              value={online}
              onPick={setOnline}
            />
          </Field>

          <Field label="Rules" hint={RULESETS[mode].summary}>
            <Segmented className="rules-picker" options={MODES.map((m) => [m.id, m.name] as const)} value={mode} onPick={chooseMode} />
          </Field>

          <Field label="Players">
            <Segmented options={counts.map((n) => [n, n] as const)} value={count} onPick={setWanted} />
          </Field>

          <div className="seats">
            {playing.map((s, i) => (
              <SeatRow key={i} seat={s} index={i} online={online} onChange={(patch) => updateSeat(i, patch)} />
            ))}
          </div>

          <MapPicker map={map} choices={choices} onChoose={chooseMap} />
        </div>

        {!canStart && <p className="field-hint">Make at least one seat a Friend to play online.</p>}
        <div className="modal-actions">
          <button
            className="btn btn-primary btn-lg"
            disabled={!canStart}
            onClick={() => (!online && saved ? setConfirmingNew(true) : start())}
          >
            {online ? 'Create online game' : 'Deploy your mechs'}
          </button>
        </div>
      </div>
      {confirmingNew && (
        <Confirm
          title="Start a new game?"
          message="The game in progress on this device is discarded."
          yes="Start new game"
          onYes={start}
          onNo={() => setConfirmingNew(false)}
        />
      )}
      <nav className="lobby-links">
        <button onClick={onRules}>How to play</button>
        <a href="#rulebook">Manual (PDF)</a>
        <a href="#lab/cards">Art Lab: cards &amp; tiles</a>
      </nav>
      <p className="credits">Regolith, a game by Christian Nold.</p>
      <VersionLine />
    </div>
  );
}
