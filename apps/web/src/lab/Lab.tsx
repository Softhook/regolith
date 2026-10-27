import { useEffect, useState } from 'react';
import { AidLab } from './AidLab';
import { CardLab } from './CardLab';
import { MapLab } from './MapLab';
import { ProofLab } from './ProofLab';
import { TileLab } from './TileLab';
import { useLabArrowNav } from './labNav';

/**
 * Art Lab (open with #lab): print artwork for tiles (#lab), cards (#lab/cards), the player aid (#lab/aid) and the maps'
 * setup sheets (#lab/maps),
 * and the press test (#lab/proof). See docs/GRAPHICS.md.
 */
export function Lab() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useLabArrowNav();
  if (hash.startsWith('#lab/cards')) return <CardLab />;
  if (hash.startsWith('#lab/aid')) return <AidLab />;
  if (hash.startsWith('#lab/maps')) return <MapLab />;
  if (hash.startsWith('#lab/proof')) return <ProofLab />;
  return <TileLab />;
}
