/**
 * An iPhone or iPad. iPadOS Safari calls itself a Mac, so a "Mac" with a touch screen counts too.
 * Every browser there is Safari underneath, with its own quirks (full screen, 3D layers).
 */
export const APPLE_TOUCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** Opened from the Home Screen (iOS sets `navigator.standalone`) rather than in the browser. */
export const FROM_HOME_SCREEN =
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
