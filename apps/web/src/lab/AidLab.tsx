import { useState } from 'react';
import { cardFontCss, useFontCss, useSvgUrl } from './cards';
import { PIECES } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabHeader } from './LabHeader';
import { AID_SHEETS, printableAid } from './pressSheets';

/** How many boards "All copies" prints: one per player, for the largest player count. */
const PLAYERS = 4;

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
    <div className="lab">
      <LabHeader page="aid" />
      <div className="lab-aid-page">
        {detail ? <img className="lab-aid" src={detail} alt="Player aid" /> : <span className="lab-aid lab-aid-ph" />}
        <div className="lab-aid-side">
          <p className="lab-note">One board per player · A6 landscape, 148 × 105 mm · pads for the 19 mm power and research dice</p>
          <PrintPanel
            piece={PIECES.aid}
            item={board}
            bleed={bleed}
            onBleed={setBleed}
            set={[board]}
            notes={`The same board for every player: print one each (${PLAYERS} for a full table).\n`}
            sheets={(copies) => Array(copies ? PLAYERS : 1).fill({ front: board })}
            cmyk={AID_SHEETS}
            copies
            ready={fonts !== null}
            fontsMissing={fonts === ''}
          />
        </div>
      </div>
    </div>
  );
}
