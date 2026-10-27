import { useState } from 'react';
import { type AidEdition } from '@regolith/art';
import { cardFontCss, useFontCss, useSvgUrl } from './cards';
import { PIECES } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabHeader } from './LabHeader';
import { TILES_AND_AIDS, printableAid } from './pressSheets';
import { Segmented } from '../components/Segmented';

/** How many boards "All copies" prints: one per player, for the largest player count. */
const PLAYERS = 4;

/**
 * Art Lab, player aid page (#lab/aid): the A6 board every player gets, with the dominance and research
 * die pads, the turn, and what each ship can do. Exports for print: the board, print sheets (two to a
 * page), and the CMYK press sheets it shares with the tiles.
 */
export function AidLab() {
  const [edition, setEdition] = useState<AidEdition>('community');
  const [bleed, setBleed] = useState(true);
  const fonts = useFontCss(cardFontCss);

  const board = printableAid(edition, fonts ?? '');
  const detail = useSvgUrl(fonts === null ? '' : board.svg(bleed));
  const part = edition === 'community' ? 'Community' : 'Classic';

  return (
    <div className="lab">
      <LabHeader page="aid">
        {/* The arrow keys switch edition (labNav). */}
        <div data-lab-nav style={{ display: 'contents' }}>
          <Segmented<AidEdition>
            small
            options={[
              ['community', 'Community'],
              ['classic', 'Classic'],
            ]}
            value={edition}
            onPick={setEdition}
          />
        </div>
      </LabHeader>
      <div className="lab-aid-page">
        {detail ? <img className="lab-aid" src={detail} alt="Player aid" /> : <span className="lab-aid lab-aid-ph" />}
        <div className="lab-aid-side">
          <p className="lab-note">
            One board per player · A6 landscape, 148 × 105 mm · pads for the 19 mm power and research dice ·{' '}
            {part === 'Classic' ? 'Classic rules (no atomics; Refit to any new value)' : 'Community Edition rules'}
          </p>
          <PrintPanel
            piece={PIECES.aid}
            item={board}
            bleed={bleed}
            onBleed={setBleed}
            set={[board]}
            part={part}
            notes={`The same board for every player: print one each (${PLAYERS} for a full table).\n`}
            sheets={(copies) => Array(copies ? PLAYERS : 1).fill({ front: board })}
            cmyk={TILES_AND_AIDS}
            copies
            ready={fonts !== null}
            fontsMissing={fonts === ''}
          />
        </div>
      </div>
    </div>
  );
}
