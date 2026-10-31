import { useMemo } from 'react';
import { PRESS_TEST, cardSvg, dataUrl, pressTestSvg, tileSpec, tileSvg } from '@regolith/art';
import { DECKS, cardFontCss, measure, tileFontCss, useFontCss, useSvgUrl } from './cards';
import { exportCmykPdf, exportPng } from '../print/exports';
import type { Format, Printable } from '../print/pieces';
import { DEEP_NOTE, DeepBlack, ExportStatus, Space, useDeepBlack } from '../print/PrintPanel';
import { PRESS } from '../print/press';
import { useExport } from '../print/useExport';
import { LabHeader } from './LabHeader';
import { SheetPreview } from './SheetPreview';

/** The tile and the dark card the test prints at 100 %: a dark tile, where the shadows matter most. */
const TILE_ID = 'p10-02';
const CARD = DECKS.find((d) => d.id === 'tactic')!.cards[0];

/** The page as a print format: A4, no bleed. */
const PAGE: Format = { id: 'proof', w: PRESS_TEST.w, h: PRESS_TEST.h, bleed: 0, dpi: 600 };

/**
 * Art Lab, press test page (#lab/proof): one A4 page to print on the real press and stock before a
 * run (proof.ts): as the CMYK PDF a print service gets, or as an RGB PNG for one that converts itself.
 */
export function ProofLab() {
  const cardFont = useFontCss(cardFontCss);
  const tileFont = useFontCss(tileFontCss);
  const { run, progress, error } = useExport();
  const [deep, setDeep] = useDeepBlack();

  const svg = useMemo(() => {
    if (cardFont === null || tileFont === null) return '';
    const tile = dataUrl(tileSvg(tileSpec(TILE_ID), { markings: true, fontCss: tileFont }));
    const card = dataUrl(cardSvg(CARD, { measure, fontCss: cardFont }));
    return pressTestSvg({ tile, card, fontCss: cardFont + tileFont });
  }, [cardFont, tileFont]);
  const detail = useSvgUrl(svg);
  const missing = cardFont === '' || tileFont === '';

  const page: Printable = { name: 'a4', svg: () => svg };
  const busy = !svg || missing || progress !== null;

  return (
    <div className="lab">
      <LabHeader page="proof" />
      <div className="lab-page">
        <SheetPreview src={detail} alt="Press test" w={PAGE.w} h={PAGE.h} />
        <div className="lab-side">
          <p className="lab-note">
            Print it at 100 % (no fit to page) on the press and stock of the real run, from the same file the pieces will go as: the CMYK
            PDF for a service that wants CMYK, the PNG for one that converts RGB itself. Check that the ramp steps stay apart, the wells and
            nebula show, the text is clean and the colours tell apart.
          </p>
          <div className="lab-controls">
            <button className="btn btn-primary" disabled={busy} onClick={() => run((p) => exportCmykPdf(PAGE, page, deep, p))}>
              <Space of="cmyk" /> PDF · {PRESS.condition}
            </button>
            <button className="btn" disabled={busy} onClick={() => run(() => exportPng(PAGE, page, false))}>
              <Space of="rgb" /> PNG
            </button>
            <DeepBlack deep={deep} onDeep={setDeep} />
          </div>
          <p className="lab-note">A4, 210 × 297 mm, at {PAGE.dpi} dpi.</p>
          {deep && <p className="lab-note">{DEEP_NOTE} The PNG is unchanged: the deep black is in the CMYK only.</p>}
          {missing && <p className="lab-note">The fonts didn’t load (offline?), so the export is off.</p>}
          <ExportStatus progress={progress} error={error} />
        </div>
      </div>
    </div>
  );
}
