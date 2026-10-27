import { useState } from 'react';
import { MAPS } from '@regolith/engine';
import { cardFontCss, useFontCss, useSvgUrl } from './cards';
import { PIECES } from '../print/pieces';
import { PrintPanel } from '../print/PrintPanel';
import { LabHeader } from './LabHeader';
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
    <div className="lab">
      <LabHeader page="maps">
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
      </LabHeader>
      <div className="lab-aid-page">
        {detail ? <img className="lab-aid" src={detail} alt={`${map.name} setup`} /> : <span className="lab-aid lab-aid-ph" />}
        <div className="lab-aid-side">
          <p className="lab-note">One sheet per map · 180 × 120 mm · which tile goes where, starting objectives in amber</p>
          <PrintPanel
            piece={PIECES.map}
            item={sheet}
            bleed={bleed}
            onBleed={setBleed}
            set={all()}
            sheets={() => all().map((front) => ({ front }))}
            cmyk={MAP_SHEETS}
            ready={fonts !== null}
            fontsMissing={fonts === ''}
          />
        </div>
      </div>
    </div>
  );
}
