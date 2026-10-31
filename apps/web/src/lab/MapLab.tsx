import { useState } from 'react';
import { MAPS } from '@regolith/engine';
import { cardFontCss } from '../art/cards';
import { useFontCss, useSvgUrl } from './hooks';
import { PIECES } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabPage } from './LabPage';
import { SheetPreview } from './SheetPreview';
import { MAP_SHEETS, printableMap } from './pressSheets';

/**
 * Art Lab, maps page (#lab/maps): each map's setup sheet, a landscape board showing which tile goes where, for
 * setting the map up at a table. Exports for print: the sheet, every map's (ZIP, print sheets two to a page),
 * and their CMYK press sheets.
 */
export function MapLab() {
  const [id, setId] = useState(MAPS[0].id);
  const [bleed, setBleed] = useState(false);
  const fonts = useFontCss(cardFontCss);

  const map = MAPS.find((m) => m.id === id) ?? MAPS[0];
  const sheet = printableMap(map, fonts ?? '');
  const detail = useSvgUrl(fonts === null ? '' : sheet.svg(bleed));
  const all = () => MAPS.map((m) => printableMap(m, fonts ?? ''));

  return (
    <LabPage page="maps" main={<SheetPreview src={detail} alt={`${map.name} setup`} w={PIECES.map.w} h={PIECES.map.h} />}>
      <div className="lab-controls">
        <label>
          Map
          <select data-lab-nav value={id} onChange={(e) => setId(e.target.value)}>
            {MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}, {m.players} players
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="lab-note">One sheet per map · 180 × 120 mm · which tile goes where, starting objectives in amber</p>
      <PrintPanel
        piece={PIECES.map}
        item={sheet}
        bleed={bleed}
        onBleed={setBleed}
        set={all()}
        sheets={() => all().map((front) => ({ front }))}
        cmyk={MAP_SHEETS}
        fonts={fonts}
      />
    </LabPage>
  );
}
