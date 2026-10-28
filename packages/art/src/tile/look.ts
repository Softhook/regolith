/** Which world a map is on, which its tiles show: grey Phobos, smooth reddish Deimos, or Mars. */
export type World = 'phobos' | 'deimos' | 'mars';

/** Each world's name, as players read it. */
export const WORLD_NAMES: Record<World, string> = { phobos: 'Phobos', deimos: 'Deimos', mars: 'Mars' };

/** What a tile's planet is on a world's ground, by its number (0 for a Void): docs/regolith/REGOLITH-WORLD.md, *Objectives*. */
export const OBJECTIVE_NAMES: Record<number, string> = {
  7: 'Habitat',
  8: 'Refinery',
  9: 'Ice Mine',
  10: 'Reactor',
  11: 'Mass Driver',
  12: 'Skyhook',
  0: 'Sinkhole',
};
