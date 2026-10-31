import { useCallback, useEffect, useMemo, useState } from 'react';
import { CARD_CATEGORIES, cardBackSvg, cardIllustration, cardSvg, deckInfo, type CardDeck, type CardFace } from '@regolith/art';
import { DECKS, cardFontCss, cardNote, measure, useFontCss, useSvgUrl, type Deck } from './cards';
import { PIECES, slugOf, type Printable } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabHeader } from './LabHeader';
import { Segmented } from '../components/Segmented';

/**
 * Art Lab, cards page (#lab/cards): every card at poker size (63.5 × 88.9 mm) with its deck's back, deck by
 * deck, and exports for print: single cards, a ZIP of the whole set, CMYK PDFs for a press, and print sheets.
 */

type Sort = 'name' | 'category';

const SORTS: [Sort, string][] = [
  ['name', 'Name'],
  ['category', 'Category'],
];

/** One printable thing: a card front, or a deck's back. */
interface Item {
  key: string;
  deck: CardDeck;
  face?: CardFace;
}

const itemOf = (c: CardFace): Item => ({ key: `${c.deck}:${c.id}`, deck: c.deck, face: c });
const backOf = (d: Deck): Item => ({ key: `${d.id}:back`, deck: d.id });
const itemsOf = (d: Deck): Item[] => [backOf(d), ...d.cards.map(itemOf)];

const CATEGORY_ORDER = Object.keys(CARD_CATEGORIES);
const categoryRank = (c: CardFace) => {
  const i = CATEGORY_ORDER.indexOf(c.category);
  return i < 0 ? Infinity : i;
};
const byName = (a: CardFace, b: CardFace) => a.name.localeCompare(b.name);
const SORTERS: Record<Sort, (a: CardFace, b: CardFace) => number> = {
  name: byName,
  category: (a, b) => categoryRank(a) - categoryRank(b) || byName(a, b),
};

const copiesOf = (c: CardFace) => c.copies ?? 1;
const totalCopies = (cards: CardFace[]) => cards.reduce((s, c) => s + copiesOf(c), 0);
const countNote = (cards: CardFace[]) => {
  const n = totalCopies(cards);
  return `${cards.length} cards${n > cards.length ? `, ${n} with copies` : ''}`;
};

export function CardLab() {
  const [sort, setSort] = useState<Sort>('name');
  const [selected, setSelected] = useState(() => itemOf(DECKS[0].cards[0]).key);
  const [bleed, setBleed] = useState(true);
  const fonts = useFontCss(cardFontCss);

  const all = useMemo(() => DECKS.flatMap(itemsOf), []);
  const item = all.find((i) => i.key === selected) ?? all[0];

  const svgOf = useCallback(
    (i: Item, o: { bleed?: boolean; rounded?: boolean } = {}) =>
      i.face ? cardSvg(i.face, { ...o, measure, fontCss: fonts ?? '' }) : cardBackSvg(i.deck, { ...o, fontCss: fonts ?? '' }),
    [fonts],
  );

  // Thumbnails as blob URLs: cheaper than data URLs for documents carrying their fonts.
  const thumbs = useMemo(() => {
    if (fonts === null) return new Map<string, string>();
    return new Map(all.map((i) => [i.key, URL.createObjectURL(new Blob([svgOf(i, { rounded: true })], { type: 'image/svg+xml' }))]));
  }, [all, fonts, svgOf]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const detail = useSvgUrl(fonts === null ? '' : svgOf(item, { bleed }));

  // Named as the card reads, not by its id: `07-tune-up`, not `07-r-agile`.
  const fileName = (i: Item) => (i.face ? `${String(i.face.index).padStart(2, '0')}-${slugOf(i.face.name)}` : 'back');
  const printable = (i: Item): Printable => ({
    name: `${i.deck}/${fileName(i)}`,
    svg: (b) => svgOf(i, { bleed: b }),
  });
  const sheets = (copies: boolean) =>
    DECKS.flatMap((d) =>
      d.cards.flatMap((c) =>
        Array<{ front: Printable; back: Printable }>(copies ? copiesOf(c) : 1).fill({
          front: printable(itemOf(c)),
          back: printable(backOf(d)),
        }),
      ),
    );

  const info = deckInfo(item.deck);
  const note = item.face && cardNote(item.face);
  const order = SORTERS[sort];

  const thumb = (i: Item) => (
    <button data-lab-nav key={i.key} className={`lab-thumb ${i.key === item.key ? 'on' : ''}`} onClick={() => setSelected(i.key)}>
      {thumbs.get(i.key) ? <img src={thumbs.get(i.key)} alt={i.face?.name ?? 'Back'} loading="lazy" /> : <span className="lab-card-ph" />}
      <span>
        {i.face ? i.face.name : `${deckInfo(i.deck).label} back`}
        {i.face && copiesOf(i.face) > 1 ? ` ×${copiesOf(i.face)}` : ''}
      </span>
    </button>
  );
  return (
    <div className="lab">
      <LabHeader page="cards" />
      <div className="lab-body">
        <div>
          {fonts === null && (
            <p className="lab-note">
              <span className="spinner" /> Loading fonts…
            </p>
          )}
          {DECKS.map((d, i) => (
            <section key={d.id} className="lab-deck">
              <div className="lab-deck-head">
                <h2>
                  {d.name} <span className="muted">· {countNote(d.cards)}</span>
                </h2>
                {i === 0 && (
                  <span className="lab-sort">
                    Sort
                    <Segmented small options={SORTS} value={sort} onPick={setSort} />
                  </span>
                )}
              </div>
              <div className="lab-grid cards">{[...d.cards].sort(order).map((c) => thumb(itemOf(c)))}</div>
            </section>
          ))}
          <section className="lab-deck">
            <div className="lab-deck-head">
              <h2>
                Backs <span className="muted">· one per deck</span>
              </h2>
            </div>
            <div className="lab-grid cards">{DECKS.map(backOf).map(thumb)}</div>
          </section>
        </div>
        <aside className="lab-detail">
          {detail ? <img className="lab-card" src={detail} alt={item.face?.name ?? 'Back'} /> : <span className="lab-card lab-card-ph" />}
          <p className="lab-note">
            {item.face ? (
              <>
                {info.label} ({info.kind.toLowerCase()}) · {CARD_CATEGORIES[item.face.category]?.label} · {cardIllustration(item.face)}
                {copiesOf(item.face) > 1 ? ` · ${copiesOf(item.face)} copies` : ''}
                {note && (
                  <>
                    <br />
                    {note}
                  </>
                )}
              </>
            ) : (
              <>Back of every {info.label} card</>
            )}
          </p>
          <PrintPanel
            piece={PIECES.card}
            item={printable(item)}
            bleed={bleed}
            onBleed={setBleed}
            set={all.map(printable)}
            notes={`Copies per card: the ×N mark on the card.\nEach folder's back.png is the back for every card in it.\n`}
            sheets={sheets}
            cmyk="files"
            copies
            backs
            ready={fonts !== null}
            fontsMissing={fonts === ''}
          />
        </aside>
      </div>
    </div>
  );
}
