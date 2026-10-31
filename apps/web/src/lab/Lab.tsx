import { useEffect, useState, type ComponentType } from 'react';
import { AidLab } from './AidLab';
import { CardLab } from './CardLab';
import { labPageOf, type LabPageId } from './LabHeader';
import { ManualLab } from './ManualLab';
import { MapLab } from './MapLab';
import { ProofLab } from './ProofLab';
import { TileLab } from './TileLab';
import { useLabArrowNav } from './labNav';

const PAGES: Record<LabPageId, ComponentType> = {
  tiles: TileLab,
  cards: CardLab,
  aid: AidLab,
  maps: MapLab,
  proof: ProofLab,
  manual: ManualLab,
};

/**
 * Art Lab (open with #lab): print artwork for the tiles (#lab), cards (#lab/cards), the player aid (#lab/aid),
 * the maps' setup sheets (#lab/maps), the press test (#lab/proof) and the manual (#lab/manual). See
 * docs/GRAPHICS.md.
 */
export function Lab() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useLabArrowNav();
  const Page = PAGES[labPageOf(hash)];
  return <Page />;
}
