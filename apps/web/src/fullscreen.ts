import { COARSE } from './game/useMediaQuery';
import { APPLE_TOUCH, FROM_HOME_SCREEN } from './platform';

/**
 * Full screen for the page. Phones play full screen (the address bar and system bars take a lot of a small
 * screen), and so does the app installed on a computer, which otherwise opens in a window (computers ignore the
 * manifest's full screen). Browsers only allow asking from a click or key, so there it is *wanted* from the
 * start, and the next click or key whenever it's wanted and gone takes it there. Leaving it with the button
 * stops that until the button asks again. So does leaving it any other way on a computer (a held Esc, F11, the
 * window's own button), but not a phone dropping it on its own (the screen locking, another app, the back
 * gesture). A computer's browser tab goes full screen only with the button.
 * Esc is the game's (closing dialogs, leaving review), so where browsers allow, full screen keeps it and is
 * left by holding Esc instead. Not on an iPad: Safari's full screen there misbehaves, and the iPhone has none.
 */

// Safari still only ships the webkit-prefixed API; Keyboard Lock is Chrome and Edge only.
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type KeyboardLock = { lock(codes: string[]): Promise<void>; unlock(): void };

const doc = document as FsDocument;
const root = document.documentElement as FsElement;
const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/** Opened full screen already, from the manifest (the app installed on Android). */
const OPENS_FULLSCREEN = matchMedia('(display-mode: fullscreen)').matches;
/** Whether this page can go full screen; not where it opens full screen already. */
export const FULLSCREEN_SUPPORTED = !!(root.requestFullscreen || root.webkitRequestFullscreen) && !OPENS_FULLSCREEN && !APPLE_TOUCH;
export const isFullscreen = () => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
const phone = () => FULLSCREEN_SUPPORTED && matchMedia(COARSE).matches;
const computerApp = () => FULLSCREEN_SUPPORTED && FROM_HOME_SCREEN && !matchMedia(COARSE).matches;

let wanted = phone() || computerApp();

/**
 * After full screen is granted, the window settles: it grows (on a Mac, as it slides into a space of its own) and
 * then keeps its size. How long to wait for it to start, how long it must then keep its size, and the longest wait.
 */
const START_MS = 400;
const QUIET_MS = 150;
const SETTLE_MAX_MS = 2000;
const settled = () =>
  new Promise<void>((done) => {
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(cap);
      removeEventListener('resize', wait);
      done();
    };
    const wait = () => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, QUIET_MS);
    };
    let quiet = setTimeout(finish, START_MS);
    const cap = setTimeout(finish, SETTLE_MAX_MS);
    addEventListener('resize', wait);
  });

/** A request on its way, so one click's events don't each ask; it ends once the window has settled. */
let pending: Promise<void> | null = null;
function enter(): Promise<void> {
  wanted = true;
  pending ??= Promise.resolve((root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root, { navigationUI: 'hide' }))
    .then(settled, () => undefined)
    .finally(() => (pending = null));
  return pending;
}

function leave() {
  wanted = false;
  (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
}

export function toggleFullscreen() {
  if (isFullscreen()) leave();
  else void enter();
}

function changed() {
  if (isFullscreen()) {
    keyboard?.lock(['Escape']).catch(() => undefined);
    return;
  }
  keyboard?.unlock();
  // A phone drops full screen on its own; on a computer, it's the player leaving it.
  if (!phone()) wanted = false;
}
document.addEventListener('fullscreenchange', changed);
document.addEventListener('webkitfullscreenchange', changed);

/**
 * Clicks and keys to go full screen from: not Esc, a function key (F11 is the browser's own full screen) or a
 * shortcut, nor a click other than the main one (a right click opens a menu).
 */
function fromPlayer(e: Event): boolean {
  if (e instanceof KeyboardEvent) return e.key !== 'Escape' && !/^F\d+$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;
  if (e instanceof MouseEvent) return e.button === 0;
  return true;
}

/**
 * Full screen where it's wanted and not on, from a click or key (or without one, right after something that may
 * have dropped it while a tap still counts). Returns the window settling at its new size, or null when it isn't
 * going.
 */
export function resumeFullscreen(e?: Event): Promise<void> | null {
  if (e && !fromPlayer(e)) return null;
  if (!wanted || isFullscreen() || document.visibilityState !== 'visible') return pending;
  return enter();
}

const resumeFrom = (e: Event) => {
  // The full screen button's own tap is the player's choice; asking here too would race its toggle.
  if (e.target instanceof Element && e.target.closest('[data-fullscreen-toggle]')) return;
  void resumeFullscreen(e);
};
for (const type of ['pointerup', 'click', 'keydown'] as const) document.addEventListener(type, resumeFrom, { capture: true });
// Coming back to the page: a phone may still count the tap that left it.
document.addEventListener('visibilitychange', () => phone() && resumeFullscreen());
