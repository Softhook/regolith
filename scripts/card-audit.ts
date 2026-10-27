/**
 * Card audit: plays the audit's games (every card mode, AI levels, maps and player counts, with
 * every skill dealt to someone) and reports
 *
 * - anomalies: crashes, stuck games, illegal or refused actions, broken invariants, and card
 *   effects that differ from the card text (see packages/engine/test/audit.ts), each with the
 *   action and the game log leading up to it;
 * - coverage: per card, the turns it was held and the times it took effect. "never in play" and
 *   "held, never fired" point at cards the games didn't exercise, or that do nothing.
 *
 *   npm run audit:cards [-- --deep] [-- --mode community|original]
 *
 * Exits with 1 if there is any anomaly.
 */
import {
  AUDIT_GAMES,
  auditGame,
  CHECKED_EFFECTS,
  coverageGaps,
  gameName,
  modeCards,
  type AuditResult,
} from '../packages/engine/test/audit';
import { effectOf, MODES, type GameMode } from '../packages/engine/src';

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const onlyMode = args.includes('--mode') ? (args[args.indexOf('--mode') + 1] as GameMode) : undefined;
const games = AUDIT_GAMES.filter((g) => (deep || !g.deep) && (!onlyMode || g.mode === onlyMode));

const results: AuditResult[] = [];
for (const g of games) {
  const start = Date.now();
  process.stdout.write(`${gameName(g)} ... `);
  const r = auditGame(g);
  results.push(r);
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`${r.steps} steps, ${seconds}s, ${r.anomalies.length ? `${r.anomalies.length} ANOMALIES` : 'ok'}`);
  // The same anomaly often repeats; show each kind once, with its first occurrence.
  const shown = new Set<string>();
  for (const a of r.anomalies) {
    const kind = `${a.card}|${a.message.replace(/\d+/g, '#')}`;
    if (shown.has(kind)) continue;
    shown.add(kind);
    const times = r.anomalies.filter((x) => `${x.card}|${x.message.replace(/\d+/g, '#')}` === kind).length;
    console.log(`  ✗ step ${a.step}${a.card ? ` [${a.card}]` : ''}: ${a.message}${times > 1 ? ` (×${times})` : ''}`);
    for (const line of a.context) console.log(`      ${line}`);
  }
}

for (const { id: mode } of MODES.filter((m) => m.cards)) {
  const mine = results.filter((r) => r.name.startsWith(mode));
  if (!mine.length) continue;
  console.log(`\n=== ${mode}: card coverage over ${mine.length} games ===`);
  console.log('Card'.padEnd(20) + 'Held turns'.padStart(11) + 'Fired'.padStart(7) + '  Effect checked');
  for (const c of modeCards(mode)) {
    let held = 0;
    let fired = 0;
    for (const r of mine) {
      held += r.coverage.get(c.id)!.heldTurns;
      fired += r.coverage.get(c.id)!.fired;
    }
    const checked = CHECKED_EFFECTS.has(effectOf(c.id)) ? 'yes' : 'scenario test only';
    console.log(c.name.padEnd(20) + String(held).padStart(11) + String(fired).padStart(7) + `  ${checked}`);
  }
  const gaps = coverageGaps(results, mode);
  console.log(`never in play: ${gaps.neverInPlay.join(', ') || '-'}`);
  console.log(`held, never fired: ${gaps.heldNeverFired.join(', ') || '-'}`);
}

const total = results.reduce((n, r) => n + r.anomalies.length, 0);
console.log(`\n${results.length} games, ${total} anomalies.`);
process.exit(total ? 1 : 0);
