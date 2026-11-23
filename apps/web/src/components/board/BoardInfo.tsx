import type { CSSProperties } from 'react';
import { die, dieAt, drawing, mechOf, perimeterSpaces, type GameState } from '@regolith/engine';
import { objectiveNames } from '../../art/boardTiles';
import type { MechSpots } from '../../game/mechSpots';
import { InfoPop, useAnchorName } from '../InfoPop';
import { spotBox } from './geometry';

/** A mech or objective whose info is showing, after a tap that had nothing else to do. */
export type Inspect = { mech: string } | { objective: number };
export const inspectKey = (i: Inspect) => ('mech' in i ? `mech:${i.mech}` : `objective:${i.objective}`);

/** The info bubble for a mech or objective, anchored to its space on the map. */
export function BoardInfo({
  game,
  spots,
  what,
  cell,
  onClose,
}: {
  game: GameState;
  spots: MechSpots;
  what: Inspect;
  cell: number;
  onClose: () => void;
}) {
  const anchor = useAnchorName();
  const objective = 'objective' in what ? game.board.objectives.find((p) => p.id === what.objective) : undefined;
  const spot = 'mech' in what ? spots.get(what.mech) : objective && drawing(game.board).at(objective);
  if (!spot) return null; // the mech left the map
  return (
    <>
      <div className="info-anchor" style={{ ...spotBox(spot, cell), '--anchor': anchor } as CSSProperties} />
      <InfoPop anchor={anchor} onClose={onClose}>
        {'mech' in what ? <MechInfo game={game} id={what.mech} /> : <ObjectiveInfo game={game} id={what.objective} />}
      </InfoPop>
    </>
  );
}

/** What a mech is: whose, which, and its ability. */
function MechInfo({ game, id }: { game: GameState; id: string }) {
  const d = die(game, id);
  const { ability, name } = mechOf(game, d.value);
  const p = game.players[d.owner];
  return (
    <>
      <div className="info-title" style={{ '--pc': p.color } as CSSProperties}>
        <span className="info-swatch" /> {p.name}'s {name} <span className="muted">({d.value})</span>
      </div>
      <div>
        <b>{ability.name}:</b> {ability.text}
      </div>
      {d.owner === game.turn.player && game.turn.abilityUsed[d.id] && <div className="muted">✦ Ability used this turn.</div>}
    </>
  );
}

/** An objective's name and number, as the log shows it: "Thalassa Prime (9)". */
export function objectiveLabel(game: GameState, id: number): string {
  const p = game.board.objectives.find((x) => x.id === id)!;
  const name = objectiveNames(game.board).get(id);
  return name ? `${name} (${p.number})` : `Objective ${p.number}`;
}

/** An objective's name, its free cube spaces, whose cubes are on it, and who its perimeter blocks (contested perimeter). */
function ObjectiveInfo({ game, id }: { game: GameState; id: number }) {
  const p = game.board.objectives.find((x) => x.id === id)!;
  const free = p.capacity - p.cubes.length;
  const homeOf = game.players.find((pl) => pl.home === id);
  const holders = [...new Set(perimeterSpaces(game.board, p).flatMap((c) => dieAt(game, c)?.owner ?? []))].map((o) => game.players[o].name);
  const blocked = 'claim it or drop to it';
  return (
    <>
      <div className="info-title">{objectiveLabel(game, id)}</div>
      <div>
        {free} of {p.capacity} cube space{p.capacity > 1 ? 's' : ''} free.
      </div>
      {holders.length > 0 && (
        <div>
          {holders.length === 1
            ? `Contested perimeter: while ${holders[0]}’s mechs are on the perimeter, only ${holders[0]} can ${blocked}.`
            : holders.length === 2
              ? `Contested perimeter: ${holders.join(' and ')} both have mechs on the perimeter, so neither can ${blocked}.`
              : `Contested perimeter: ${holders.join(', ')} all have mechs on the perimeter, so none of them can ${blocked}.`}
        </div>
      )}
      {holders.length > 0 && homeOf && <div>{`Home objective: ${homeOf.name} can always drop here.`}</div>}
      {p.cubes.map((owner, i) => (
        <div key={i} className="info-title" style={{ '--pc': game.players[owner].color } as CSSProperties}>
          <span className="info-swatch" /> {game.players[owner].name}'s cube
        </div>
      ))}
    </>
  );
}
