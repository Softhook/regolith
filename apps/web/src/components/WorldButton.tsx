import { setGroundMaps, useGroundMaps } from '../art/mapLook';
import { Switch } from './SoundButton';
import { WORLD_NAMES } from '@regolith/art';
import type { World } from '@regolith/engine';

/** The top bar's switch, on a hex map, between its world's tiles (Phobos's, Deimos's or Mars's) and the original space ones. */
export function WorldButton({ world }: { world: World }) {
  const on = useGroundMaps();
  const tiles = `${WORLD_NAMES[world]} tiles`;
  return (
    <Switch which="world" label={on ? 'Show the original space tiles' : `Show the ${tiles}`} on={on} onToggle={() => setGroundMaps(!on)}>
      <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" />
    </Switch>
  );
}
