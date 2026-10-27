import { Component, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { expansionCard, type GameState } from '@regolith/engine';
import { reducedMotion } from '../game/useMediaQuery';
import { lastLogId, useTransient } from '../game/useTransient';
import { leftRow } from '../game/marketRow';
import { CardArt } from './CardViewer';

interface Flight {
  key: string;
  card: string;
  /** The card's top-left corner and width as it sets off. */
  x: number;
  y: number;
  w: number;
  dx: number;
  dy: number;
  color: string;
}

/** A card leaving the market for `player`, from where it was on screen. */
interface Departure {
  key: string;
  card: string;
  player: number;
  from: DOMRect;
}

const FLIGHT_MS = 480;
/** No wider than a market card, though a phone's list of them is a row each. */
const MAX_WIDTH = 120;
const CARD_RATIO = 88.9 / 63.5;

/**
 * A face-up card's place in the market (a card when open, a chip when collapsed): the copy at `index` in its
 * row, or the first copy (a phone's list shows one of each).
 */
function marketSpot(id: string, index: number | undefined): DOMRect | undefined {
  const card = `#market-cards :is(.market-card, .market-chip)[data-card="${CSS.escape(id)}"]`;
  const el = (index !== undefined && document.querySelector(`${card}[data-index="${index}"]`)) || document.querySelector(card);
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 ? r : undefined;
}

/** Where a player's cards go: their row in the players, or else the turn panel (a phone's closed sheet). */
function playerSpot(player: number): DOMRect | undefined {
  for (const el of [document.querySelector(`.player[data-player="${player}"]`), document.querySelector('.turn-panel')]) {
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.bottom > 0 && r.top < innerHeight) return r;
  }
}

/**
 * The cards that left the market from `was` to `game` for a player: taken, or played straight from it (a Tactic),
 * with where each was in its row.
 */
function leaving(was: GameState, game: GameState) {
  const before = lastLogId(was);
  const { skillRow, tacticRow } = was.market;
  const gone = [
    ...leftRow(skillRow, game.market.skillRow).map((i) => ({ card: skillRow[i], index: i })),
    ...leftRow(tacticRow, game.market.tacticRow).map((i) => ({ card: tacticRow[i], index: i })),
  ];
  return game.log.flatMap((e) => {
    if (e.id <= before || e.player === undefined) return [];
    if (e.event === 'expansion' && was.market.expansions > game.market.expansions) {
      return [{ id: e.id, card: expansionCard(game).id, player: e.player, index: undefined as number | undefined }];
    }
    if ((e.event !== 'cardTaken' && e.event !== 'cardPlayed') || !e.card) return [];
    const k = gone.findIndex((g) => g.card === e.card);
    return k < 0 ? [] : [{ id: e.id, card: e.card, player: e.player, index: gone.splice(k, 1)[0].index }];
  });
}

interface DeparturesProps {
  game: GameState;
  scene?: string;
  onDepart: (d: Departure[]) => void;
}

/**
 * Measures the cards leaving the market just before a new `game` reaches the screen, while they are still there:
 * React calls getSnapshotBeforeUpdate before it changes the page. `onDepart` gets them once the new screen is laid
 * out. Nothing for a jump to another position (`scene` changed), or under reduced motion.
 */
class Departures extends Component<DeparturesProps> {
  getSnapshotBeforeUpdate(prev: Readonly<DeparturesProps>): Departure[] | null {
    const { game, scene } = this.props;
    if (prev.game === game || prev.scene !== scene || reducedMotion()) return null;
    const out = leaving(prev.game, game).flatMap((e) => {
      const from = marketSpot(e.card, e.index);
      return from ? [{ key: `${e.id}`, card: e.card, player: e.player, from }] : [];
    });
    return out.length ? out : null;
  }

  componentDidUpdate(_prev: unknown, _state: unknown, departures: Departure[] | null) {
    if (departures) this.props.onDepart(departures);
  }

  render() {
    return null;
  }
}

/** Aims each departing card at its player, centred on where it was. */
function aim(departures: Departure[], game: GameState): Flight[] {
  return departures.flatMap(({ key, card, player, from }): Flight[] => {
    const to = playerSpot(player);
    if (!to) return [];
    const w = Math.min(from.width, MAX_WIDTH);
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    return [
      {
        key,
        card,
        x: cx - w / 2,
        y: cy - (w * CARD_RATIO) / 2,
        w,
        dx: to.left + to.width / 2 - cx,
        dy: to.top + to.height / 2 - cy,
        color: game.players[player].color,
      },
    ];
  });
}

/**
 * A card taken from the market flies from its place there to whoever took it, its art shrinking as it
 * goes. None under reduced motion, for a jump to another position (`scene` changes: looking back at the
 * game, or skipping ahead online), or for cards that leave otherwise (a market refresh). Cards already
 * in the air land.
 */
export function CardFlights({ game, scene }: { game: GameState; scene?: string }) {
  const [flights, show] = useTransient<Flight>(FLIGHT_MS);
  return (
    <>
      <Departures game={game} scene={scene} onDepart={(d) => show(aim(d, game))} />
      {flights.length > 0 &&
        createPortal(
          flights.map((f) => (
            <div
              key={f.key}
              className="card-flight"
              aria-hidden
              style={
                {
                  left: f.x,
                  top: f.y,
                  width: f.w,
                  '--dx': `${f.dx}px`,
                  '--dy': `${f.dy}px`,
                  '--pc': f.color,
                } as CSSProperties
              }
            >
              <CardArt id={f.card} size="md" />
            </div>
          )),
          document.body,
        )}
    </>
  );
}
