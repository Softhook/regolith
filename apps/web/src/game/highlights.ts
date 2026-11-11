import {
  claimCheck,
  die as getDie,
  grid,
  key,
  moveOptions,
  same,
  salvageYard,
  mechsByIndex,
  stopZone,
  type Cell,
  type GameState,
} from '@regolith/engine';
import type { Sel } from './controller';
import type { Legal } from './legal';

type CellTone = 'move' | 'drop' | 'tunnel' | 'setDown' | 'launch' | 'barrier';
type DieTone = 'attack' | 'swap' | 'target' | 'passenger';
type ObjectiveTone = 'claim' | 'infamy' | 'start' | 'blocked';

export interface Highlights {
  cells: Map<string, { cell: Cell; tone: CellTone }>;
  dice: Map<string, DieTone>;
  objectives: Map<number, { tone: ObjectiveTone; label: string }>;
  /** The spaces where enemy zones of control would stop the selected mech (stopZone), shown only. */
  zones: Cell[];
}

export const noHighlights = (): Highlights => ({ cells: new Map(), dice: new Map(), objectives: new Map(), zones: [] });

/**
 * What to light up on the board for a human: the targets of the legal actions that fit the current
 * decision (or, in the action phase, the selected mech). Derived from `legal`, never from rules.
 */
export function highlightsFor(game: GameState, sel: Sel, legal: Legal, actionPhase: boolean): Highlights {
  const h = noHighlights();
  const addCells = (cells: Cell[], tone: CellTone) => cells.forEach((c) => h.cells.set(key(c), { cell: c, tone }));
  const head = game.pending[0];

  if (head) {
    switch (head.kind) {
      case 'placeStart':
        for (const a of legal.of('placeStart')) h.objectives.set(a.objective, { tone: 'start', label: 'Start here' });
        break;
      case 'placeMechs': {
        const die = sel.kind === 'salvage' ? sel.die : salvageYard(game, head.player)[0]?.id;
        addCells(
          legal.of('placeMech', (a) => a.die === die).map((a) => a.to),
          'drop',
        );
        break;
      }
      case 'infamy':
        for (const a of legal.of('infamy')) h.objectives.set(a.objective, { tone: 'infamy', label: 'Seize' });
        break;
      case 'placeExpansion':
        addCells(
          legal.of('placeExpansion').flatMap((a) => (a.to ? [a.to] : [])),
          'drop',
        );
        break;
      case 'showOfForce':
        for (const a of legal.of('showOfForce')) h.dice.set(a.die, 'target');
        break;
      case 'advance':
        addCells([head.to], 'move');
        break;
      case 'iceTunnel':
        addCells(
          legal.of('iceTunnel').map((a) => a.cell),
          'tunnel',
        );
        break;
      case 'placeBarrier':
        addCells(
          legal.of('placeBarrier').map((a) => a.cell),
          'tunnel',
        );
        break;
      case 'kineticShunt':
        for (const a of legal.of('kineticShunt')) h.dice.set(a.die, 'target');
        for (const a of legal.of('shuntBarrier')) h.cells.set(key(a.from), { cell: a.from, tone: 'barrier' });
        if (sel.kind === 'shuntBarrier') {
          addCells(
            legal.of('shuntBarrier', (a) => same(a.from, sel.from)).map((a) => a.to),
            'move',
          );
        }
        if (sel.kind === 'kineticShunt') {
          addCells(
            legal.of('kineticShunt', (a) => a.die === sel.die).map((a) => a.to),
            'move',
          );
        }
        break;
      case 'unveil':
        if (sel.kind === 'salvage')
          addCells(
            legal.of('unveilDrop', (a) => a.die === sel.die).map((a) => a.to),
            'drop',
          );
        break;
    }
    return h;
  }
  if (!actionPhase) return h;

  for (const a of legal.of('claim')) h.objectives.set(a.objective, { tone: 'claim', label: 'Claim' });
  // Contested perimeter: a perimeter that makes the sum, held up only by enemy mechs in it, so the player sees why it isn't offered.
  for (const p of game.board.objectives)
    if (!h.objectives.has(p.id) && claimCheck(game, game.turn.player, p.id).blocked)
      h.objectives.set(p.id, { tone: 'blocked', label: 'Blocked' });
  // A Behemoth carry, as a regular carry or as a Tactical step.
  const transports = (die: string, tactical?: boolean) =>
    tactical
      ? legal
          .of('tactical', (a) => a.die === die && !!a.passenger)
          .map((a) => ({ passenger: a.passenger!, to: a.to!, setDown: a.setDown! }))
      : legal.of('carry', (a) => a.die === die);
  switch (sel.kind) {
    case 'mech': {
      const opts = moveOptions(game, sel.die);
      const moves = legal.of('move', (a) => a.die === sel.die);
      // The zones only while the mech may still go somewhere.
      if (moves.length || legal.can('attack', (a) => a.die === sel.die)) h.zones = zonesFor(game, sel.die, opts);
      // A space in a zone of control looks like any other move: the zone's hatching already shows it.
      for (const a of moves) h.cells.set(key(a.to), { cell: a.to, tone: 'move' });
      for (const a of legal.of('attack', (a) => a.die === sel.die)) h.dice.set(a.target, 'attack');
      break;
    }
    case 'attackFrom':
      h.zones = zonesFor(game, sel.die);
      // The chosen target, the spaces to attack it from, and the other targets, to change one's mind.
      for (const a of legal.of('attack', (a) => a.die === sel.die)) {
        if (a.target !== sel.target) h.dice.set(a.target, 'attack');
        else if (a.from) h.cells.set(key(a.from), { cell: a.from, tone: 'launch' });
      }
      h.dice.set(sel.target, 'target');
      break;
    case 'salvage':
      addCells(
        legal.of('drop', (a) => a.die === sel.die).map((a) => a.to),
        'drop',
      );
      break;
    case 'tactical': {
      for (const a of legal.of('tactical', (a) => a.die === sel.die && !a.passenger)) {
        if (a.target) h.dice.set(a.target, 'attack');
        else if (a.to) h.cells.set(key(a.to), { cell: a.to, tone: 'move' });
      }
      break;
    }
    case 'swap':
      for (const a of legal.of('swap', (a) => a.die === sel.die)) h.dice.set(a.other, 'swap');
      break;
    case 'freeAttack':
      for (const a of legal.of('freeAttack', (a) => a.die === sel.die)) h.dice.set(a.target, 'attack');
      break;
    case 'ability':
      for (const a of legal.of('ability', (a) => a.die === sel.die)) {
        if (a.target) h.dice.set(a.target, 'attack');
        else if (a.to) h.cells.set(key(a.to), { cell: a.to, tone: 'move' });
      }
      break;
    case 'carryPassenger':
      for (const t of transports(sel.die, sel.tactical)) h.dice.set(t.passenger, 'passenger');
      break;
    case 'carryDest':
      addCells(
        transports(sel.die, sel.tactical)
          .filter((t) => t.passenger === sel.passenger)
          .map((t) => t.to),
        'move',
      );
      break;
    case 'carrySetDown':
      addCells(
        transports(sel.die, sel.tactical)
          .filter((t) => t.passenger === sel.passenger && same(t.to, sel.to))
          .map((t) => t.setDown),
        'setDown',
      );
      break;
  }
  return h;
}

/**
 * The spaces of enemy zones of control that would stop this mech: those it can reach, to stop on or
 * to attack from. Not its own space, which it may always leave. None in a mode without zones.
 */
function zonesFor(game: GameState, die: string, opts = moveOptions(game, die)): Cell[] {
  const mech = getDie(game, die);
  const zone = stopZone(game, mech.owner, mechsByIndex(game));
  if (!zone || mech.loc.zone !== 'board') return [];
  const { cells, cols } = grid(game.board);
  const index = (c: Cell) => c.r * cols + c.c;
  const reach = new Set([...opts.moves.values()].map((m) => index(m.cell)));
  for (const a of opts.attacks.values()) for (const l of a.launches) reach.add(index(l.from));
  reach.delete(index(mech.loc));
  return [...reach].filter((i) => zone[i]).map((i) => cells[i]);
}
