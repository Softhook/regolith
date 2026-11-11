import {
  cardName,
  canProfiteer,
  claimCheck,
  dropTargets,
  die,
  homeObjective,
  perimeterBlockers,
  mechOf,
  type GameState,
} from '@regolith/engine';
import type { Sel } from './controller';

/** The carrying mech's name in this game's rules, as a common noun: "flagship", or "behemoth" in Regolith. */
const carrier = (game: GameState, id: string) => mechOf(game, die(game, id).value).name.toLowerCase();

/** One-line guidance for the current human decision. */
export function hintFor(game: GameState, sel: Sel): string {
  const head = game.pending[0];
  if (head) {
    switch (head.kind) {
      case 'placeStart':
        return 'Choose a glowing starting objective for your first cube.';
      case 'placeMechs':
        return 'Place your mechs on the perimeter of your starting objective: pick a mech in your salvage yard (or take the next one), then a glowing space.';
      case 'infamy':
        return 'Take Over! Seize any objective that does not have your cube yet.';
      case 'takeCard':
        return `Take ${head.count} card${head.count > 1 ? 's' : ''} from the market below${canProfiteer(game) ? `, or take an atomic instead of a card earned by claiming (${cardName('profiteering')})` : ''}.`;
      case 'patientTactic':
        return `${cardName('patient')}: you may take a face-up tactic from the market below and store it.`;
      case 'placeExpansion':
        return 'Place your new mech on the perimeter of one of your objectives, or send it to your salvage yard.';
      case 'showOfForce':
        return `${cardName('show-of-force')}: choose any mech on the map to destroy.`;
      case 'iceTunnel':
        return `Place Ice Tunnel ${head.placed.length + 1} of 2 on an empty space.`;
      case 'placeBarrier':
        return `Place Barrier ${head.placed.length + 1} of 2 on an empty space.`;
      case 'kineticShunt':
        return sel.kind === 'kineticShunt' || sel.kind === 'shuntBarrier'
          ? 'Kinetic Shunt: choose an empty space in a straight line to push it to.'
          : 'Kinetic Shunt: choose any mech or barrier on the map to push.';
      case 'unveil':
        return `${cardName('unveil-the-fleet')}: re-roll and drop mechs from your salvage yard, then press Done.`;
      case 'discardSkill':
        return 'Choose a card to discard.';
      case 'advance':
        return `Victory! Advance your ${mechOf(game, die(game, head.die).value).name} into the destroyed mech’s space, or hold your position.`;
      default:
        return '';
    }
  }
  switch (sel.kind) {
    case 'mech':
      return 'Click a highlighted space to move, or a red target to attack.';
    case 'attackFrom':
      return 'Choose a way to attack along, or click the target again for the solid one.';
    case 'salvage': {
      // Contested drop: say which of your objectives an enemy mech on the perimeter keeps you from.
      const me = game.turn.player;
      const home = homeObjective(game, me);
      const barred = game.board.objectives
        .filter((p) => p !== home && p.cubes.includes(me) && perimeterBlockers(game, me, p).length)
        .map((p) => `objective ${p.number}`);
      if (!barred.length) return 'Click a highlighted perimeter space to drop this mech.';
      const why = `enemy mechs on the perimeter of ${barred.join(' and ')} keep you from dropping there`;
      return dropTargets(game, me).length ? `Click a highlighted perimeter space to drop this mech (${why}).` : `Nowhere to drop: ${why}.`;
    }
    case 'swap':
      return 'Choose another of your mechs to switch places with.';
    case 'freeAttack':
      return 'Choose an adjacent enemy to attack for free.';
    case 'ability': {
      const { ability } = mechOf(game, die(game, sel.die).value);
      return ability.hint ?? `${ability.name}: ${ability.text}`;
    }
    case 'tactical':
      return `${cardName('tactical')}: move one space, or attack an adjacent enemy.`;
    case 'carryPassenger':
      return `Choose a mech next to your ${carrier(game, sel.die)} to carry.`;
    case 'carryDest':
      return sel.tactical
        ? `${cardName('tactical')}: choose the space the ${carrier(game, sel.die)} moves to.`
        : `Choose where the ${carrier(game, sel.die)} flies (its own space means out and back).`;
    case 'carrySetDown':
      return 'Choose where to set the passenger down.';
  }
  // Contested perimeter: say why an objective whose perimeter makes the sum can't be claimed.
  const blocked = game.board.objectives.filter((p) => claimCheck(game, game.turn.player, p.id).blocked).map((p) => `objective ${p.number}`);
  if (blocked.length)
    return `Select a mech. Your perimeter makes the sum for ${blocked.join(' and ')}, but enemy mechs on the perimeter block the claim: destroy them first.`;
  return 'Select a mech';
}
