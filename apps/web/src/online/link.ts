import { isSecret } from '@regolith/online';

/** The secret of the online game the URL opens (#online/<secret>), if any. */
export function onlineSecret(): string | null {
  const m = location.hash.match(/^#online\/([^/?&]+)/);
  return m && isSecret(m[1]) ? m[1] : null;
}
