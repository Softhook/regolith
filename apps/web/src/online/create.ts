import { encodePost, gameKeys, newSecret, PROTOCOL } from '@regolith/online';
import type { LobbyResult } from '../components/lobby/Lobby';
import { identity, keepStorage, rememberGame, saveEvents } from './storage';

/**
 * Creates an online game from the lobby's choices and returns its secret. The game exists only in
 * this browser until its screen opens and sends it to the relays.
 */
export function createOnlineGame(r: LobbyResult): string {
  const secret = newSecret();
  const keys = gameKeys(secret);
  const open = r.players.flatMap((p, i) => (i > 0 && !p.ai ? [i] : []));
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  const { event } = encodePost(
    keys,
    identity(),
    { t: 'create', protocol: PROTOCOL, config: { players: r.players, mapId: r.mapId, mode: r.mode, seed }, creator: 0, open },
    null,
  );
  saveEvents(keys.tag, [event]);
  keepStorage();
  rememberGame({ secret });
  return secret;
}

/** Set by vite.config.ts: this machine's address on the local network (dev server). */
declare const __LAN_ADDRESS__: string;

/**
 * The link friends open. On the dev server at "localhost", which means their own device to them,
 * it points at this machine's network address instead.
 */
export function inviteLink(secret: string): string {
  const url = new URL(location.href);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && __LAN_ADDRESS__) url.hostname = __LAN_ADDRESS__;
  url.hash = `#online/${secret}`;
  return url.toString();
}
