/**
 * Regolith mode (docs/regolith/PROTOTYPING.md, src/regolith): Community Edition with movement capped at 3,
 * zones of control (every ship pickets the spaces around it), a new power for the 5 (Shoot), which
 * replaces Manoeuvre, contested orbits, and over-conquest (an orbit of 12) when REGOLITH_OVER_CONQUEST is on. The first block checks that none of it reaches the official modes, and that the mode
 * folder and the engine meet only at RULESETS and the prototype kit.
 *
 * Scenarios run on Alpha Sector, the basic map for 2 players (9×9; planets at rows/cols 1, 4, 7,
 * every other cell a space), and on Alpha Sector (hex) for zones and Shoot along a hex's 6 sides.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  adjacent,
  apply,
  CLASSIC_SHIPS,
  orbitals,
  conquerCheck,
  deployTargets,
  homePlanet,
  diagonals,
  infamyTargets,
  orbitedPlanets,
  grid,
  attackLaunches,
  card,
  cardKind,
  effectOf,
  EXPANSION,
  expansionCard,
  isEmptySpace,
  legalActions,
  MODES,
  moveIndexes,
  movePath,
  moveOptions,
  mulberry32,
  planetFreeSlots,
  rulesOf,
  RULESETS,
  shipsByIndex,
  shuntTargets,
  spaces,
  stopZone,
  tryApply,
  type Action,
  type CardDef,
  type GameMode,
  type GameState,
  MAPS,
} from '../src';
import { cubeLeft } from '../src/core';
import { beginPlay, settle } from '../src/turn';
import { REGOLITH_CARDS, REGOLITH_DECKS, REGOLITH_CONTESTED_DEPLOY, REGOLITH_HOME_SHIPYARD, REGOLITH_OVER_CONQUEST } from '../src/regolith';
import { barrier as barrierPower, barrierTargets } from '../src/regolith/powers/barrier';
import { picket } from '../src/regolith/powers/picket';
import { shoot as shootPower, shootTargets } from '../src/regolith/powers/shoot';
import { allowMapGroups, arrange, quickStart } from './helpers';
import { toRow } from './audit';

// Most of these rules were first written and pinned on the square Alpha Sector, which Regolith no longer plays
// (it is hex only, docs/regolith/REGOLITH.md): this file lets it, as hex.test.ts lets Basic play the hex maps.
allowMapGroups('regolith', 'basic');

/**
 * `regolith`: the mode on the square Alpha Sector. `hex`: Regolith on Alpha Sector (hex), with axial cells
 * (docs/HEX.md): a space's sides are a row or column away, or (-1, +1) and (+1, -1).
 */
const BASE: Record<'regolith' | 'community' | 'hex', GameState> = {
  regolith: quickStart(2, 1, 'regolith', 'alpha-sector'),
  community: quickStart(2, 1, 'community'),
  hex: quickStart(2, 1, 'regolith', 'alpha-hex'),
};

/** Player 0 to act with 3 fresh actions, only the listed ships on the map, and the given skills. */
function scenario(dice: Record<string, [number, number, number]>, mode: keyof typeof BASE = 'regolith', skills: string[] = []): GameState {
  const s = structuredClone(BASE[mode]);
  for (const d of s.dice) if (d.loc.zone === 'board') d.loc = { zone: 'scrapyard' };
  for (const [id, [r, c, value]] of Object.entries(dice)) {
    const d = s.dice.find((x) => x.id === id)!;
    d.loc = { zone: 'board', r, c };
    d.value = value;
  }
  for (const p of s.players) p.skills = p.id === 0 ? skills.map((id) => ({ id, active: true })) : [];
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, seen: {}, conquests: 0, oncePerTurn: [] };
  for (const d of s.dice) s.turn.seen[d.id] = [d.value];
  return s;
}

const at = (s: GameState, id: string) => s.dice.find((d) => d.id === id)!;
const farthest = (s: GameState, id: string) => Math.max(...[...moveOptions(s, id).moves.values()].map((m) => m.steps));
const offered = (s: GameState, type: Action['type']) => legalActions(s).filter((a) => a.type === type);
/** The ships p0d0 may shoot now, by the legal actions (so cost and power included). */
const shots = (s: GameState) =>
  legalActions(s)
    .flatMap((a) => (a.type === 'power' && a.die === 'p0d0' && a.target ? [a.target] : []))
    .sort();

describe('Regolith mode', () => {
  it('is listed after the official modes and plays like Community otherwise', () => {
    expect(MODES.map((m) => m.id)).toEqual(['basic', 'original', 'community', 'regolith'] satisfies GameMode[]);
    const regolith = rulesOf(BASE.regolith);
    const community = rulesOf(BASE.community);
    expect(regolith.name).toBe('Regolith');
    // Its own decks: each card a Community card's rules (`effect`) under its own id and name, unless reworked;
    // Ingenious left out.
    if (REGOLITH_CARDS) {
      const own = regolith.cards!;
      expect(own.skills).toBe(REGOLITH_DECKS.skills);
      expect(own.tactics).toBe(REGOLITH_DECKS.tactics);
      expect(own.expansion).toBe(REGOLITH_DECKS.expansion[0]);
      const from = (c: CardDef) => card(c.from!);
      expect(own.skills.map((c) => c.from)).toEqual(community.cards!.skills.filter((c) => c.id !== 'ingenious').map((c) => c.id));
      expect(own.tactics.filter((c) => c.from).map((c) => c.from)).toEqual(community.cards!.tactics.map((c) => c.id));
      expect(own.tactics.filter((c) => !c.from).map((c) => c.id)).toEqual(['r-barricade', 'r-kinetic-shunt']);
      for (const c of [...own.skills, ...own.tactics, own.expansion!]) {
        if (c.status === 'new') {
          expect(['r-barricade', 'r-kinetic-shunt']).toContain(c.id);
          expect(c.from).toBeUndefined();
          expect(cardKind(c.id)).toBe('tactic');
          expect(c.count).toBe(2);
          expect(c.category).toBe('movement');
          if (c.id === 'r-barricade') {
            expect(effectOf(c.id)).toBe('barrier');
            expect(c.text).toBe('Place two barriers.');
          } else {
            expect(effectOf(c.id)).toBe('kinetic-shunt');
            expect(c.text).toBe('Choose any mech. Push it up to 4 spaces in a straight line.');
          }
        } else {
          expect(c.id, c.id).toBe(`r-${c.from}`);
          if (c.status !== 'reworked') expect(effectOf(c.id), c.id).toBe(effectOf(c.from!));
          expect([c.count, c.category], c.id).toEqual([from(c).count, from(c).category]);
          expect(cardKind(c.id), c.id).toBe(cardKind(c.from!));
        }
      }
      expect(expansionCard(BASE.regolith)).toBe(own.expansion);
      expect(expansionCard(BASE.community)).toBe(EXPANSION);
    } else expect(regolith.cards).toBeNull();
    expect(regolith.mapGroups).toEqual(['hex', 'open', 'drift', 'basic']); // 'basic' only in this file: see BASE
    const played = MAPS.filter((m) => ['hex', 'open', 'drift'].includes(m.group));
    for (const m of played) {
      expect(m.grid, m.id).toBe('hex');
      expect(m.world, m.id).toBeDefined();
    }
    expect(played.map((m) => m.id)).toContain('twin-drift');
    expect(regolith.startingMissiles).toBe(1);
    expect(regolith.maxMovement).toBe(3);
    expect(regolith.overConquest).toBe(REGOLITH_OVER_CONQUEST);
    expect(regolith.contestedOrbit).toBe(true);
    expect(regolith.contestedDeploy).toBe(REGOLITH_CONTESTED_DEPLOY);
    expect(regolith.homeShipyard).toBe(REGOLITH_HOME_SHIPYARD);
    expect(regolith.ships[5].hooks).toEqual({ ...shootPower.hooks, ...picket.hooks });
    expect(regolith.ships[5].power).toBeUndefined();
    expect(regolith.ships[6].hooks).toEqual({ ...barrierPower.hooks, ...picket.hooks });
    expect(regolith.ships[6].power).toBeUndefined();
    expect([1, 2, 3, 4].map((v) => regolith.ships[v].power)).toEqual([1, 2, 3, 4].map((v) => community.ships[v].power));
    expect([1, 2, 3, 4, 5, 6].map((v) => regolith.ships[v].name)).toEqual([
      'Breacher',
      'Behemoth',
      'Tactician',
      'Chameleon',
      'Sniper',
      'Wisp',
    ]);
    for (const v of [1, 2, 3, 4, 5, 6]) expect(regolith.ships[v].hooks?.stopsEnemies, `ship ${v}`).toBe(picket.hooks.stopsEnemies);
  });

  it('leaves the official modes alone: classic ships, no movement cap', () => {
    for (const mode of ['basic', 'original', 'community'] as const) {
      const rules = rulesOf(quickStart(2, 1, mode));
      expect(rules.ships, mode).toBe(CLASSIC_SHIPS);
      expect(rules.maxMovement, mode).toBeUndefined();
    }
    const s = scenario({ p0d0: [0, 0, 5], p1d0: [0, 2, 4], p1d1: [8, 8, 6] }, 'community');
    expect(offered(s, 'power')).toEqual([]);
    expect(stopZone(s, 0, shipsByIndex(s))).toBeUndefined();
  });

  it('official ships have no prototype hooks', () => {
    for (const mode of ['basic', 'original', 'community'] as const) {
      for (const ship of Object.values(RULESETS[mode].ships)) expect(ship.hooks, `${mode} ${ship.name}`).toBeUndefined();
    }
  });

  const src = join(__dirname, '../src');
  const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : sourceExtensions.some((ext) => e.name.endsWith(ext)) ? [join(dir, e.name)] : [],
    );
  const moduleSpecifiers = (text: string): string[] => {
    const source = ts.createSourceFile('boundary.ts', text, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const add = (node: ts.Expression | undefined) => {
      if (node && ts.isStringLiteralLike(node)) found.push(node.text);
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
        add(node.moduleReference.expression);
      else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };
  const imports = (f: string) => moduleSpecifiers(readFileSync(f, 'utf8'));
  const importedPath = (file: string, specifier: string) => resolve(dirname(file), specifier);
  const inRegolith = (f: string) => relative(src, f).startsWith('regolith/');
  const inRegolithPath = (f: string) => {
    const path = relative(src, f);
    return path === 'regolith' || path.startsWith('regolith/');
  };

  it('is reached from the engine only through RULESETS (rulesets.ts)', () => {
    const importers = files(src)
      .filter((f) => !inRegolith(f))
      .filter((f) => imports(f).some((i) => inRegolithPath(importedPath(f, i))))
      .map((f) => relative(src, f));
    expect(importers).toEqual(['rulesets.ts']);
  });

  it('uses the engine only through the prototype kit (prototype.ts)', () => {
    for (const f of files(src).filter(inRegolith)) {
      for (const i of imports(f)) {
        const target = relative(src, importedPath(f, i)).replace(/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '');
        expect(target === 'prototype' || target.startsWith('regolith/'), `${relative(src, f)} imports ${i}`).toBe(true);
      }
    }
  });

  // So Regolith can leave for its own app one day (docs/regolith/REGOLITH.md): everything else asks the rule set, never the mode's id.
  it('is named, by its id or its name, only in its folder, rulesets.ts and the GameMode type', () => {
    const root = join(__dirname, '../../..');
    // The app's identity (appId.ts, the online namespace) names its game, not the mode.
    const allowed = [
      'packages/engine/src/regolith/',
      'packages/engine/src/rulesets.ts',
      'apps/web/src/appId.ts',
      'packages/online/src/codec.ts',
    ];
    const isGameMode = (node: ts.Node): boolean =>
      !!node.parent && ((ts.isTypeAliasDeclaration(node.parent) && node.parent.name.text === 'GameMode') || isGameMode(node.parent));
    const names = (text: string) => text.toLowerCase() === 'regolith';
    const sources = ['packages/engine/src', 'packages/ai/src', 'packages/online/src', 'apps/web/src']
      .flatMap((dir) => files(join(root, dir)))
      .filter((f) => !allowed.some((a) => relative(root, f).startsWith(a)));
    const named = sources.filter((f) => {
      let found = false;
      const visit = (node: ts.Node) => {
        if (
          (ts.isStringLiteralLike(node) && names(node.text) && !isGameMode(node)) ||
          (ts.isPropertyAccessExpression(node) && names(node.name.text))
        )
          found = true;
        ts.forEachChild(node, visit);
      };
      visit(ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true));
      return found;
    });
    // Styles too, outside their comments: a mode's look keys on its rule set (`.experimental`), not its id.
    const css = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
      );
    const styled = css(join(root, 'apps/web/src')).filter((f) =>
      /regolith/i.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    );
    expect([...named, ...styled].map((f) => relative(root, f))).toEqual([]);
  });

  it('recognizes static, re-export, dynamic and require imports in the boundary check', () => {
    expect(moduleSpecifiers("import './a'; export * from './b'; import('./c'); require('./d'); import item = require('./e');")).toEqual([
      './a',
      './b',
      './c',
      './d',
      './e',
    ]);
  });

  it('uses mode-configured regular-turn actions and research cap', () => {
    const rules = RULESETS.regolith;
    const oldActions = rules.actionsPerTurn;
    const oldResearchLimit = rules.researchLimit;
    const oldCards = rules.cards;
    try {
      rules.actionsPerTurn = 2;
      rules.researchLimit = 4;
      // Research needs cards, which Regolith may be playing without (REGOLITH_CARDS): lend it Community's.
      rules.cards = RULESETS.community.cards;

      const started = scenario({});
      beginPlay(started);
      expect(started.turn.actionsLeft).toBe(2);

      const ready = scenario({});
      ready.players[0].research = 3;
      expect(offered(ready, 'research')).toHaveLength(1);
      const researched = apply(ready, { type: 'research' });
      expect(researched.players[0].research).toBe(4);
      expect(offered(researched, 'research')).toEqual([]);
      expect(() => apply(researched, { type: 'research' })).toThrow(/at 4/);
    } finally {
      rules.actionsPerTurn = oldActions;
      rules.researchLimit = oldResearchLimit;
      rules.cards = oldCards;
    }
  });
});

describe('movement cap', () => {
  it('caps the die value at 3', () => {
    for (const value of [3, 4, 5, 6]) expect(farthest(scenario({ p0d0: [0, 0, value] }), 'p0d0'), `a ${value}`).toBe(3);
    expect(farthest(scenario({ p0d0: [0, 0, 2] }), 'p0d0')).toBe(2);
    expect(farthest(scenario({ p0d0: [0, 0, 6] }, 'community'), 'p0d0')).toBe(6);
  });

  it('applies before skill bonuses: a 6 with Agile moves 4 (ruling 2026-10-08)', () => {
    expect(farthest(scenario({ p0d0: [0, 0, 6] }, 'regolith', ['agile']), 'p0d0')).toBe(4);
    expect(farthest(scenario({ p0d0: [0, 0, 2] }, 'regolith', ['agile']), 'p0d0')).toBe(3);
  });
});

describe('zones of control (Picket on every ship)', () => {
  const reachable = (s: GameState) => [...moveOptions(s, 'p0d0').moves.keys()];

  it('stops an enemy ship next to a ship, up, down, left or right: it can’t move through', () => {
    // From (0,2), the only way to (0,4) passes (0,3), next to the enemy at (1,3) (a planet is at (1,4)).
    const s = scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] });
    expect(reachable(s)).toContain('0,3');
    expect(reachable(s)).not.toContain('0,4');
    expect(reachable(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] }, 'community'))).toContain('0,4');
  });

  it('doesn’t stop it diagonally', () => {
    // (0,2) is diagonal to the enemy at (1,3), so a ship from (0,0) passes it and stops at (0,3).
    expect(reachable(scenario({ p0d0: [0, 0, 3], p1d0: [1, 3, 6] }))).toContain('0,3');
  });

  it('still lets it attack from there', () => {
    const s = scenario({ p0d0: [0, 0, 3], p1d0: [0, 3, 6] });
    expect(moveOptions(s, 'p0d0').attacks.has('p1d0')).toBe(true);
  });

  it('lets a ship that starts in a zone leave, and never stops friendly ships', () => {
    expect(reachable(scenario({ p0d0: [0, 2, 3], p1d0: [0, 3, 6] }))).toContain('0,0');
    expect(reachable(scenario({ p0d0: [0, 2, 3], p0d1: [2, 3, 6] }))).toContain('2,2');
  });

  it('every ship has a zone, and the engine refuses a move through one', () => {
    for (const v of [1, 2, 3, 4, 5, 6])
      expect(reachable(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, v] })), `enemy ${v}`).not.toContain('0,4');
    const move: Action = { type: 'move', die: 'p0d0', to: { r: 0, c: 4 } };
    expect(tryApply(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] }), move)).toBeNull();
    expect(tryApply(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] }, 'community'), move)).not.toBeNull();
  });

  it('lets a stopped ship attack another enemy next to it, but not with no steps left', () => {
    // Stopped at (2,2) by p1d0's zone, with p1d1 below it.
    expect([...moveOptions(scenario({ p0d0: [2, 0, 3], p1d0: [2, 3, 6], p1d1: [3, 2, 6] }), 'p0d0').attacks.keys()].sort()).toEqual([
      'p1d0',
      'p1d1',
    ]);
    expect(moveOptions(scenario({ p0d0: [0, 0, 2], p1d0: [0, 3, 6] }), 'p0d0').attacks.size).toBe(0);
  });

  it('doesn’t stop a player with Devious, who may also pass through the ship', () => {
    // Devious passes (0,2), next to p1d0, and p1d0 itself for free: (0,4) is 3 steps from (0,0).
    expect(reachable(scenario({ p0d0: [0, 0, 3], p1d0: [0, 3, 6] }, 'regolith', ['devious']))).toContain('0,4');
    expect(reachable(scenario({ p0d0: [0, 0, 3], p1d0: [0, 3, 6] }))).not.toContain('0,4');
    expect(reachable(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] }, 'regolith', ['devious']))).toContain('0,4');
    expect(reachable(scenario({ p0d0: [0, 2, 3], p1d0: [1, 3, 6] }))).not.toContain('0,4');
  });

  it('stops a ship on a Warp Gate exit in a zone', () => {
    const s = scenario({ p0d0: [0, 0, 3], p1d0: [3, 3, 6] });
    s.gates = [
      { r: 0, c: 1 },
      { r: 3, c: 2 },
    ];
    expect(reachable(s)).toContain('3,2');
    expect(reachable(s)).not.toContain('2,2'); // 3 steps only through the gate and (3,2)
  });

  it('covers a hex’s 6 sides on a hex map, but not its diagonals', () => {
    const s = scenario({ p1d0: [4, 5, 6] }, 'hex');
    const g = grid(s.board);
    const zone = [...picket.hooks.stopsEnemies!(s, at(s, 'p1d0'), 4 * g.cols + 5)].map((i) => g.cells[i]);
    expect(zone).toEqual(adjacent(s.board, { r: 4, c: 5 }));
    expect(zone).toHaveLength(6);
    // (5,3) is a hex diagonal of the enemy at (4,5); (5,4), a side a square would call diagonal, stops it, so
    // (5,5) and the spaces past (4,4) are out of reach.
    const moves = reachable(scenario({ p0d0: [5, 3, 2], p1d0: [4, 5, 6] }, 'hex'));
    expect(moves).toEqual(expect.arrayContaining(['5,4', '4,4']));
    expect(moves).not.toContain('5,5');
    expect(moves).not.toContain('3,4');
    expect(reachable(scenario({ p0d0: [5, 3, 2] }, 'hex'))).toEqual(expect.arrayContaining(['5,5', '3,4']));
  });

  it('agrees with a plain reference search on random positions', () => {
    const g = grid(BASE.regolith.board);
    const spaces = [...Array(g.size).keys()].filter((i) => g.space[i]);
    const random = mulberry32(42);
    for (let n = 0; n < 500; n++) {
      const dice: Record<string, [number, number, number]> = {};
      [...spaces]
        .sort(() => random() - 0.5)
        .slice(0, 2 + Math.floor(random() * 8))
        .forEach((i, k) => (dice[`p${k % 2}d${Math.floor(k / 2)}`] = [Math.floor(i / g.cols), i % g.cols, 1 + Math.floor(random() * 6)]));
      const s = scenario(dice);
      for (const id of Object.keys(dice).filter((x) => x.startsWith('p0'))) {
        const got = moveIndexes(s, id);
        const want = referenceReach(s, id);
        expect(
          [...got.moves.keys()].sort((a, b) => a - b),
          `${n} ${id}`,
        ).toEqual(want.moves);
        expect([...got.attacks.keys()].sort(), `${n} ${id}`).toEqual(want.attacks);
      }
    }
  });
});

/** Moves and attacks by a plain breadth-first search, 1 step per space, stopping in any space next to an enemy (no gates or skills). */
function referenceReach(s: GameState, id: string) {
  const g = grid(s.board);
  const at = shipsByIndex(s);
  const me = at.find((d) => d?.id === id)!;
  const from = at.indexOf(me);
  const zone = new Set(at.flatMap((d, i) => (d && d.owner !== me.owner ? g.ortho[i] : [])));
  const range = Math.min(3, me.value);
  const steps = new Map([[from, 0]]);
  const queue = [from];
  const attacks = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (steps.get(cur)! >= range) continue;
    for (const nb of g.ortho[cur]) {
      if (at[nb]) {
        if (at[nb]!.owner !== me.owner) attacks.add(at[nb]!.id);
      } else if (g.space[nb] && !steps.has(nb) && !(cur !== from && zone.has(cur))) {
        steps.set(nb, steps.get(cur)! + 1);
        queue.push(nb);
      }
    }
  }
  steps.delete(from);
  return { moves: [...steps.keys()].sort((a, b) => a - b), attacks: [...attacks].sort() };
}

describe('where an attack goes in from', () => {
  // Planets are at rows and columns 1, 4 and 7. A 4 at (3,2) can attack p1d0 at (2,3) from every space next to it:
  // (2,2) and (3,3) are next to nothing else, (1,3) and (2,4) are both in the orbit of the planet at (1,4).
  const launches = (s: GameState) => attackLaunches(s, 'p0d0', 'p1d0').map((x) => `${x.from.r},${x.from.c}`);
  const attack = (r: number, c: number): Action => ({ type: 'attack', die: 'p0d0', target: 'p1d0', from: { r, c } });

  it('offers one space for each different outcome, the nearest', () => {
    const s = scenario({ p0d0: [3, 2, 4], p1d0: [2, 3, 6] }, 'community');
    expect(moveOptions(s, 'p0d0').attacks.get('p1d0')?.launches).toHaveLength(4);
    expect(launches(s)).toEqual(['2,2', '1,3']);
    expect(offered(s, 'attack')).toHaveLength(2);
  });

  it('refuses a space with the same outcome as an offered one, and attacks from the one chosen', () => {
    const s = scenario({ p0d0: [3, 2, 4], p1d0: [2, 3, 6] }, 'community');
    expect(tryApply(s, attack(3, 3))).toBeNull();
    expect(tryApply(s, attack(2, 4))).toBeNull();
    const after = tryApply(s, attack(1, 3))!;
    expect(at(after, 'p0d0').loc).toEqual({ zone: 'board', r: 1, c: 3 });
  });

  it('offers no choice with only one space to attack from', () => {
    expect(launches(scenario({ p0d0: [2, 2, 2], p1d0: [2, 3, 6] }, 'community'))).toEqual(['2,2']);
  });

  it('tells apart the planets in the corners with Ingenious, which conquers from them', () => {
    // (2,2) has the planet at (1,1) in a corner, (3,3) the one at (4,4).
    const s = scenario({ p0d0: [3, 2, 4], p1d0: [2, 3, 6] }, 'community', ['ingenious']);
    expect(launches(s).sort()).toEqual(['1,3', '2,2', '3,3']);
  });

  it('tells apart a space next to another enemy ship, which stops a ship in its zone of control', () => {
    // (2,2) is next to p1d1 as well; (2,4) is out of reach, as p1d0's zone stops the ship at (3,3).
    const s = scenario({ p0d0: [3, 2, 3], p1d0: [2, 3, 6], p1d1: [2, 1, 6] });
    expect(launches(s)).toEqual(['2,2', '3,3']);
  });
});

describe('the way a ship flies (movePath)', () => {
  const path = (s: GameState, r: number, c: number) => movePath(s, 'p0d0', { r, c }).map((p) => `${p.r},${p.c}`);

  it('goes straight when it can', () => {
    expect(path(scenario({ p0d0: [2, 2, 4] }, 'community'), 2, 5)).toEqual(['2,2', '2,3', '2,4', '2,5']);
  });

  it('goes round a ship in the way, one space at a time, by a shortest way', () => {
    const way = path(scenario({ p0d0: [2, 2, 4], p1d0: [2, 3, 6] }, 'community'), 2, 4);
    expect(way).toHaveLength(5);
    expect(way).not.toContain('2,3');
    for (let i = 1; i < way.length; i++) {
      const [[r0, c0], [r1, c1]] = [way[i - 1], way[i]].map((p) => p.split(',').map(Number));
      expect(Math.abs(r1 - r0) + Math.abs(c1 - c0), way.join(' ')).toBe(1);
    }
  });

  it('passes through enemy ships for free with Devious', () => {
    const s = scenario({ p0d0: [2, 0, 1], p1d0: [2, 1, 6], p1d1: [2, 2, 6] }, 'community', ['devious']);
    expect(path(s, 2, 3)).toEqual(['2,0', '2,1', '2,2', '2,3']);
  });

  it('is empty where the ship can’t go, as past a zone of control', () => {
    expect(path(scenario({ p0d0: [2, 2, 3], p1d0: [1, 3, 6] }), 2, 4)).toEqual([]);
    expect(path(scenario({ p0d0: [2, 2, 3], p1d0: [1, 3, 6] }), 2, 3)).toEqual(['2,2', '2,3']);
  });
});

describe('classic 5 and 6 abilities are gone, the 4 is kept', () => {
  it('a Chameleon (4) can change, as in Community, but a Wisp (6) can’t reconfigure for free', () => {
    const s = scenario({ p0d0: [0, 0, 4], p0d1: [0, 8, 6] });
    expect(offered(s, 'change').length).toBeGreaterThan(0);
    expect(offered(s, 'freeReconfigure')).toEqual([]);
    expect(() => apply(s, { type: 'freeReconfigure', die: 'p0d1' })).toThrow();
  });

  it('a Sniper (5) never moves diagonally, as a Community Interceptor does', () => {
    const s = scenario({ p0d0: [2, 2, 5] });
    expect([...moveOptions(s, 'p0d0').moves.values()].every((m) => !m.diagonal)).toBe(true);
    expect([...moveOptions(scenario({ p0d0: [2, 2, 5] }, 'community'), 'p0d0').moves.values()].some((m) => m.diagonal)).toBe(true);
  });

  it('the 1, 2 and 3 keep theirs', () => {
    const s = scenario({ p0d0: [0, 0, 1], p0d1: [0, 4, 3], p1d0: [0, 1, 4] });
    expect(offered(s, 'freeAttack')).toHaveLength(1);
    expect(offered(s, 'swap')).toHaveLength(1);
  });
});

describe('Shoot (5 Sniper)', () => {
  /** Shoots and fixes both combat rolls (lower total wins). */
  function shoot(s: GameState, target: string, attackerRoll: number, defenderRoll: number) {
    s = apply(s, { type: 'power', die: 'p0d0', target });
    const c = s.pending[0];
    if (c?.kind !== 'combat') throw new Error('no combat');
    c.attacker.dice = [attackerRoll];
    c.defender.dice = [defenderRoll];
    return apply(s, { type: 'resolveCombat' });
  }
  const mine = (s: GameState, type: Action['type']) => legalActions(s).filter((a) => a.type === type && 'die' in a && a.die === 'p0d0');

  it('attacks a ship 2 spaces away, and stays put when it wins', () => {
    const s0 = scenario({ p0d0: [0, 0, 5], p1d0: [0, 2, 3] });
    expect(offered(s0, 'power')).toEqual([{ type: 'power', die: 'p0d0', target: 'p1d0' }]);
    const s = shoot(s0, 'p1d0', 1, 6);
    expect(at(s, 'p1d0').loc.zone).toBe('scrapyard');
    expect(at(s, 'p0d0').loc).toEqual({ zone: 'board', r: 0, c: 0 });
    expect(s.pending.some((p) => p.kind === 'advance')).toBe(false);
    expect(s.players[0].dominance).toBeGreaterThan(BASE.regolith.players[0].dominance);
  });

  it('is the ship’s one action: no move, attack or second shot after it', () => {
    const s = shoot(scenario({ p0d0: [0, 0, 5], p1d0: [0, 2, 3], p1d1: [3, 0, 2] }), 'p1d0', 6, 1);
    expect(s.turn.actionsLeft).toBe(2);
    expect(mine(s, 'power')).toEqual([]);
    expect(mine(s, 'move')).toEqual([]);
    expect(mine(s, 'attack')).toEqual([]);
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 0, c: 1 } })).toThrow(/already moved/);
  });

  it('can’t shoot after moving or after a normal attack', () => {
    const s0 = scenario({ p0d0: [0, 0, 5], p1d0: [0, 4, 3] });
    expect(shots(s0)).toEqual(['p1d0']);
    expect(shots(apply(s0, { type: 'move', die: 'p0d0', to: { r: 1, c: 0 } }))).toEqual([]);
    const s1 = scenario({ p0d0: [0, 0, 5], p1d0: [0, 1, 6], p1d1: [2, 0, 3] });
    const attacked = apply(s1, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    const resolved = apply(attacked, { type: 'resolveCombat' });
    expect(shots(resolved.pending.length ? apply(resolved, { type: 'advance', move: false }) : resolved)).toEqual([]);
  });

  it('reaches the first ship in a clear orthogonal line, at any distance', () => {
    const ids = (s: GameState) =>
      shootTargets(s, at(s, 'p0d0'))
        .map((d) => d.id)
        .sort();
    expect(ids(scenario({ p0d0: [0, 2, 5], p1d0: [0, 3, 3], p1d1: [0, 0, 2] }))).toEqual(['p1d0', 'p1d1']);
    expect(ids(scenario({ p0d0: [0, 0, 5], p1d0: [0, 8, 3] }))).toEqual(['p1d0']);
    // Not diagonal, and not a knight's move.
    expect(ids(scenario({ p0d0: [0, 2, 5], p1d0: [1, 3, 3], p1d1: [2, 3, 2] }))).toEqual([]);
  });

  it('is blocked by ships, planets and the edge of the board', () => {
    expect(shots(scenario({ p0d0: [0, 0, 5], p0d1: [0, 1, 2], p1d0: [0, 2, 3] }))).toEqual([]);
    expect(shots(scenario({ p0d0: [0, 0, 5], p1d0: [0, 3, 3], p1d1: [0, 6, 2] }))).toEqual(['p1d0']); // only the first
    expect(shots(scenario({ p0d0: [1, 0, 5], p1d0: [1, 2, 3] }))).toEqual([]); // a planet in between
    expect(shots(scenario({ p0d0: [0, 0, 5], p0d1: [0, 2, 3] }))).toEqual([]);
  });

  it('shoots along a hex’s 6 sides on a hex map, not its diagonals', () => {
    const ids = (s: GameState) =>
      shootTargets(s, at(s, 'p0d0'))
        .map((d) => d.id)
        .sort();
    // From (7,3): along +c to (7,6), along (+1,-1) to (9,1) and down to (10,3); (6,3)'s line meets a planet.
    expect(ids(scenario({ p0d0: [7, 3, 5], p1d0: [7, 6, 3], p1d1: [9, 1, 2], p1d2: [10, 3, 1] }, 'hex'))).toEqual(['p1d0', 'p1d1', 'p1d2']);
    // (8,4) and (5,4) are hex diagonals, two hexes away between two sides.
    expect(ids(scenario({ p0d0: [7, 3, 5], p1d0: [8, 4, 3], p1d1: [5, 4, 2] }, 'hex'))).toEqual([]);
  });

  it('flies over the void', () => {
    const s = scenario({ p0d0: [0, 0, 5], p1d0: [0, 2, 3] });
    s.board.cells[0][1].void = true;
    expect(shootTargets(s, at(s, 'p0d0')).map((d) => d.id)).toEqual(['p1d0']);
  });

  it('only Regolith’s 5, the Sniper, can shoot', () => {
    expect(shots(scenario({ p0d0: [0, 0, 4], p1d0: [0, 2, 3] }))).toEqual([]);
    const community = scenario({ p0d0: [0, 0, 5], p1d0: [0, 2, 3] }, 'community');
    expect(shots(community)).toEqual([]);
    expect(() => apply(community, { type: 'power', die: 'p0d0', target: 'p1d0' })).toThrow(/no such power/);
  });
});

describe('Barrier (6 Wisp)', () => {
  const cells = (list: { r: number; c: number }[]) => list.map((p) => `${p.r},${p.c}`).sort();
  const fire = (s: GameState, r: number, c: number, die = 'p0d0') => apply(s, { type: 'power', die, to: { r, c } });

  it('lands on any clear space in a straight line out of a side, at any distance', () => {
    // Row 0 and column 0 of Alpha Sector are all spaces; the enemy at (0,5) stops the line along the row.
    const s = scenario({ p0d0: [0, 0, 6], p1d0: [0, 5, 3] });
    expect(cells(barrierTargets(s, at(s, 'p0d0')))).toEqual(
      cells([1, 2, 3, 4].map((c) => ({ r: 0, c })).concat([1, 2, 3, 4, 5, 6, 7, 8].map((r) => ({ r, c: 0 })))),
    );
    // A planet stops it: (2,1) is next to planet (1,1), which blocks the line up.
    expect(cells(barrierTargets(scenario({ p0d0: [2, 1, 6] }), at(scenario({ p0d0: [2, 1, 6] }), 'p0d0')))).not.toContain('0,1');
  });

  it('costs no action and leaves the move: once a turn', () => {
    const s = fire(scenario({ p0d0: [0, 0, 6] }), 0, 3);
    expect(s.barriers).toEqual([{ r: 0, c: 3, owner: 0 }]);
    expect(s.turn.actionsLeft).toBe(3);
    expect(offered(s, 'move').some((a) => 'die' in a && a.die === 'p0d0')).toBe(true);
    expect(offered(s, 'power')).toEqual([]);
    // After a move too.
    const moved = apply(scenario({ p0d0: [0, 0, 6] }), { type: 'move', die: 'p0d0', to: { r: 0, c: 2 } });
    expect(offered(moved, 'power').length).toBeGreaterThan(0);
  });

  it('blocks every move into or through its space', () => {
    const s0 = scenario({ p0d0: [0, 8, 6], p0d1: [0, 2, 3] });
    expect(cells([...moveOptions(s0, 'p0d1').moves.values()].map((m) => m.cell))).toContain('0,4');
    const s = fire(s0, 0, 4);
    expect(cells([...moveOptions(s, 'p0d1').moves.values()].map((m) => m.cell))).not.toContain('0,4');
    // The Wisp's own way along the row is shut too.
    expect(cells([...moveOptions(s, 'p0d0').moves.values()].map((m) => m.cell))).not.toContain('0,4');
  });

  it('blocks shots, and its own line', () => {
    // A Sniper at (0,8) has the enemy at (0,2) in its sights until the Wisp at (2,5) fires a barrier up to (0,5).
    const s0 = scenario({ p0d0: [2, 5, 6], p0d1: [0, 8, 5], p1d0: [0, 2, 3] });
    expect(shootTargets(s0, at(s0, 'p0d1')).map((d) => d.id)).toEqual(['p1d0']);
    const s = fire(s0, 0, 5);
    expect(shootTargets(s, at(s, 'p0d1')).map((d) => d.id)).toEqual([]);
    // Nor does a barrier fly past one.
    expect(cells(barrierTargets(scenario({ p0d0: [0, 8, 6] }), at(scenario({ p0d0: [0, 8, 6] }), 'p0d0')))).toContain('0,4');
    const blocked = fire(scenario({ p0d0: [0, 8, 6] }), 0, 6);
    expect(cells(barrierTargets(blocked, at(blocked, 'p0d0')))).not.toContain('0,4');
  });

  it('flies over a warp gate but doesn’t land on one, as Barricade’s don’t', () => {
    const s = scenario({ p0d0: [0, 0, 6] });
    s.gates = [
      { r: 0, c: 2 },
      { r: 8, c: 0 },
    ];
    const targets = cells(barrierTargets(s, at(s, 'p0d0')));
    expect(targets).not.toContain('0,2');
    expect(targets).not.toContain('8,0');
    expect(targets).toContain('0,3');
  });

  it('holds a perimeter space: nothing drops there', () => {
    // A perimeter space player 0 may drop into, and a space next to it for the Wisp to fire from.
    let found: [GameState, { r: number; c: number }] | undefined;
    for (const p of deployTargets(scenario({}), 0))
      for (const q of adjacent(BASE.regolith.board, p)) {
        const s0 = scenario({ p0d0: [q.r, q.c, 6] });
        if (!found && s0.board.cells[q.r][q.c].kind === 'space' && cells(deployTargets(s0, 0)).includes(`${p.r},${p.c}`)) found = [s0, p];
      }
    expect(found).toBeDefined();
    const [s0, p] = found!;
    expect(orbitedPlanets(s0.board, p).length).toBeGreaterThan(0);
    const s = fire(s0, p.r, p.c);
    expect(cells(deployTargets(s, 0))).not.toContain(`${p.r},${p.c}`);
  });

  it('stays for good: nothing can attack or remove it', () => {
    const s = fire(scenario({ p0d0: [0, 0, 6], p1d0: [0, 3, 1] }), 0, 2);
    const next = apply(apply(s, { type: 'endTurn' }), { type: 'endTurn' });
    expect(next.barriers).toEqual(s.barriers);
    expect(legalActions(s).some((a) => 'to' in a && typeof a.to === 'object' && a.to?.r === 0 && a.to.c === 2)).toBe(false);
  });

  it('only Regolith’s 6, the Wisp, fires barriers', () => {
    expect(offered(scenario({ p0d0: [0, 0, 4] }), 'power')).toEqual([]);
    const community = scenario({ p0d0: [0, 0, 6] }, 'community');
    expect(() => fire(community, 0, 3)).toThrow(/no such power/);
  });
});

describe('contested orbit', () => {
  /** p0's ships making a free planet's number in its orbit, and `enemy` (p1's ship) in another of its spaces or beside the orbit. */
  const siege = (mode: 'regolith' | 'community' | 'hex', enemy: 'orbit' | 'outside' | 'none' = 'orbit') => {
    const base = BASE[mode];
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const [a, b, c] = orbitals(base.board, planet);
    const placed: Record<string, [number, number, number]> = { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, planet.number - 6] };
    if (enemy === 'orbit') placed.p1d0 = [c.r, c.c, 3];
    if (enemy === 'outside') {
      // A space next to the orbit but not in it (on a hex map, another planet's orbit).
      const g = grid(base.board);
      const inOrbit = (q: { r: number; c: number }) => orbitals(base.board, planet).some((o) => o.r === q.r && o.c === q.c);
      const near = g.cells.find((q, i) => g.space[i] && !inOrbit(q) && g.orthoCells[i].some(inOrbit))!;
      placed.p1d0 = [near.r, near.c, 3];
    }
    return { s: scenario(placed, mode), planet: planet.id };
  };

  it('stops a conquest while an enemy ship is in orbit, though the sum is made', () => {
    for (const mode of ['regolith', 'hex'] as const) {
      const { s, planet } = siege(mode);
      const check = conquerCheck(s, 0, planet);
      expect(check, mode).toMatchObject({ ok: false, blocked: true, sum: s.board.planets[planet].number });
      expect(offered(s, 'conquer'), mode).toEqual([]);
      expect(tryApply(s, { type: 'conquer', planet }), mode).toBeNull();
    }
  });

  it('lets it go ahead once the orbit is clear, or with the enemy ship beside the orbit', () => {
    for (const mode of ['regolith', 'hex'] as const) {
      for (const enemy of ['none', 'outside'] as const) {
        const { s, planet } = siege(mode, enemy);
        expect(conquerCheck(s, 0, planet).ok, `${mode} ${enemy}`).toBe(true);
        expect(offered(s, 'conquer'), `${mode} ${enemy}`).toContainEqual({ type: 'conquer', planet });
      }
    }
  });

  it('never blocks a player’s own ships, nor Infamy', () => {
    const { s, planet } = siege('regolith');
    expect(conquerCheck(s, 1, planet)).not.toMatchObject({ blocked: true });
    expect(infamyTargets(s, 0).map((p) => p.id)).toContain(planet);
  });

  it('is off outside Regolith', () => {
    const { s, planet } = siege('community');
    expect(conquerCheck(s, 0, planet).ok).toBe(true);
  });

  it('names the blockade when the sum is short too', () => {
    const { s, planet } = siege('hex');
    s.dice.find((d) => d.id === 'p0d1')!.value++;
    const check = conquerCheck(s, 0, planet);
    expect(check.blocked).toBeUndefined();
    expect(check.reason).toMatch(/needs .*enemy ships in orbit block it too \(3\)/);
  });

  it('with Ingenious: an enemy on a corner doesn’t block, an own ship on a corner is blocked like the rest', () => {
    const base = BASE.regolith;
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const [o1, o2] = orbitals(base.board, planet);
    const [k1, k2] = diagonals(base.board, planet);
    const sum = { p0d0: [o1.r, o1.c, 6], p0d1: [k1.r, k1.c, planet.number - 6] } as Record<string, [number, number, number]>;
    expect(conquerCheck(scenario({ ...sum, p1d0: [k2.r, k2.c, 3] }, 'regolith', ['ingenious']), 0, planet.id).ok).toBe(true);
    expect(conquerCheck(scenario({ ...sum, p1d0: [o2.r, o2.c, 3] }, 'regolith', ['ingenious']), 0, planet.id).blocked).toBe(true);
  });

  it('on off-centre maps, an enemy on a space two orbits share blocks both planets', () => {
    // Twin Drift only: Binary Reach, the square one, isn't played since Regolith went hex only.
    for (const map of ['twin-drift']) {
      const base = quickStart(2, 1, 'regolith', map);
      const shared = base.board.planets.flatMap((p) => orbitals(base.board, p)).find((c) => orbitedPlanets(base.board, c).length > 1)!;
      const planets = orbitedPlanets(base.board, shared);
      expect(planets.length, map).toBe(2);
      for (const planet of planets) {
        const [a, b] = orbitals(base.board, planet).filter((c) => c.r !== shared.r || c.c !== shared.c);
        const s = arrange(base, { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, planet.number - 6], p1d0: [shared.r, shared.c, 2] });
        s.board.planets[planet.id].cubes = [];
        expect(conquerCheck(s, 0, planet.id).blocked, `${map}, planet ${planet.number}`).toBe(true);
      }
    }
  });

  it('blocks over-conquest too, when that is on', () => {
    const base = BASE.regolith;
    const planet = base.board.planets.find((q) => !q.start && q.capacity >= 2)!;
    const [a, b, c] = orbitals(base.board, planet);
    const s = scenario({ p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, 6], p1d0: [c.r, c.c, 3] });
    s.board.planets[planet.id].cubes = Array(planet.capacity).fill(1);
    const rules = rulesOf(s) as { overConquest?: boolean };
    const was = rules.overConquest;
    rules.overConquest = true;
    try {
      expect(offered(s, 'conquer')).toEqual([]);
      at(s, 'p1d0').loc = { zone: 'scrapyard' };
      expect(offered(s, 'conquer')).toEqual([{ type: 'conquer', planet: planet.id, replace: 1 }]);
    } finally {
      rules.overConquest = was;
    }
  });
});

describe.runIf(REGOLITH_CONTESTED_DEPLOY)('deploying to a contested planet', () => {
  const deploys = (s: GameState) => offered(s, 'deploy').map((a) => (a.type === 'deploy' ? `${a.to.r},${a.to.c}` : ''));
  const ring = (s: GameState, planet: { id: number }) => orbitals(s.board, s.board.planets[planet.id]).map((c) => `${c.r},${c.c}`);
  const into = (s: GameState, planet: { id: number }) => new Set(deploys(s).filter((c) => ring(s, planet).includes(c))).size;
  /** Player 0's starting planet (its home, where there is a home shipyard). */
  const home = (mode: keyof typeof BASE) => BASE[mode].board.planets.find((q) => q.start && q.cubes.includes(0))!;
  /** Player 0 with a cube on a second planet away from home (sharing no orbit space with it), `ships` placed, and `enemy` in that planet's orbit. */
  const colony = (mode: keyof typeof BASE, enemy = true, ships: Record<string, [number, number, number]> = {}) => {
    const base = BASE[mode];
    const homeRing = ring(base, home(mode));
    const planet = base.board.planets.find((q) => !q.start && !ring(base, q).some((c) => homeRing.includes(c)))!;
    const [a] = orbitals(base.board, planet);
    const s = scenario(enemy ? { ...ships, p1d0: [a.r, a.c, 6] } : ships, mode);
    s.board.planets[planet.id].cubes = [0];
    return { s, planet };
  };
  /** Runs `f` with the home shipyard on or off. */
  const shipyard = (s: GameState, on: boolean, f: () => void) => {
    const rules = rulesOf(s) as { homeShipyard?: boolean };
    const was = rules.homeShipyard;
    rules.homeShipyard = on;
    try {
      f();
    } finally {
      rules.homeShipyard = was;
    }
  };

  it('keeps a player out of the orbit of their planet while an enemy ship is in it', () => {
    for (const mode of ['regolith', 'hex'] as const) {
      const { s, planet } = colony(mode);
      expect(into(s, planet), mode).toBe(0);
      expect(tryApply(s, { type: 'deploy', die: 'p0d0', to: orbitals(s.board, planet)[1] }), mode).toBeNull();
      at(s, 'p1d0').loc = { zone: 'scrapyard' };
      expect(into(s, planet), mode).toBeGreaterThan(0);
    }
  });

  it('is never stopped by a player’s own ships in orbit', () => {
    const base = BASE.regolith;
    const homeRing = ring(base, home('regolith'));
    const planet = base.board.planets.find((q) => !q.start && !ring(base, q).some((c) => homeRing.includes(c)))!;
    const [a] = orbitals(base.board, planet);
    const { s } = colony('regolith', false, { p0d1: [a.r, a.c, 6] });
    expect(into(s, planet)).toBeGreaterThan(0);
  });

  it('keeps Stealthy out of a contested orbit too', () => {
    const base = BASE.regolith;
    const planet = base.board.planets.find((q) => !q.cubes.includes(0))!;
    const [a] = orbitals(base.board, planet);
    const s = scenario({ p1d0: [a.r, a.c, 6] }, 'regolith', ['stealthy']);
    expect(deployTargets(s, 0).some((c) => ring(s, planet).includes(`${c.r},${c.c}`))).toBe(false);
  });

  it('knows each player’s home: the starting planet they chose', () => {
    const s = structuredClone(BASE.regolith);
    const mine = homePlanet(s, 0)!;
    expect(mine.start).toBe(true);
    expect(mine.cubes).toContain(0);
    expect(homePlanet(s, 1)).not.toBe(mine);
    expect(homePlanet(BASE.community, 0)).toBeUndefined();
  });

  describe('a home moves with the last cube on it', () => {
    /** Player 1 to resolve a Relocation (a Classic card, lent here) of player 0's cube from `from` to `to`. */
    const relocate = (s: GameState, from: number, to: number) => {
      s.pending.unshift({ kind: 'relocation', player: 1 });
      return apply(s, { type: 'relocate', planet: from, owner: 0, to });
    };
    const elsewhere = (s: GameState) => s.board.planets.find((q) => !q.start && !q.cubes.length)!;

    it('to the planet Relocation puts it on, and the shipyard there', () => {
      const s = structuredClone(BASE.regolith);
      const from = homePlanet(s, 0)!.id;
      const to = elsewhere(s).id;
      const after = relocate(s, from, to);
      expect(homePlanet(after, 0)!.id).toBe(to);
      expect(after.board.planets[from].cubes).not.toContain(0);
    });

    it('not while another of their cubes stays on it', () => {
      const s = structuredClone(BASE.regolith);
      const home = homePlanet(s, 0)!;
      s.board.planets[home.id].capacity = 2;
      s.board.planets[home.id].cubes.push(0);
      expect(homePlanet(relocate(s, home.id, elsewhere(s).id), 0)!.id).toBe(home.id);
    });

    it('nor when a cube leaves another planet, and never becomes another player’s', () => {
      const s = structuredClone(BASE.regolith);
      const home = homePlanet(s, 0)!.id;
      const other = elsewhere(s);
      s.board.planets[other.id].cubes.push(0);
      const after = relocate(s, other.id, s.board.planets.find((q) => q !== other && !q.start && !q.cubes.length)!.id);
      expect(homePlanet(after, 0)!.id).toBe(home);
      const moved = relocate(structuredClone(BASE.regolith), home, other.id);
      expect(homePlanet(moved, 1)!.id).not.toBe(home);
    });

    it('to another of their planets when over-conquest displaces it, or nowhere', () => {
      const s = structuredClone(BASE.regolith);
      const home = homePlanet(s, 0)!.id;
      const other = elsewhere(s).id;
      s.board.planets[other].cubes.push(0);
      s.board.planets[home].cubes = [];
      cubeLeft(s, 0, home);
      expect(homePlanet(s, 0)!.id).toBe(other);
      s.board.planets[other].cubes = [];
      cubeLeft(s, 0, other);
      expect(homePlanet(s, 0)).toBeUndefined();
    });
  });

  it('a home shipyard stays open while contested, so a player is never shut out', () => {
    for (const mode of ['regolith', 'hex'] as const) {
      const planet = home(mode);
      const [a] = orbitals(BASE[mode].board, planet);
      // Player 0 holds only its home, its whole fleet is in the scrapyard, and an enemy sits in that orbit.
      const s = scenario({ p1d0: [a.r, a.c, 6] }, mode);
      for (const q of s.board.planets) q.cubes = q.cubes.filter((x) => x !== 0 || q.id === planet.id);
      shipyard(s, true, () => expect(into(s, planet), mode).toBe(ring(s, planet).length - 1));
      shipyard(s, false, () => expect(offered(s, 'deploy'), mode).toEqual([]));
    }
  });

  it('a home shipyard doesn’t open a player’s other planets, nor a rival’s home', () => {
    const { s, planet } = colony('regolith');
    shipyard(s, true, () => expect(into(s, planet)).toBe(0));
    const theirs = homePlanet(s, 1)!;
    expect(conquerCheck(s, 0, theirs.id).ok).toBe(false);
  });

  it('is off outside Regolith', () => {
    const { s, planet } = colony('community');
    expect(into(s, planet)).toBeGreaterThan(0);
  });
});

describe.runIf(REGOLITH_OVER_CONQUEST)('over-conquest', () => {
  const full = (mode: 'regolith' | 'community') => {
    const s = scenario({ p0d0: [0, 1, 6], p0d1: [1, 0, 6] }, mode);
    const planet = s.board.planets.find((p) => p.cubes.length === 0)!;
    return { s, planet };
  };

  it('is off outside Regolith: a full planet cannot be conquered', () => {
    const { s, planet } = full('community');
    planet.cubes.push(1, 1, 1, 1, 1, 1, 1, 1);
    expect(conquerCheck(s, 0, planet.id).ok).toBe(false);
  });

  it('needs a sum of 12 and displaces a chosen opponent cube', () => {
    const base = scenario({}, 'regolith');
    const planet = base.board.planets.find((q) => q.cubes.length === 0)!;
    const target = 12;
    const spots = orbitals(base.board, planet);
    const values: number[] = [];
    for (let left = target; left > 0; left -= values[values.length - 1]) values.push(Math.min(6, left));
    const placed: Record<string, [number, number, number]> = {};
    values.forEach((v, i) => (placed[`p0d${i}`] = [spots[i].r, spots[i].c, v]));
    const s = scenario(placed, 'regolith');
    const p = s.board.planets[planet.id];
    while (planetFreeSlots(p) > 0) p.cubes.push(1);
    const check = conquerCheck(s, 0, p.id);
    expect(check.target).toBe(target);
    expect(check.ok).toBe(true);
    expect(check.replace).toEqual([1]);
    const before = s.players[1].cubesLeft;
    const after = apply(s, { type: 'conquer', planet: p.id, replace: 1 });
    expect(after.players[1].cubesLeft).toBe(before + 1);
    expect(after.board.planets[planet.id].cubes.filter((c) => c === 0)).toHaveLength(1);
    expect(after.board.planets[planet.id].cubes.filter((c) => c === 1)).toHaveLength(p.cubes.length - 1);
  });
  it('is also offered on a planet with room, next to a plain conquest', () => {
    const base = scenario({}, 'regolith');
    const planet = base.board.planets.find((q) => q.capacity >= 2)!;
    const spots = orbitals(base.board, planet);
    const values: number[] = [];
    for (let left = 12; left > 0; left -= values[values.length - 1]) values.push(Math.min(6, left));
    const placed: Record<string, [number, number, number]> = {};
    values.forEach((v, i) => (placed[`p0d${i}`] = [spots[i].r, spots[i].c, v]));
    const s = scenario(placed, 'regolith');
    const p = s.board.planets[planet.id];
    p.cubes = [1];
    expect(planetFreeSlots(p)).toBeGreaterThan(0);
    expect(conquerCheck(s, 0, p.id).ok).toBe(false);
    expect(conquerCheck(s, 0, p.id, true).ok).toBe(true);
    expect(legalActions(s)).toContainEqual({ type: 'conquer', planet: p.id, replace: 1 });
    const after = apply(s, { type: 'conquer', planet: p.id, replace: 1 });
    expect(after.board.planets[planet.id].cubes).toEqual([0]);
  });
});

describe('Science: Research spent to move the claim total', () => {
  const base = scenario({}, 'regolith');
  const planet = base.board.planets.find((q) => !q.start && !q.cubes.length && q.number > 6)!;
  const [o1, o2] = orbitals(base.board, planet);
  const short = (research: number) => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6] }, 'regolith', ['r-pioneering']);
    s.players[0].research = research;
    return s;
  };

  it('adds the Research needed, and only that', () => {
    const gap = planet.number - 6;
    const s = short(6);
    expect(conquerCheck(s, 0, planet.id)).toMatchObject({ ok: true, research: gap });
    const after = apply(s, { type: 'conquer', planet: planet.id });
    expect(after.players[0].research).toBe(6 - gap);
    expect(after.log.at(-1)?.text).toMatch(`spending ${gap} research`);
  });

  it('can’t spend the die’s lowest face', () => {
    expect(conquerCheck(short(planet.number - 6), 0, planet.id).ok).toBe(false);
    expect(conquerCheck(short(planet.number - 5), 0, planet.id).ok).toBe(true);
  });

  it('subtracts from an orbit over the target', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, 6] }, 'regolith', ['r-pioneering']);
    s.players[0].research = 6;
    expect(conquerCheck(s, 0, planet.id)).toMatchObject({ ok: true, research: 12 - planet.number });
  });

  it('spends nothing when the mechs make the total', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, planet.number - 6] }, 'regolith', ['r-pioneering']);
    s.players[0].research = 5;
    expect(conquerCheck(s, 0, planet.id).research).toBeUndefined();
    expect(apply(s, { type: 'conquer', planet: planet.id }).players[0].research).toBe(5);
  });

  it('never stops an exact total, even with no Research at all', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, planet.number - 6] }, 'regolith', ['r-pioneering']);
    s.players[0].research = 0;
    expect(conquerCheck(s, 0, planet.id).ok).toBe(true);
  });
});

describe('Barricade tactic card (Regolith)', () => {
  it('is a tactic card in the Regolith deck with 2 copies', () => {
    const cardDef = REGOLITH_DECKS.tactics.find((c) => c.id === 'r-barricade');
    expect(cardDef).toBeDefined();
    expect(cardDef!.name).toBe('Barricade');
    expect(cardDef!.text).toBe('Place two barriers.');
    expect(cardDef!.count).toBe(2);
    expect(cardDef!.category).toBe('movement');
    expect(cardDef!.status).toBe('new');
    expect(cardDef!.effect).toBe('barrier');
    expect(cardKind('r-barricade')).toBe('tactic');
  });

  it('playing the card asks to place two barriers on empty spaces', () => {
    let s = scenario({ p0d0: [2, 1, 6], p1d0: [2, 5, 5] }, 'regolith');
    const me = s.turn.player;
    toRow(s, 'tactic', 'r-barricade');
    s.pending.unshift({ kind: 'takeCard', player: me, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending[0]).toMatchObject({ kind: 'placeBarrier', player: me, placed: [] });
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'placeBarrier')).toBe(true);
    // Cannot place on planets
    const planet = s.board.planets[0];
    expect(legal).not.toContainEqual({ type: 'placeBarrier', cell: { r: planet.r, c: planet.c } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: planet.r, c: planet.c } })).toThrow(/Barriers go on spaces/);
    // Cannot place on an occupied space (ship)
    expect(legal).not.toContainEqual({ type: 'placeBarrier', cell: { r: 2, c: 1 } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: 2, c: 1 } })).toThrow(/Barriers go on empty spaces/);

    // Place the first barrier on (0, 3)
    s = apply(s, { type: 'placeBarrier', cell: { r: 0, c: 3 } });
    expect(s.barriers).toEqual([{ r: 0, c: 3, owner: me }]);
    expect(s.pending[0]).toMatchObject({ kind: 'placeBarrier', player: me, placed: [{ r: 0, c: 3 }] });

    // Cannot place second barrier on the same space
    expect(legalActions(s)).not.toContainEqual({ type: 'placeBarrier', cell: { r: 0, c: 3 } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: 0, c: 3 } })).toThrow(/Barriers go on empty spaces/);

    // Place the second barrier on (0, 4)
    s = apply(s, { type: 'placeBarrier', cell: { r: 0, c: 4 } });
    expect(s.barriers).toEqual([
      { r: 0, c: 3, owner: me },
      { r: 0, c: 4, owner: me },
    ]);
    expect(s.pending).toHaveLength(0);

    // The barriers now block moves through those spaces
    expect(isEmptySpace(s, { r: 0, c: 3 })).toBe(false);
    expect(isEmptySpace(s, { r: 0, c: 4 })).toBe(false);
  });
});

describe('Kinetic Shunt tactic card (Regolith)', () => {
  it('is a tactic card in the Regolith deck with 2 copies', () => {
    const cardDef = REGOLITH_DECKS.tactics.find((c) => c.id === 'r-kinetic-shunt');
    expect(cardDef).toBeDefined();
    expect(cardDef!.name).toBe('Kinetic Shunt');
    expect(cardDef!.subtitle).toBe('Push any mech 4 spaces');
    expect(cardDef!.text).toBe('Choose any mech. Push it up to 4 spaces in a straight line.');
    expect(cardDef!.count).toBe(2);
    expect(cardDef!.category).toBe('movement');
    expect(cardDef!.status).toBe('new');
    expect(cardDef!.effect).toBe('kinetic-shunt');
    expect(cardKind('r-kinetic-shunt')).toBe('tactic');
  });

  it('playing the card asks to choose a mech and pushes it up to 4 spaces in a straight line', () => {
    let s = scenario({ p0d0: [2, 1, 6], p1d0: [2, 5, 5] }, 'regolith');
    const me = s.turn.player;
    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: me, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending[0]).toMatchObject({ kind: 'kineticShunt', player: me });
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'kineticShunt')).toBe(true);

    // Can target own or enemy mechs
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d0')).toBe(true);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p1d0')).toBe(true);

    // Cannot push into an occupied space or planet or non-straight line
    const planet = s.board.planets[0];
    expect(legal).not.toContainEqual({ type: 'kineticShunt', die: 'p0d0', to: { r: planet.r, c: planet.c } });
    expect(() => apply(s, { type: 'kineticShunt', die: 'p0d0', to: { r: planet.r, c: planet.c } })).toThrow(/Not a valid push destination/);

    // Push p1d0 right: from (2,5), (2,6) is empty (+1), (2,7) is empty (+2), (2,8) is empty (+3)
    const canPushTo = shuntTargets(s, at(s, 'p1d0'));
    expect(canPushTo).toContainEqual({ r: 2, c: 6 });
    expect(canPushTo).toContainEqual({ r: 2, c: 7 });
    expect(canPushTo).toContainEqual({ r: 2, c: 8 });

    // Apply the push to (2, 8)
    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: { r: 2, c: 8 } });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: 2, c: 8 });
    expect(s.pending).toHaveLength(0);
  });

  it('can push an enemy mech off an objective perimeter to break contested orbit', () => {
    const base = BASE.regolith;
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const [o1, , o3] = orbitals(base.board, planet);
    let s = scenario({ p0d0: [o1.r, o1.c, planet.number], p1d0: [o3.r, o3.c, 6] }, 'regolith');
    expect(conquerCheck(s, 0, planet.id).blocked).toBe(true);
    expect(conquerCheck(s, 0, planet.id).ok).toBe(false);

    // Play Kinetic Shunt to shove enemy off the perimeter
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const target = shuntTargets(s, at(s, 'p1d0')).find((c) => !orbitals(s.board, planet).some((p) => p.r === c.r && p.c === c.c))!;
    expect(target).toBeDefined();

    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: target });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: target.r, c: target.c });

    // Now contested orbit is cleared and conquest is allowed!
    expect(conquerCheck(s, 0, planet.id).blocked).toBeUndefined();
    expect(conquerCheck(s, 0, planet.id).ok).toBe(true);
  });

  it('logs "their" when pushing a friendly mech and auto-resolves when no mechs can be shunted', () => {
    let s = scenario({ p0d0: [4, 4, 3] }, 'regolith');
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });

    const target = shuntTargets(s, at(s, 'p0d0'))[0];
    s = apply(s, { type: 'kineticShunt', die: 'p0d0', to: target });
    expect(s.log[s.log.length - 1].text).toMatch(/pushes their Tactician/);

    // If kineticShunt is pending but no mechs are on board, settle auto-resolves it
    s.dice.forEach((d) => (d.loc = { zone: 'scrapyard' }));
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    settle(s);
    expect(s.pending.some((p) => p.kind === 'kineticShunt')).toBe(false);
  });

  it('can push mechs through an ice tunnel and out the other side', () => {
    let s = scenario({ p0d0: [1, 4, 3] }, 'regolith');
    const gateA = { r: 2, c: 4 };
    const gateB = { r: 7, c: 2 };
    s.gates = [gateA, gateB];

    // p0d0 is at (1,4). Pushing South (1,0) reaches Gate A (2,4) in 1 space.
    // Traversing to Gate B (7,2) is step 2.
    // Continuing South from Gate B: (8,2) is step 3.
    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining(gateA),
        expect.objectContaining(gateB),
        expect.objectContaining({ r: 8, c: 2 }),
        expect.objectContaining({ r: 3, c: 4 }),
      ]),
    );

    // Apply push through the ice tunnel
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    s = apply(s, { type: 'kineticShunt', die: 'p0d0', to: { r: 8, c: 2 } });
    expect(at(s, 'p0d0').loc).toEqual({ zone: 'board', r: 8, c: 2 });
    // In the engine's words: the UI shows it as an ice tunnel.
    expect(s.log[s.log.length - 1].text).toMatch(/pushes their Tactician.*through a warp gate/);

    // A straight push says nothing of the gates, even with a pair on the map.
    const straight = scenario({ p0d0: [1, 4, 3] }, 'regolith');
    straight.gates = [gateA, gateB];
    straight.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const pushed = apply(straight, { type: 'kineticShunt', die: 'p0d0', to: { r: 0, c: 4 } });
    expect(pushed.log[pushed.log.length - 1].text).not.toMatch(/warp gate/);

    // If Gate B is blocked by an enemy mech, pushing through the tunnel is blocked
    const blocked = scenario({ p0d0: [1, 4, 3], p1d0: [7, 2, 6] }, 'regolith');
    blocked.gates = [gateA, gateB];
    const blockedTargets = shuntTargets(blocked, at(blocked, 'p0d0'));
    expect(blockedTargets).toContainEqual(expect.objectContaining(gateA));
    expect(blockedTargets).not.toContainEqual(expect.objectContaining(gateB));
    expect(blockedTargets).not.toContainEqual(expect.objectContaining({ r: 8, c: 2 }));
  });

  it('Hex board: mechs can be shunted along all 6 hexagonal directions', () => {
    const s = quickStart(2, 42, 'regolith', 'alpha-hex');
    const hexSpaces = spaces(s.board);
    const candidate = hexSpaces.find((c) => {
      const targets = shuntTargets(s, { id: 'test', owner: 0, value: 3, loc: { zone: 'board', r: c.r, c: c.c }, rolls: 0 });
      return targets.length >= 6;
    })!;

    const placed = arrange(s, { p0d0: [candidate.r, candidate.c, 3] });
    const targets = shuntTargets(placed, at(placed, 'p0d0'));
    expect(targets.length).toBeGreaterThanOrEqual(6);

    placed.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const target = targets[0];
    const next = apply(placed, { type: 'kineticShunt', die: 'p0d0', to: target });
    expect(at(next, 'p0d0').loc).toEqual({ zone: 'board', r: target.r, c: target.c });
  });

  it('Obstacles: mechs and barriers block shunt paths cleanly', () => {
    const s = scenario({ p0d0: [2, 2, 3], p1d0: [2, 4, 6] }, 'regolith');
    s.barriers = [{ r: 4, c: 2, owner: 1 }];

    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toContainEqual(expect.objectContaining({ r: 2, c: 3 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 2, c: 4 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 2, c: 5 }));

    expect(targets).toContainEqual(expect.objectContaining({ r: 3, c: 2 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 4, c: 2 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 5, c: 2 }));
  });

  it('Boxed-in mech: a mech with 0 valid shunt destinations is not in legal actions', () => {
    const s = scenario(
      {
        p0d0: [2, 2, 3],
        p1d0: [1, 2, 6],
        p1d1: [3, 2, 5],
        p1d2: [2, 1, 4],
        p0d1: [6, 6, 2],
      },
      'regolith',
    );
    s.barriers = [{ r: 2, c: 3, owner: 1 }];

    expect(shuntTargets(s, at(s, 'p0d0'))).toHaveLength(0);
    expect(shuntTargets(s, at(s, 'p0d1')).length).toBeGreaterThan(0);

    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const legal = legalActions(s);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d1')).toBe(true);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d0')).toBe(false);
  });

  it('All mechs boxed in: playing Kinetic Shunt does not stall the game', () => {
    let s = scenario({ p0d0: [2, 2, 3] }, 'regolith');
    s.barriers = [
      { r: 1, c: 2, owner: 0 },
      { r: 3, c: 2, owner: 0 },
      { r: 2, c: 1, owner: 0 },
      { r: 2, c: 3, owner: 0 },
    ];

    expect(shuntTargets(s, at(s, 'p0d0'))).toHaveLength(0);

    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: 0, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending.some((p) => p.kind === 'kineticShunt')).toBe(false);
  });

  it('Player can shunt friendly mech onto perimeter to claim objective', () => {
    const base = quickStart(2, 10, 'regolith');
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const [o1, o2] = orbitals(base.board, planet);

    const deltaR = o2.r - planet.r;
    const deltaC = o2.c - planet.c;
    const startR = o2.r + deltaR * 2;
    const startC = o2.c + deltaC * 2;

    let s = scenario({ p0d0: [o1.r, o1.c, 5], p0d1: [startR, startC, 3] }, 'regolith');
    const p = s.board.planets.find((x) => x.id === planet.id)!;
    p.number = 8;

    expect(conquerCheck(s, 0, p.id).ok).toBe(false);

    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const targets = shuntTargets(s, at(s, 'p0d1'));
    expect(targets).toContainEqual(expect.objectContaining(o2));

    s = apply(s, { type: 'kineticShunt', die: 'p0d1', to: o2 });
    expect(at(s, 'p0d1').loc).toEqual({ zone: 'board', r: o2.r, c: o2.c });
    expect(conquerCheck(s, 0, p.id).ok).toBe(true);
  });

  it('Patient: storing Kinetic Shunt and playing it later as stored tactic works', () => {
    let s = scenario({ p0d0: [2, 2, 3], p1d0: [2, 5, 4] }, 'regolith');
    s.players[0].skills = [{ id: 'patient', active: true }];

    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: 0, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true });

    expect(s.players[0].storedTactics).toContain('r-kinetic-shunt');
    expect(s.pending).toHaveLength(0);

    s = apply(s, { type: 'playStoredTactic', card: 'r-kinetic-shunt' });
    expect(s.pending[0]).toMatchObject({ kind: 'kineticShunt', player: 0 });

    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: { r: 2, c: 7 } });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: 2, c: 7 });
    expect(s.pending).toHaveLength(0);
  });

  it('Warp Gate / Ice Tunnel: starting on Gate A allows choosing any direction out of Gate B', () => {
    const s = scenario({ p0d0: [2, 2, 3] }, 'regolith');
    const gateA = { r: 2, c: 2 };
    const gateB = { r: 6, c: 5 };
    s.gates = [gateA, gateB];

    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toContainEqual(expect.objectContaining(gateB));
    expect(targets).toContainEqual(expect.objectContaining({ r: 5, c: 5 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 6, c: 6 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 1, c: 2 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 3, c: 2 }));
  });
});
