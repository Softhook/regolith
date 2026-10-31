// The parts of the lobby's new-game form.

import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { AI_LEVELS, DEFAULT_AI_LEVEL } from '@regolith/ai';
import { buildBoard, drawing, parseToken, tileCentres, type MapDef, type PlayerConfig } from '@regolith/engine';
import { Segmented } from '../Segmented';
import { remember } from '../../storage';
import { pick } from '../../random';
import { AI_LEVEL_KEY, isFriendSeat } from './choices';

const MAP_LENGTHS: { id: NonNullable<MapDef['length']>; name: string }[] = [
  { id: 'short', name: 'Short games' },
  { id: 'medium', name: 'Medium games' },
  { id: 'long', name: 'Long games' },
];

const WORLD_NAMES = { phobos: 'Phobos', deimos: 'Deimos', mars: 'Mars' } as const;

/** A tile of the preview: its number, a start's ring, or nothing for a gap. */
function MiniTile({ token, style }: { token: string; style?: CSSProperties }) {
  if (token === '.') return <span className="mini-tile gap" style={style} />;
  const { number: n, start, blank } = parseToken(token);
  return (
    <span className={`mini-tile ${blank ? 'blank' : `n${n}`} ${start ? 'start' : ''}`} style={style}>
      {n === 0 ? '' : n}
    </span>
  );
}

/*
 * A hex map's tiles stand on a lattice of their own, turned from the hexes (engine board.ts): each tile's
 * neighbours are √7 spaces away, the first of them TILE_TURN below level, so a tile previews as a hex that
 * size, its sides facing its neighbours, a little smaller to leave a gap.
 */
const TILE_SPAN = Math.sqrt(7);
const TILE_TURN = Math.atan2(1, 3 * Math.sqrt(3));
const TILE_CORNER = TILE_SPAN / Math.sqrt(3);
const TILE_CLIP = `polygon(${Array.from({ length: 6 }, (_, i) => {
  const a = TILE_TURN + Math.PI / 6 + (Math.PI / 3) * i;
  return `${(50 + 46 * Math.cos(a)).toFixed(1)}% ${(50 + 46 * Math.sin(a)).toFixed(1)}%`;
}).join(', ')})`;

/** A map's preview: a hex for each tile, placed and turned as the map draws them (engine `drawing`). */
function MiniMap({ map }: { map: MapDef }) {
  const board = useMemo(() => buildBoard(map), [map]);
  const { at } = drawing(board);
  const centres = tileCentres(board);
  const tileCols = Math.max(...map.layout.map((r) => r.length));
  const tiles = map.layout.flatMap((row, r) =>
    row.flatMap((token, c) => {
      const p = centres.get(r * tileCols + c);
      return p ? [{ key: `${r},${c}`, token, x: at(p).c + 0.5, y: at(p).r + 0.5 }] : [];
    }),
  );
  const [xs, ys] = [tiles.map((t) => t.x), tiles.map((t) => t.y)];
  const [left, top] = [Math.min(...xs) - TILE_CORNER, Math.min(...ys) - TILE_CORNER];
  const [w, h] = [Math.max(...xs) + TILE_CORNER - left, Math.max(...ys) + TILE_CORNER - top];
  // Pixels per space: a tile at most 26 px across, and the map within 150.
  const px = Math.min(26 / TILE_SPAN, 150 / w, 150 / h);
  const size = 2 * TILE_CORNER * px;
  return (
    <div className="mini-map" style={{ width: w * px, height: h * px } as CSSProperties}>
      {tiles.map((t) => (
        <MiniTile
          key={t.key}
          token={t.token}
          style={{
            left: (t.x - left - TILE_CORNER) * px,
            top: (t.y - top - TILE_CORNER) * px,
            width: size,
            height: size,
            clipPath: TILE_CLIP,
          }}
        />
      ))}
    </div>
  );
}

/** A labelled row of the new-game form, with an optional line of explanation under it. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = `field-${label.toLowerCase()}`;
  return (
    <div className="field-row">
      <div className="field">
        <span id={id}>{label}</span>
        <div role="group" aria-labelledby={id}>
          {children}
        </div>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** One player seat: name, who plays it, and the AI level when an AI does. */
export function SeatRow({
  seat,
  index,
  online,
  onChange,
}: {
  seat: PlayerConfig;
  index: number;
  online: boolean;
  onChange: (patch: Partial<PlayerConfig>) => void;
}) {
  const label = `Player ${index + 1}`;
  const aiLevel = seat.aiLevel ?? DEFAULT_AI_LEVEL;
  return (
    <div className="seat" style={{ '--pc': seat.color } as CSSProperties}>
      <span className="player-swatch" />
      {isFriendSeat(seat, index, online) ? (
        <input value="" placeholder="A friend joins here" disabled aria-label={`${label}: a friend`} />
      ) : (
        <input value={seat.name} maxLength={14} onChange={(e) => onChange({ name: e.target.value })} aria-label={`${label} name`} />
      )}
      {online && index === 0 ? (
        <span className="seat-you">You</span>
      ) : (
        <Segmented
          small
          options={[
            [false, online ? 'Friend' : 'Human'],
            [true, 'AI'],
          ]}
          value={!!seat.ai}
          onPick={(ai) => onChange({ ai })}
        />
      )}
      {seat.ai && (
        <select
          className="ai-level"
          value={aiLevel}
          aria-label={`${label} AI level`}
          title={AI_LEVELS.find((l) => l.level === aiLevel)?.summary}
          onChange={(e) => {
            onChange({ aiLevel: Number(e.target.value) });
            remember(AI_LEVEL_KEY, e.target.value);
          }}
        >
          {AI_LEVELS.map((l) => (
            <option key={l.level} value={l.level}>
              {l.level} · {l.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Map dropdown grouped by how long a game runs, a random pick, and a preview of the chosen map. */
export function MapPicker({ map, choices, onChoose }: { map: MapDef; choices: MapDef[]; onChoose: (id: string) => void }) {
  const chooseRandom = () => {
    const others = choices.filter((m) => m.id !== map.id);
    if (others.length) onChoose(pick(others).id);
  };
  return (
    <div className="map-preview">
      <div className="map-info">
        <small>Map</small>
        <div className="map-select">
          <select value={map.id} aria-label="Map" onChange={(e) => onChoose(e.target.value)}>
            {MAP_LENGTHS.map((g) => {
              const maps = choices.filter((m) => m.length === g.id);
              return (
                maps.length > 0 && (
                  <optgroup key={g.id} label={g.name}>
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({WORLD_NAMES[m.world ?? 'mars']})
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </select>
          <button className="btn btn-icon" title="Random map" aria-label="Random map" disabled={choices.length < 2} onClick={chooseRandom}>
            ⚄
          </button>
        </div>
        <span className="muted">
          {map.cubes} cubes each ·{' '}
          {map.stats.shared === null ? 'too few spaces for every cube' : `${map.stats.shared}/${map.stats.planets} objectives shared`}
          {map.layout.flat().includes('0') && ' · Alien Artefacts'}
        </span>
      </div>
      <MiniMap map={map} />
    </div>
  );
}
