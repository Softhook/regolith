import { useState } from 'react';
import { cardFontCss } from '../art/cards';
import { useFontCss, useSvgUrl } from './hooks';
import { PIECES } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabPage } from './LabPage';
import { SheetPreview } from './SheetPreview';
import { AID_COPIES, AID_SHEETS, printableAid } from './pressSheets';

/**
 * Art Lab, player aid page (#lab/aid): the A6 board every player gets, with the dominance and research
 * die pads, the turn, and what each mech can do. Exports for print: the board, print sheets (two to a
 * page), and its CMYK press sheets.
 */
export function AidLab() {
  const [bleed, setBleed] = useState(true);
  const fonts = useFontCss(cardFontCss);

  const board = printableAid(fonts ?? '');
  const detail = useSvgUrl(fonts === null ? '' : board.svg(bleed));

  return (
    <LabPage page="aid" main={<SheetPreview src={detail} alt="Player aid" w={PIECES.aid.w} h={PIECES.aid.h} />}>
      <p className="lab-note">One board per player · A6 landscape, 148 × 105 mm · pads for the 19 mm power and research dice</p>
      <PrintPanel
        piece={PIECES.aid}
        item={board}
        bleed={bleed}
        onBleed={setBleed}
        set={[board]}
        notes={`The same board for every player: print one each (${AID_COPIES} for a full table).\n`}
        sheets={(copies) => Array(copies ? AID_COPIES : 1).fill({ front: board })}
        cmyk={AID_SHEETS}
        copies
        fonts={fonts}
      />
    </LabPage>
  );
}
