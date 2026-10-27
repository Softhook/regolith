/**
 * Builds the Regolith Card Picks page (docs/regolith/REGOLITH.md §3): every card in data/regolith.yaml, its name,
 * subtitle and rules text as they are now beside the rewrites in docs/regolith/card-text-ideas.yaml. The page
 * carries the card renderer, so it draws each card as printed today and as picked. It is published as an
 * Artifact, where picks are saved.
 *   npm run regolith:picks -- [out=test-results/regolith-card-picks.html]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { parse } from 'yaml';
import type { CardDeck } from '../packages/art/src';

interface Card {
  id: string;
  name: string;
  subtitle: string;
  text: string;
  category: string;
  count: number;
  from?: string;
  art: { title: string; brief: string };
}
interface Ideas {
  subtitle: string;
  text: string;
  names?: { name: string; why: string }[];
}

const [out = 'test-results/regolith-card-picks.html'] = process.argv.slice(2);
const root = new URL('..', import.meta.url);
const read = (path: string) => parse(readFileSync(new URL(path, root), 'utf8'));
const regolith: Record<string, Card[]> = read('data/regolith.yaml');
const ideas: Record<string, Record<string, Ideas>> = read('docs/regolith/card-text-ideas.yaml');

const DECKS: { key: string; deck: CardDeck; name: string; word: string }[] = [
  { key: 'skills', deck: 'skill', name: 'Skills', word: 'Skill' },
  { key: 'tactics', deck: 'tactic', name: 'Tactics', word: 'Tactic' },
  { key: 'expansion', deck: 'expansion', name: 'Expansion', word: 'Expansion' },
];

const cards = DECKS.flatMap((d) =>
  regolith[d.key].map((c, i) => {
    const idea = ideas[d.key]?.[c.id];
    if (!idea?.subtitle || !idea.text) throw new Error(`card-text-ideas.yaml: ${c.id} needs a subtitle and a text`);
    const deckSize = regolith[d.key].length;
    // Printed as the game prints it, with the `from` card's picture until its own art is drawn.
    const face = {
      id: c.id,
      name: c.name,
      subtitle: c.subtitle,
      text: c.text,
      category: c.category,
      deck: d.deck,
      copies: c.count,
      index: i + 1,
      deckSize,
    };
    return {
      id: c.id,
      deck: d.name,
      deckWord: d.word,
      category: c.category,
      index: i + 1,
      deckSize,
      copies: c.count,
      groups: [
        {
          field: 'name',
          title: 'Name',
          options: [
            { key: 'now', value: c.name, why: 'The name today' },
            ...(idea.names ?? []).map((n, k) => ({ key: 'abc'[k], value: n.name, why: n.why })),
          ],
        },
        {
          field: 'subtitle',
          title: 'Subtitle',
          options: [
            { key: 'now', value: c.subtitle, why: 'The subtitle today' },
            { key: 'new', value: idea.subtitle, why: 'Suggested' },
          ],
        },
        {
          field: 'text',
          title: 'Rules text',
          options: [
            { key: 'now', value: c.text, why: 'The text today' },
            { key: 'new', value: idea.text, why: 'Suggested' },
          ],
        },
      ],
      face,
    };
  }),
);
const extra = Object.values(ideas)
  .flatMap((deck) => Object.keys(deck))
  .filter((id) => !cards.some((c) => c.id === id));
if (extra.length) throw new Error(`card-text-ideas.yaml: no such card in data/regolith.yaml: ${extra.join(', ')}`);

// The card renderer, bundled for the page as `Art.cardSvg`.
const bundle = await build({
  stdin: { contents: "export { cardSvg } from './packages/art/src';", resolveDir: new URL('.', root).pathname, loader: 'ts' },
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'Art',
  write: false,
});
const art = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const template = readFileSync(new URL('scripts/regolith-card-picks.html', root), 'utf8');
const html = template.replace('/*ART*/', () => art).replace('/*DATA*/', () => JSON.stringify(cards).replace(/<\//g, '<\\/'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${cards.length} cards, ${(html.length / 1e6).toFixed(1)} MB`);
