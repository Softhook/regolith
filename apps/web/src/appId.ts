/**
 * Which app this is, for what it keeps in the browser: every localStorage key and the IndexedDB name start
 * with APP_ID. Apps served from one origin (softhook.github.io/cubic and /regolith) share their storage, so
 * each needs its own; a fork changes it here and nowhere else (docs/regolith/SPLIT.md).
 */
export const APP_ID = 'regolith';

/**
 * The game's name, where the app names itself to players: the lobby's title, the share sheet, and every file
 * it saves (`regolith-manual.html`, `regolith-tiles.zip`). A fork changes it here (docs/regolith/SPLIT.md).
 */
export const GAME_NAME = 'Regolith';

/** A saved file's name: `gameFile('manual.html')` is `regolith-manual.html`. */
export const gameFile = (rest: string) => `${GAME_NAME.toLowerCase()}-${rest}`;

/** A localStorage key in this app's namespace: `appKey('mode')` is `regolith.mode`. */
export const appKey = (name: string) => `${APP_ID}.${name}`;
