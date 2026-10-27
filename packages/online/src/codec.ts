import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { finalizeEvent, verifyEvent, type Event as NostrEvent } from 'nostr-tools/pure';
import type { Body, Post } from './protocol';

/**
 * Posts travel as Nostr events through public relays (MULTIPLAYER.md). Their content is encrypted
 * with a key derived from the game's secret, which only the invite link holds (in its #fragment,
 * which browsers never send to a server). Relays see an opaque blob, a random-looking game tag
 * to file it under, and the poster's public key.
 *
 * The hashing and encryption are plain JavaScript (noble), not the browser's crypto.subtle, which
 * exists only on https and localhost: a dev server opened from a phone by its network address
 * must work too.
 */

/**
 * A regular kind (1000–9999: relays keep every event), unassigned in the NIPs, so other Nostr apps
 * ignore it. Not a replaceable kind (30000+), where events with the same author and `d` replace
 * each other.
 */
export const KIND = 4747;

export type { NostrEvent };

export interface GameKeys {
  secret: string;
  /** What relays file the game's events under (`#t`); reveals nothing about the secret. */
  tag: string;
  /** AES-256-GCM key. */
  key: Uint8Array;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  // Padded back: older WebKit's atob refuses base64 without it.
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A new game secret: 128 random bits, URL-safe. */
export function newSecret(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Whose games these are: a game's relay tag and key are derived under it, so another app on the same relays
 * (another game built from this code) never sees this one's games, even from the same invite secret.
 */
const NAMESPACE = 'regolith';

const derive = (label: string, secret: string) => sha256(enc.encode(`${NAMESPACE}:${label}:${secret}`));

export function gameKeys(secret: string): GameKeys {
  return { secret, tag: hex(derive('tag', secret)).slice(0, 32), key: derive('key', secret) };
}

/** What is encrypted: everything about the post but its id and author, which the event carries. */
interface Sealed {
  prev: string | null;
  at: number;
  body: Body;
}

/** Signs and encrypts a post. `sk` is this browser's Nostr secret key. */
export function encodePost(
  keys: GameKeys,
  sk: Uint8Array,
  body: Body,
  prev: string | null,
  at = Date.now(),
): { event: NostrEvent; post: Post } {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify({ prev, at, body } satisfies Sealed));
  const cipher = gcm(keys.key, iv).encrypt(plain);
  const blob = new Uint8Array(iv.length + cipher.length);
  blob.set(iv);
  blob.set(cipher, iv.length);
  const event = finalizeEvent(
    {
      kind: KIND,
      created_at: Math.floor(at / 1000),
      tags: [['t', keys.tag]],
      content: b64url(blob),
    },
    sk,
  );
  return { event, post: { id: event.id, author: event.pubkey, prev, at, body } };
}

/**
 * Checks the signature and decrypts; null for anything that isn't a post of this game.
 * `trusted` skips the signature check, for events this browser checked when it first got them.
 */
export function decodeEvent(keys: GameKeys, event: NostrEvent, trusted = false): Post | null {
  try {
    if (event.kind !== KIND || !event.tags.some((t) => t[0] === 't' && t[1] === keys.tag)) return null;
    if (!trusted && !verifyEvent(event)) return null;
    const blob = fromB64url(event.content);
    const plain = gcm(keys.key, blob.slice(0, 12)).decrypt(blob.slice(12));
    const s = JSON.parse(dec.decode(plain)) as Sealed;
    return { id: event.id, author: event.pubkey, prev: s.prev ?? null, at: Number(s.at), body: s.body };
  } catch {
    return null;
  }
}
