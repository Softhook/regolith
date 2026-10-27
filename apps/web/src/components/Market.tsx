import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { card, cardKind, effectOf, expansionCard, rulesOf, say, type DeckKind, type GameState } from '@regolith/engine';
import type { Legal } from '../game/legal';
import type { Dispatch } from '../game/useGame';
import { FOLD_MARKET, useMediaQuery } from '../game/useMediaQuery';
import { useShortcut } from '../game/useShortcut';
import { remember, stored } from '../storage';
import { CardView, categoryStyle } from './Card';
import { CardFlights } from './CardFlight';
import { CardViewer } from './CardViewer';
import { warmCardImages } from '../art/cardImages';
import { useCardBack } from '../art/useCardImages';
import { Dialog } from './Dialog';
import { appKey } from '../appId';

/**
 * `steady` (looking back at the game): the market only grows, so the map above it keeps its size from step to step.
 * `scene` changes when the screen jumps to another position (see Board): no cards fly then.
 */
export function Market({
  game,
  dispatch,
  legal,
  steady,
  scene,
}: {
  game: GameState;
  dispatch: Dispatch;
  legal: Legal;
  steady?: boolean;
  scene?: string;
}) {
  const patientPick = legal.can('patientTactic');
  const picking = legal.can('takeCard') || patientPick;
  const m = game.market;
  const canPatientStore = (deck: DeckKind | 'expansion', index: number) =>
    deck === 'tactic' && legal.can('patientTactic', (a) => a.index === index);
  const canTake = (deck: DeckKind | 'expansion', index: number) =>
    canPatientStore(deck, index) || legal.can('takeCard', (a) => a.deck === deck && a.index === index);
  const canStore = (deck: DeckKind | 'expansion', index: number) =>
    legal.can('takeCard', (a) => a.deck === deck && a.index === index && !!a.store);
  /** Takes the card (Patient: stores it, or asks whether to), or else shows it. */
  const clickCard = (deck: DeckKind, index: number, id: string) => {
    if (canPatientStore(deck, index)) dispatch({ type: 'patientTactic', index });
    else if (canStore(deck, index)) setPatientChoice({ id, index });
    else if (canTake(deck, index)) dispatch({ type: 'takeCard', deck, index });
    else setViewingCard(id);
  };
  const canExpand = canTake('expansion', 0);
  const cardRules = rulesOf(game).cards!;
  const expansion = expansionCard(game);
  const peek = cardRules.peek;
  const [viewing, setViewing] = useState<DeckKind | null>(null);
  const [viewingCard, setViewingCard] = useState<string | null>(null);
  const [patientChoice, setPatientChoice] = useState<{ id: string; index: number } | null>(null);
  const { open, toggle } = useCollapse(picking);
  const list = useMediaQuery(LIST);
  const section = useRef<HTMLElement>(null);
  useGrowOnly(section, !!steady);
  useWarmCards(game);
  // A pick over, the turn panel comes back into view: in phone landscape's column you may have scrolled down to a card.
  useEffect(() => {
    if (picking) return () => document.querySelector('.turn-panel')?.scrollIntoView({ block: 'nearest' });
  }, [picking]);
  const decks: Record<DeckKind, { name: string; cards: string[] }> = {
    skill: { name: cardRules.terms.skillDeck, cards: m.skillDeck },
    tactic: { name: cardRules.terms.tacticDeck, cards: m.tacticDeck },
  };
  const deckTitle = (deck: DeckKind) => `${cardsLeft(decks[deck].cards.length)} in the ${decks[deck].name} deck — click to view them`;

  const peekAt = (deck: DeckKind, cards: string[], index: number) =>
    peek && index === cards.length - 1 && cards.length === 3 && decks[deck].cards.length > 0;
  /**
   * The cards a row shows. In the phone list, copies of a card are one row with a ×n badge (Classic can deal
   * two Expansions); taking it takes the first copy. Elsewhere every card is its own.
   */
  const shown = (deck: DeckKind, cards: string[]) =>
    cards.flatMap((id, index) => {
      if (!list) return [{ id, index, badge: peekAt(deck, cards, index) ? 'Peek' : undefined }];
      if (cards.indexOf(id) !== index) return [];
      const copies = cards.flatMap((x, i) => (x === id ? [i] : []));
      const badge = [copies.length > 1 && `×${copies.length}`, copies.some((i) => peekAt(deck, cards, i)) && 'Peek']
        .filter(Boolean)
        .join(' · ');
      return [{ id, index, badge: badge || undefined }];
    });

  const row = (deck: DeckKind, cards: string[]) => {
    const rowCards = shown(deck, cards);
    return (
      <div className={`market-row market-${deck}`} style={{ '--cards': rowCards.length } as CSSProperties}>
        <button type="button" className={`deck deck-${deck}`} title={deckTitle(deck)} onClick={() => setViewing(deck)}>
          {!list && <DeckBack cardId={(deck === 'skill' ? cardRules.skills : cardRules.tactics)[0].id} />}
          <span className="deck-label">{decks[deck].name}</span>
          <span className="deck-count">{decks[deck].cards.length}</span>
        </button>
        {rowCards.map(({ id, index, badge }) => (
          <CardView
            key={`${id}#${cards.slice(0, index).filter((x) => x === id).length}`}
            id={id}
            size="sm"
            className={`market-card ${canTake(deck, index) ? 'takeable' : ''}`}
            badge={badge}
            index={index}
            art={!list}
            onClick={() => clickCard(deck, index, id)}
          />
        ))}
      </div>
    );
  };

  const viewer = viewing && (
    <CardViewer
      title={`${decks[viewing].name} deck`}
      subtitle={
        decks[viewing].cards.length
          ? `${cardsLeft(decks[viewing].cards.length)}, shown alphabetically (draw order stays hidden).`
          : 'The deck is empty.'
      }
      cards={decks[viewing].cards}
      onClose={() => setViewing(null)}
    />
  );

  const cardViewer = viewingCard && (
    <CardViewer
      title={card(viewingCard).name}
      subtitle={card(viewingCard).subtitle}
      cards={[viewingCard]}
      single
      onClose={() => setViewingCard(null)}
    />
  );

  const takePatient = (index: number, store: boolean) => {
    dispatch({ type: 'takeCard', deck: 'tactic', index, ...(store && { store }) });
    setPatientChoice(null);
  };
  const patientDialog = patientChoice && (
    <Dialog
      title="Patient"
      subtitle={`Do you want to play ${card(patientChoice.id).name} immediately, or store it to play at the end of a turn?`}
      onClose={() => setPatientChoice(null)}
    >
      <div className="card-choice">
        <CardView id={patientChoice.id} size="md" />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => takePatient(patientChoice.index, false)}>
          Play immediately
        </button>
        <button type="button" className="btn btn-primary" onClick={() => takePatient(patientChoice.index, true)}>
          Store tactic
        </button>
      </div>
    </Dialog>
  );

  const chips = (deck: DeckKind, cards: string[]) => (
    <div className={`market-strip-group market-${deck}`}>
      <button type="button" className="market-strip-deck" title={deckTitle(deck)} onClick={() => setViewing(deck)}>
        {decks[deck].name}
      </button>
      {cards.map((id, index) => {
        const def = card(id);
        const kind = effectOf(id) === 'expansion' ? 'expansion' : cardKind(id);
        return (
          <button
            type="button"
            key={`${id}#${index}`}
            className={`market-chip market-chip-${kind} ${canTake(deck, index) ? 'takeable' : ''}`}
            style={categoryStyle(def.category, kind === 'skill')}
            title={say(game, `${def.name} — ${def.text}`)}
            data-card={id}
            data-index={index}
            onClick={() => setViewingCard(id)}
          >
            {say(game, def.name)}
          </button>
        );
      })}
    </div>
  );

  const toggleButton = (
    <button
      type="button"
      className="market-toggle"
      aria-expanded={open}
      aria-controls="market-cards"
      title={`${open ? 'Hide' : 'Show'} the card market (C)`}
      onClick={toggle}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 15 6-6 6 6" />
      </svg>
      <span>Card Market</span>
    </button>
  );

  // Open: the face-up rows as cards, ready to take.
  const rows = (
    <>
      {row('skill', m.skillRow)}
      {row('tactic', m.tacticRow)}
      {cardRules.expansionPile && (
        <div className="market-row market-expansion" style={{ '--cards': 1 } as CSSProperties}>
          <CardView
            id={expansion.id}
            size="sm"
            badge={`×${m.expansions}`}
            art={!list}
            onClick={canExpand ? () => dispatch({ type: 'takeCard', deck: 'expansion', index: 0 }) : () => setViewingCard(expansion.id)}
            className={`market-card ${m.expansions ? '' : 'empty'} ${canExpand ? 'takeable' : ''}`}
          />
        </div>
      )}
      {patientPick && (
        <button
          className="btn btn-ghost market-refresh"
          title="Patient: you may take and store a face-up tactic"
          onClick={() => dispatch({ type: 'patientTactic' })}
        >
          Don't store a tactic
        </button>
      )}
      {legal.can('profiteer') && (
        <button
          className="btn btn-ghost market-refresh"
          title={say(game, 'Profiteering: a card earned by a Conquer action')}
          onClick={() => dispatch({ type: 'profiteer' })}
        >
          {say(game, 'Take 1 missile instead of a card')}
        </button>
      )}
    </>
  );

  // Collapsed: one slim strip of card-name chips, so the board gets the space back. A chip shows its card.
  // The Expansion pile goes with the tactics, so a strip too narrow for one line wraps them together.
  const strip = (
    <>
      {chips('skill', m.skillRow)}
      <div className="market-strip-line">
        {chips('tactic', m.tacticRow)}
        {cardRules.expansionPile && (
          <div className="market-strip-group market-strip-expansion">
            <button
              type="button"
              className={`market-chip market-chip-expansion ${canExpand ? 'takeable' : ''}`}
              title={`${m.expansions} ${expansion.name} cards left`}
              data-card={expansion.id}
              onClick={() => setViewingCard(expansion.id)}
            >
              {expansion.name} ×{m.expansions}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <section ref={section} id="market-cards" className={`market ${open ? '' : 'collapsed'} ${picking ? 'picking' : ''}`}>
      {toggleButton}
      {open ? rows : strip}
      {viewer}
      {cardViewer}
      {patientDialog}
      <CardFlights game={game} scene={scene} />
    </section>
  );
}

/** A deck pile: the printed back of `cardId`'s deck, once drawn (till then, the pile's plain colour). */
function DeckBack({ cardId }: { cardId: string }) {
  const src = useCardBack(cardId);
  return <div className="deck-stack" style={src ? { backgroundImage: `url("${src}")` } : undefined} />;
}

/** Where the open market is a list of cards, one a row: styles.css's phone layouts (portrait's sheet, landscape's column). */
const LIST = '(max-width: 600px), (max-width: 980px) and (max-height: 500px) and (orientation: landscape)';

const cardsLeft = (n: number) => `${n} card${n === 1 ? '' : 's'} left`;

const STORAGE_KEY = appKey('marketCollapsed');

/** While `hold`, `el` never gets shorter than it has been (its own min-height), and is free again after. */
function useGrowOnly(el: RefObject<HTMLElement>, hold: boolean) {
  useLayoutEffect(() => {
    const box = el.current;
    if (!hold || !box) return;
    let h = 0;
    const measure = () => {
      if (box.offsetHeight <= h) return;
      h = box.offsetHeight;
      box.style.minHeight = `${h}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => {
      ro.disconnect();
      box.style.minHeight = '';
    };
  }, [el, hold]);
}

/**
 * The market's open/collapsed state. The player's choice is remembered across games, but a collapsed
 * market opens by itself while they have a card to pick (and can be collapsed again for that pick).
 * C toggles it.
 */
function useCollapse(picking: boolean) {
  const [collapsed, setCollapsed] = useState(() => (stored(STORAGE_KEY) ?? (matchMedia(FOLD_MARKET).matches ? '1' : '0')) === '1');
  // Follows `picking` during render (not in an effect), so the market never flashes collapsed first.
  const [autoOpen, setAutoOpen] = useState(picking);
  const [wasPicking, setWasPicking] = useState(picking);
  if (picking !== wasPicking) {
    setWasPicking(picking);
    setAutoOpen(picking);
  }
  const open = !collapsed || autoOpen;

  const toggle = () => {
    const next = open;
    setAutoOpen(false);
    setCollapsed(next);
    remember(STORAGE_KEY, next ? '1' : '0');
  };

  useShortcut((e) => !(e.metaKey || e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'c', toggle);

  return { open, toggle };
}

/**
 * Draws the pop-up art of the cards in play in the background: those face up and in players' hands
 * first (the ones tapped for a closer look), then the decks.
 */
function useWarmCards(game: GameState) {
  const m = game.market;
  const ids = [
    ...m.skillRow,
    ...m.tacticRow,
    ...(rulesOf(game).cards?.expansionPile ? [expansionCard(game).id] : []),
    ...game.players.flatMap((p) => [...p.skills.map((s) => s.id), ...(p.storedTactics ?? [])]),
    ...m.skillDeck,
    ...m.tacticDeck,
  ];
  // Card ids, joined so the effect reruns only when the cards change, not on every new array.
  const sig = ids.join();
  useEffect(() => warmCardImages(sig ? sig.split(',') : []), [sig]);
}
