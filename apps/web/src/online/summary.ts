import { actor, MAPS, RULESETS, type PlayerId } from '@regolith/engine';
import { unclaimedSeats, type Post, type Replay } from '@regolith/online';

/** Whether `p` is a move by the player `me` for one of their own seats (not one of the AI seats they play). */
export const ownMove = (r: Replay, me: string, p: Post) => p.author === me && 'seat' in p.body && !r.seats[p.body.seat]?.ai;

/** How the game stands, for the lobby's list. */
export function summary(r: Replay, mySeats: PlayerId[]) {
  const s = r.steps.at(-1)!.state;
  const open = unclaimedSeats(r).length;
  const waitingOnMe = r.combat
    ? r.combat.waitingOn.some((id) => mySeats.includes(id) && !r.combat!.passed.includes(id))
    : mySeats.includes(actor(s));
  return {
    mode: RULESETS[r.config.mode]?.name,
    map: MAPS.find((m) => m.id === r.config.mapId)?.name,
    players: r.seats.map((x) => x.name),
    over: s.phase === 'over',
    myTurn: s.phase !== 'over' && waitingOnMe,
    status:
      s.phase === 'over'
        ? `${s.players[s.winner ?? 0].name} won`
        : open
          ? `Waiting for ${open} player${open > 1 ? 's' : ''} to join`
          : s.phase === 'setup'
            ? 'Setting up'
            : `Turn ${s.turn.number}`,
  };
}

/**
 * Whether it is the player's move, and `turn`, naming what made it so, if it has just become their
 * move: it wasn't (`was`; null when not known, as when the game has only just been opened), and
 * not through a post of their own (an undo; a claim).
 */
export function yourMoveSince(r: Replay, mySeats: PlayerId[], me: string, was: boolean | null) {
  const { myTurn } = summary(r, mySeats);
  const last = r.steps.at(-1)!.post;
  const own = !!last && ownMove(r, me, last);
  const turn = myTurn && was === false && !own ? `${r.tip}|${r.combat?.stage ?? ''}` : null;
  return { myTurn, turn };
}
