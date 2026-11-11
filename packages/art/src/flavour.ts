import type { Rng } from './rng';
import type { ObjectiveType } from './tokens';

/**
 * Made-up survey data printed small beside each objective, like a label in a star atlas. Pure flavour:
 * nothing in the game reads it. Plain ASCII apart from "·", so any font can set it.
 */
export interface ObjectiveFlavour {
  /** A given name, e.g. "Thalassa Prime" (the tile prints it in capitals). */
  name: string;
  /** Catalogue number, e.g. "GJ 1132 c". */
  designation: string;
  /** Class and orbit, e.g. "CLASS M OCEANIC · 1.02 AU". */
  cls: string;
  /** A few measurements, e.g. "0.92 ME · 288 K · H2O 71%". */
  data: string;
}

const START = [
  'Ka',
  'Ve',
  'Tha',
  'Or',
  'Ny',
  'Hal',
  'Mer',
  'Se',
  'Au',
  'Te',
  'Ca',
  'Ix',
  'Zo',
  'El',
  'Ry',
  'Vo',
  'Sol',
  'Ar',
  'Ely',
  'Que',
  'Dra',
  'Pho',
  'Ker',
  'Lu',
];
const MIDDLE = ['', '', 'la', 'ri', 'the', 'no', 'va', 'lo', 'dra', 'si', 'ne', 'ro', 'ca', 'phe'];
const END = ['ssa', 'x', 'on', 'is', 'ar', 'ia', 'os', 'um', 'eth', 'yn', 'ara', 'or', 'ion', 'ae', 'ix'];
const SUFFIX = ['', '', '', '', ' Prime', ' II', ' III', ' IV', ' VI', ' Minor', ' Major'];
const CATALOGUE = ['KOI', 'GJ', 'HD', 'TOI', 'LHS', 'KIC', 'WASP', 'HIP', 'Kepler', 'TRAPPIST', 'Ross', 'Wolf'];

/** Class and the measurements that suit each kind of world. Masses in Earth (ME) or Jupiter (MJ) masses. */
function profile(type: ObjectiveType, number: number, r: Rng): { cls: string; data: string } {
  const f = (min: number, max: number, digits = 2) => r.range(min, max).toFixed(digits);
  const k = (min: number, max: number) => `${Math.round(r.range(min, max))} K`;
  switch (type) {
    case 'ocean':
      return { cls: 'CLASS M OCEANIC', data: `${f(0.6, 1.6)} ME · ${k(262, 305)} · H2O ${Math.round(r.range(55, 82))}%` };
    case 'ice':
      return { cls: 'CLASS P CRYOGENIC', data: `${f(0.2, 0.9)} ME · ${k(38, 140)} · ALB ${f(0.6, 0.92)}` };
    case 'gas':
      return number === 9
        ? { cls: 'CLASS U ICE GIANT', data: `${f(9, 22, 1)} ME · ${k(48, 90)} · H2 HE CH4` }
        : { cls: 'CLASS J GAS GIANT', data: `${f(0.4, 3.2)} MJ · ${k(105, 170)} · H2 HE` };
    case 'lava':
      return { cls: 'CLASS Y MOLTEN', data: `${f(0.8, 3.5)} ME · ${k(1250, 2300)} · SO2` };
    case 'rocky':
      return { cls: 'CLASS K ARID', data: `${f(0.3, 1.2)} ME · ${k(190, 320)} · CO2` };
  }
}

export function objectiveFlavour(r: Rng, type: ObjectiveType, number: number): ObjectiveFlavour {
  const name = r.pick(START) + r.pick(MIDDLE) + r.pick(END) + r.pick(SUFFIX);
  const cat = r.pick(CATALOGUE);
  const letter = 'bcdefgh'[r.int(0, 6)];
  const { cls, data } = profile(type, number, r);
  const orbit = `${r.range(0.02, 9.5).toFixed(2)} AU`;
  return { name, designation: `${cat} ${r.int(100, 9999)} ${letter}`, cls: `${cls} · ${orbit}`, data };
}
