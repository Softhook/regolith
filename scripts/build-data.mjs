// Converts the canonical YAML data in /data into JSON the engine can import.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';

const root = new URL('..', import.meta.url);
const out = new URL('packages/engine/src/data/', root);
mkdirSync(out, { recursive: true });

// Regolith's decks. `from` names the Community Edition card each started as and `status` how far it has
// moved since (data/regolith.yaml): notes of where a card came from, which the game doesn't read.
const STATUSES = ['community', 'renamed', 'reworked', 'new'];
const cards = parse(readFileSync(new URL('data/regolith.yaml', root), 'utf8'));
const ids = new Set();
for (const [deck, list] of Object.entries(cards)) {
  for (const c of list) {
    const where = `data/regolith.yaml: ${deck} card ${c.id}`;
    if (!c.id.startsWith('r-')) throw new Error(`${where}: ids start with r-`);
    if (ids.has(c.id)) throw new Error(`${where} is listed twice`);
    ids.add(c.id);
    for (const field of ['name', 'subtitle', 'text', 'category', 'count', 'status', 'effect'])
      if (c[field] === undefined) throw new Error(`${where} has no ${field}`);
    if (!STATUSES.includes(c.status)) throw new Error(`${where} has status ${c.status}, not one of ${STATUSES.join(', ')}`);
    if ((c.status === 'new') !== (c.from === undefined)) throw new Error(`${where}: a new card has no \`from\`, and only a new card`);
  }
}
writeFileSync(new URL('packages/engine/src/data/cards.json', root), JSON.stringify(cards, null, 2) + '\n');

const { maps } = parse(readFileSync(new URL('data/maps.yaml', root), 'utf8'));
for (const m of maps) {
  if (!['short', 'medium', 'long'].includes(m.length))
    throw new Error(`data/maps.yaml: ${m.id} has length ${m.length}: every map has one, short, medium or long`);
  if (!['phobos', 'deimos', 'mars'].includes(m.world))
    throw new Error(`data/maps.yaml: ${m.id} has world ${m.world}: every map has one, Phobos, Deimos or Mars`);
}
const parsed = maps.map((m) => ({
  id: m.id,
  name: m.name,
  players: m.players,
  group: m.group,
  cubes: m.cubes,
  stats: m.stats,
  world: m.world,
  length: m.length,
  layout: m.layout.map((row) => row.trim().split(/\s+/)),
  ...(m.start && { start: m.start }),
}));
writeFileSync(new URL('maps.json', out), JSON.stringify(parsed, null, 2) + '\n');

console.log(`data: ${cards.skills.length} skills, ${cards.tactics.length} tactics, ${parsed.length} maps`);
