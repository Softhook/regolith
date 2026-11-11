/** Beats: the board's animations that sounds keep time with take their timings from beats.ts, not numbers of their own. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beatVars, CSS_BEATS } from '../src/beats';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const groups = Object.keys(CSS_BEATS).join('|');
/** The custom properties of the beats' groups the CSS reads. */
const read = new Set([...css.matchAll(new RegExp(`var\\((--(?:${groups})-[a-z]+)`, 'g'))].map((m) => m[1]));

describe('beats', () => {
  it('has every beat the CSS reads', () => {
    for (const name of read) expect(beatVars, name).toHaveProperty([name]);
  });

  it('sets only beats the CSS reads', () => {
    for (const name of Object.keys(beatVars)) expect(read, name).toContain(name);
  });
});
