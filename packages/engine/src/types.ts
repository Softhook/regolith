import type { GameMode } from './data';

export type PlayerId = number;

export interface Cell {
  r: number;
  c: number;
}

export type CellKind = 'off' | 'space' | 'planet';

export interface BoardCell {
  kind: CellKind;
  /** Index of the tile this cell belongs to, -1 when off-board. */
  tile: number;
  planet?: number;
  void?: boolean;
}

export interface Planet {
  id: number;
  number: number;
  capacity: number;
  /** Owners of the cubes on this planet, in placement order. */
  cubes: PlayerId[];
  start: boolean;
  r: number;
  c: number;
}

/** The surface a map lies on: Mars or one of its moons, Phobos and Deimos. */
export type World = 'phobos' | 'deimos' | 'mars';

export interface Board {
  mapId: string;
  mapName: string;
  rows: number;
  cols: number;
  /** The world the board is on, which its artwork shows (MapDef.world). Its cells are flat-topped hexes in axial coordinates (board.ts). */
  world: World;
  cells: BoardCell[][];
  planets: Planet[];
}

export type DieLoc = { zone: 'board'; r: number; c: number } | { zone: 'scrapyard' } | { zone: 'reserve' };

export interface Die {
  id: string;
  owner: PlayerId;
  value: number;
  loc: DieLoc;
  /** Increments every time the die is rolled; the UI animates a tumble on change. */
  rolls: number;
}

export interface OwnedSkill {
  id: string;
  /** Skills taken during your turn only take effect from the next player's turn. */
  active: boolean;
  /** Ruthless: disabled until the start of this player's next turn. */
  disabledUntil?: PlayerId;
}

export interface PlayerConfig {
  name: string;
  color: string;
  ai: boolean;
  /** Strength of an AI player, 1 (weakest) to 5; see packages/ai. */
  aiLevel?: number;
}

export interface PlayerState extends PlayerConfig {
  id: PlayerId;
  dominance: number;
  research: number;
  missiles: number;
  cubesLeft: number;
  /**
   * Home shipyard (Regolith): the planet this player may always deploy to. Their starting planet; when
   * their last cube there leaves, it goes with the cube (Relocation) or to another of their planets.
   */
  home?: number;
  skills: OwnedSkill[];
  ambitionTokens: number;
  /** Actions lost on the next turn (Sabotage). */
  actionPenalty: number;
  /** Plan Ahead: counts down at the end of each of the owner's turns while > 0. */
  planAhead: number;
  /** Momentum: bonus turns queued (number of actions each). */
  bonusTurns: number[];
  /** Patient: stored Tactic cards waiting to be played at the end of a turn. */
  storedTactics?: string[];
  /** Card picks still owed when Momentum interrupted the card phase; taken in the bonus turn's. */
  carriedPicks?: number;
  /** How many of the carried picks were earned by Conquer actions (Profiteering). */
  carriedConquerPicks?: number;
  /** Turns in a row this player ended without spending an action (the AI uses it to avoid stalemates). */
  idleTurns?: number;
  /** What this player has done so far, for the game over (counted as it happens: the log keeps only the latest entries). */
  stats?: PlayerStats;
}

/** A player's tally over the game, from its start. Missing from a game saved before it was kept. */
export interface PlayerStats {
  battlesWon: number;
  battlesLost: number;
  /** Enemy ships destroyed, in battle or by a card. */
  shipsDestroyed: number;
  /** This player's ships destroyed by someone else. */
  shipsLost: number;
  /** Planets conquered (or seized through Take Over). */
  planetsTaken: number;
  /** Cards gained: taken from the market (Skills, Tactics, Expansions) or drawn by a card (Change of Heart). */
  cardsTaken: number;
}

export type DeckKind = 'skill' | 'tactic';

export interface Market {
  skillDeck: string[];
  skillRow: string[];
  skillDiscard: string[];
  tacticDeck: string[];
  tacticRow: string[];
  tacticDiscard: string[];
  expansions: number;
}

export interface TurnState {
  player: PlayerId;
  number: number;
  phase: 'actions' | 'cards';
  actionsLeft: number;
  freeDeploys: number;
  moved: Record<string, number>;
  abilityUsed: Record<string, boolean>;
  /** Values each die has shown this turn (for Reconfigure). */
  seen: Record<string, number[]>;
  conquests: number;
  /** Conquer actions taken this turn; unlike `conquests`, Take Over cubes don't count (Profiteering). */
  conquered?: number;
  attacked: boolean;
  /** Players who have already destroyed an enemy ship this turn ("first time each turn" triggers). */
  destroyedBy: PlayerId[];
  /** Once-per-turn effects already used. */
  oncePerTurn: OncePerTurn[];
  bonus: boolean;
  /**
   * Who plays the next regular turn, when this turn is a bonus turn that interrupted the turn
   * order (Momentum taken on someone else's turn).
   */
  resume?: PlayerId;
  /** Other players who placed a cube through Take Over during this turn (one entry per cube). */
  offTurnCubes?: PlayerId[];
  /** CE Curious: whether the additional Move or Research action was used this turn. */
  curiousUsed?: boolean;
  /** Patient: whether a stored Tactic was played this turn. */
  storedTacticPlayed?: boolean;
  /** Whether an action was spent this turn (free abilities don't count). */
  acted?: boolean;
}

/** Effects limited to once per turn. 'cunning' is the second use of a ship ability. */
export type OncePerTurn = 'composed' | 'ambitious' | 'flexible' | 'resourceful' | 'tactical' | 'cunning';

/** The two sides of a battle. */
export type CombatRole = 'attacker' | 'defender';

export interface CombatSide {
  player: PlayerId;
  die: string;
  ship: number;
  dice: number[];
  missile: boolean;
}

export interface CombatPending {
  kind: 'combat';
  id: number;
  attacker: CombatSide;
  defender: CombatSide;
  /** Where the attacker returns if repelled (the space it attacked from). */
  from: Cell;
  /** The defender's space. */
  at: Cell;
  /** A ranged attack (a power): the attacker fired from where it stands and doesn't advance if it wins. */
  ranged?: true;
}

export type Pending =
  | { kind: 'setupRoll'; player: PlayerId; rerolled: boolean }
  | { kind: 'skillDraft'; player: PlayerId; options: string[] }
  | { kind: 'placeStart'; player: PlayerId }
  /** Setup: place your starting ships, one at a time, in orbital positions of your starting planet. */
  | { kind: 'placeShips'; player: PlayerId; planet: number }
  | CombatPending
  /** Dangerous: before the dice are rolled, the defender may destroy both ships. */
  | { kind: 'dangerous'; player: PlayerId; attacker: string; defender: string; from: Cell; ranged?: true }
  /**
   * The player chooses the number of a ship that was just rolled: Clever, one of `options` (the reconfigured
   * number ± 1); Calculating, any number for a ship going to the scrapyard.
   */
  | { kind: 'clever'; player: PlayerId; die: string; options?: number[]; source?: 'calculating' | 'clever' }
  | { kind: 'advance'; player: PlayerId; die: string; to: Cell }
  | { kind: 'infamy'; player: PlayerId }
  /** `conquer`: how many of the picks were earned by Conquer actions (Profiteering may take a missile instead). */
  | { kind: 'takeCard'; player: PlayerId; count: number; conquer?: number }
  | { kind: 'peek'; player: PlayerId; deck: DeckKind; top: string; store?: boolean }
  /** `cannotDiscard`: a card that must be kept (Prideful, just taken). */
  | { kind: 'discardSkill'; player: PlayerId; reason?: 'limit'; cannotDiscard?: string }
  | { kind: 'placeExpansion'; player: PlayerId; die: string }
  | { kind: 'showOfForce'; player: PlayerId }
  | { kind: 'warpGate'; player: PlayerId; placed: Cell[] }
  | { kind: 'placeBarrier'; player: PlayerId; placed: Cell[] }
  | { kind: 'kineticShunt'; player: PlayerId }
  | { kind: 'changeOfHeart'; player: PlayerId }
  /** Prideful: take Prideful from victim who lost a ship. */
  | { kind: 'prideful'; player: PlayerId; victim: PlayerId }
  /** Ruthless: disable one active skill of the victim. */
  | { kind: 'ruthless'; player: PlayerId; victim: PlayerId }
  /** Patient, when taken: may take a face-up Tactic and store it. */
  | { kind: 'patientTactic'; player: PlayerId }
  /** Unveil the Fleet. */
  | { kind: 'unveil'; player: PlayerId; rerolled: string[] };

/** What a log entry reports, so the UI can react (sounds, toasts) without parsing its text. */
export type LogEvent =
  | 'victory'
  | 'infamy'
  | 'seize'
  | 'conquer'
  | 'startPlanet'
  | 'battleWon'
  | 'repelled'
  | 'missile'
  | 'shipDestroyed'
  | 'cardTaken'
  | 'cardPlayed'
  | 'expansion'
  | 'discard'
  | 'breakthrough';

/** A skill's bonus, as actually gained (after the research and dominance limits). */
export interface Gains {
  actions?: number;
  research?: number;
  dominance?: number;
}

export interface LogEntry {
  id: number;
  player?: PlayerId;
  text: string;
  event?: LogEvent;
  /** Ids of the planets the text names as `planet N`, in order, so the UI can show their names. */
  planets?: number[];
  /** The card an entry is about (played, taken or used), so the UI can show it. */
  card?: string;
  /** What a skill firing by itself (Hostile, Plundering, Arrogant…) gave, so the UI can point at just that. */
  gains?: Gains;
  /** A player's turn starting: the log's headings, with everything else under them. */
  turn?: true;
}

/** A barrier on the map, and the player whose ship placed it. */
export interface Barrier extends Cell {
  owner: PlayerId;
}

export interface GameState {
  version: 1;
  mode: GameMode;
  seed: number;
  rng: number;
  board: Board;
  players: PlayerState[];
  dice: Die[];
  market: Market;
  gates: Cell[];
  /**
   * Barriers on the map (the Wisp and Barricade place them), for good: nothing moves into, is deployed on or
   * shoots through their spaces. Absent in a game that never had one.
   */
  barriers?: Barrier[];
  turn: TurnState;
  /** Decisions waiting to be made; the head is the current one. */
  pending: Pending[];
  phase: 'setup' | 'play' | 'over';
  winner: PlayerId | null;
  combatCounter: number;
  log: LogEntry[];
  logCounter: number;
}

export type ShipAbility = 'freeAttack' | 'carry' | 'swap' | 'change';

export type Action =
  // setup
  | { type: 'setupKeep' }
  | { type: 'setupReroll' }
  | { type: 'draftSkill'; skill: string }
  | { type: 'placeStart'; planet: number }
  | { type: 'placeShip'; die: string; to: Cell }
  // phase 1 actions
  | { type: 'move'; die: string; to: Cell }
  /** `from`: the space to attack from (moveOptions launches); the nearest when left out. */
  | { type: 'attack'; die: string; target: string; from?: Cell }
  /** A ship power's action (ShipHooks.action), aimed at a ship, a space or both. */
  | { type: 'power'; die: string; target?: string; to?: Cell }
  | { type: 'deploy'; die: string; to: Cell }
  | { type: 'reconfigure'; die: string }
  | { type: 'research' }
  | { type: 'conquer'; planet: number; replace?: PlayerId }
  | { type: 'endTurn' }
  // ship abilities
  | { type: 'freeAttack'; die: string; target: string }
  | { type: 'carry'; die: string; passenger: string; to: Cell; drop: Cell }
  | { type: 'swap'; die: string; other: string }
  | { type: 'change'; die: string; value: 3 | 5 }
  // activated skills
  | { type: 'composed' }
  | { type: 'ambitious' }
  | { type: 'flexible'; die: string; delta: 1 | -1 }
  | { type: 'resourceful'; die: string }
  /** Tactical's 1-space move (`to`) or attack (`target`); with `passenger` + `drop` it is a Flagship transport. */
  | { type: 'tactical'; die: string; to?: Cell; target?: string; passenger?: string; drop?: Cell }
  // combat & decisions
  | { type: 'missile'; by: PlayerId; side: CombatRole }
  | { type: 'dangerous'; destroy: boolean }
  | { type: 'clever'; value: number }
  | { type: 'resolveCombat' }
  | { type: 'advance'; move: boolean }
  | { type: 'infamy'; planet: number }
  | { type: 'takeCard'; deck: DeckKind | 'expansion'; index: number; store?: boolean }
  | { type: 'peekChoice'; takeTop: boolean }
  /** Profiteering: take 1 missile instead of a card earned by conquering. */
  | { type: 'profiteer' }
  | { type: 'discardSkill'; skill: string }
  | { type: 'placeExpansion'; to: Cell | null }
  | { type: 'showOfForce'; die: string }
  | { type: 'warpGate'; cell: Cell }
  | { type: 'placeBarrier'; cell: Cell }
  | { type: 'kineticShunt'; die: string; to: Cell }
  | { type: 'changeOfHeart'; skill: string }
  | { type: 'prideful'; take: boolean }
  | { type: 'ruthless'; skill?: string }
  | { type: 'playStoredTactic'; card: string }
  /** Patient, when taken: store the face-up Tactic at `index`, or none if left out. */
  | { type: 'patientTactic'; index?: number }
  | { type: 'unveilReroll'; die: string }
  | { type: 'unveilDeploy'; die: string; to: Cell }
  | { type: 'unveilDone' };

export class RuleError extends Error {}
