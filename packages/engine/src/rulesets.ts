/**
 * The rule sets, by mode. Kept apart from rules.ts because building them needs the modes
 * (src/regolith), which use the whole engine: engine modules ask rulesOf (rules.ts), which never
 * imports a mode, so the engine loads the same whichever of its modules is imported first.
 */
import type { GameMode } from './data';
import { BASIC, REGOLITH } from './regolith';
import { defineRuleSets, type RuleSet } from './rules';

export const RULESETS: Record<GameMode, RuleSet> = { basic: BASIC, regolith: REGOLITH };

defineRuleSets(RULESETS);

/** The mode the lobby offers first, before a player has picked one. */
export const DEFAULT_MODE: GameMode = 'regolith';

/** Rule sets in menu order: Basic first, as the learning game. */
export const MODES: RuleSet[] = [RULESETS.basic, RULESETS.regolith];
