import {
  canProfiteer,
  say,
  conquerCheck,
  deployTargets,
  die,
  homePlanet,
  orbitBlockers,
  rulesOf,
  shipOf,
  type GameState,
} from '@regolith/engine';
import type { Sel } from './controller';

/** The carrying ship's name in this game's rules, as a common noun: "flagship", or "behemoth" in Regolith. */
const carrier = (game: GameState, id: string) => shipOf(game, die(game, id).value).name.toLowerCase();

/** One-line guidance for the current human decision, in the game's words. */
export const hintFor = (game: GameState, sel: Sel): string => say(game, hint(game, sel));

function hint(game: GameState, sel: Sel): string {
  const head = game.pending[0];
  if (head) {
    switch (head.kind) {
      case 'placeStart':
        return 'Choose a glowing starting planet for your first cube.';
      case 'placeShips':
        return 'Place your ships in orbit of your starting planet: pick a ship in your scrapyard (or take the next one), then a glowing space.';
      case 'infamy':
        return 'Infamy! Seize any planet that does not have your cube yet.';
      case 'takeCard':
        return `Take ${head.count} card${head.count > 1 ? 's' : ''} from the market below${canProfiteer(game) ? ', or take a missile instead of a card earned by conquering (Profiteering)' : ''}.`;
      case 'patientTactic':
        return 'Patient: you may take a face-up tactic from the market below and store it.';
      case 'placeExpansion':
        return 'Place your new ship in orbit of one of your planets, or send it to your scrapyard.';
      case 'showOfForce':
        return 'Show of Force: choose any ship on the map to destroy.';
      case 'warpGate':
        return `Place Warp Gate ${head.placed.length + 1} of 2 on an empty space.`;
      case 'placeBarrier':
        return `Place Barrier ${head.placed.length + 1} of 2 on an empty space.`;
      case 'kineticShunt':
        return sel.kind === 'kineticShunt'
          ? 'Kinetic Shunt: choose an empty space in a straight line to push the mech to.'
          : 'Kinetic Shunt: choose any mech on the map to push.';
      case 'unveil':
        return 'Unveil the Fleet: re-roll and deploy ships from your scrapyard, then press Done.';
      case 'discardSkill':
        return 'Choose a card to discard.';
      case 'advance':
        return `Victory! Advance your ${shipOf(game, die(game, head.die).value).name} into the destroyed ship’s space, or hold your position.`;
      default:
        return '';
    }
  }
  switch (sel.kind) {
    case 'ship':
      return 'Click a highlighted space to move, or a red target to attack.';
    case 'attackFrom':
      return 'Choose a way to attack along, or click the target again for the solid one.';
    case 'scrap': {
      // Contested deploy: say which of your planets an enemy ship in orbit keeps you from.
      const me = game.turn.player;
      const rules = rulesOf(game);
      const home = rules.homeShipyard ? homePlanet(game, me) : undefined;
      const barred = rules.contestedDeploy
        ? game.board.planets
            .filter((p) => p !== home && p.cubes.includes(me) && orbitBlockers(game, me, p).length)
            .map((p) => `planet ${p.number}`)
        : [];
      if (!barred.length) return 'Click a highlighted orbital space to deploy this ship.';
      const why = `enemy ships in orbit of ${barred.join(' and ')} keep you from deploying there`;
      return deployTargets(game, me).length
        ? `Click a highlighted orbital space to deploy this ship (${why}).`
        : `Nowhere to deploy: ${why}.`;
    }
    case 'swap':
      return 'Choose another of your ships to switch places with.';
    case 'freeAttack':
      return 'Choose an adjacent enemy to attack for free.';
    case 'power': {
      const { ability } = shipOf(game, die(game, sel.die).value);
      return ability.hint ?? `${ability.name}: ${ability.text}`;
    }
    case 'tactical':
      return 'Tactical: move one space, or attack an adjacent enemy.';
    case 'carryPassenger':
      return `Choose a ship next to your ${carrier(game, sel.die)} to carry.`;
    case 'carryDest':
      return sel.tactical
        ? `Tactical: choose the space the ${carrier(game, sel.die)} moves to.`
        : `Choose where the ${carrier(game, sel.die)} flies (its own space means out and back).`;
    case 'carryDrop':
      return 'Choose where to drop the passenger.';
  }
  // Contested orbit: say why a planet whose orbit makes the sum can't be conquered.
  const blocked = game.board.planets.filter((p) => conquerCheck(game, game.turn.player, p.id).blocked).map((p) => `planet ${p.number}`);
  if (blocked.length)
    return `Select a ship. Your orbit makes the sum for ${blocked.join(' and ')}, but enemy ships in orbit block the conquest: destroy them first.`;
  return 'Select a ship';
}
