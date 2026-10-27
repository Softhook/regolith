/**
 * Colours the game draws from code. CSS colours live in styles.css :root. The manual (rulebook/)
 * reads both, so its pictures always match the screen.
 */

/** Default player colours, in seat order. */
export const PLAYER_COLORS = ['#3d8bff', '#d62839', '#ffb703', '#80ed99', '#b388ff'];

/** A Warp Gate's colour, on the map (board/BoardArt) and in its effects (board/CardEffects). */
export const GATE_COLOR = '#5ef0b0';

/** Pips on a ship die. */
export const PIP = '#0a0f1e';

/** The two combat dice: black for the attacker, white for the defender (shared with the card art). */
export { COMBAT_DICE } from '@regolith/art';
