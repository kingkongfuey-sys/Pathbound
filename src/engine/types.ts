// The state of one run. Plain data only (no classes, no functions), so it can be copied, compared in tests
// and, from Stage 5, written to the database as-is.
import type { EquipmentSlot, PronounSetId, StatBlock } from '../content/types.ts';

/** The three stances of the core duel. Strike beats feint, feint beats guard, guard beats strike. */
export type Stance3 = 'strike' | 'guard' | 'feint';

/** How one round came out for the hero. `open` is a round spent on an item; `idle` is an open hero facing a guard. */
export type RoundResult = 'win' | 'lose' | 'clash' | 'open' | 'idle';

/** One thing worth writing in the account (a round, a spoil, a level, a purchase), as plain data. The screens turn these into lines of copy. */
export type AccountEvent =
  | {
      kind: 'round';
      monsterId: string;
      round: number;
      /** The hero's stance, or null when the round was spent on an item. */
      heroStance: Stance3 | null;
      foeStance: Stance3;
      result: RoundResult;
      heroSkillId: string | null;
      foeSkillId: string | null;
      itemId: string | null;
      /** Damage the foe took, and damage the hero took, after every reduction. */
      dealt: number;
      taken: number;
      heroHealed: number;
      foeHealed: number;
      heroHp: number;
      foeHp: number;
    }
  | { kind: 'victory'; monsterId: string }
  | { kind: 'defeat' }
  | { kind: 'flee'; blow: number; heroHp: number }
  | { kind: 'loot'; gold: number; itemIds: string[] }
  /** Experience gained from a victory, the new total, and the level that total stands at. */
  | { kind: 'xp'; gained: number; total: number; level: number }
  /** A level reached, with the base stats it added. */
  | { kind: 'level'; level: number; hp: number; attack: number; defense: number }
  | { kind: 'bought'; itemId: string; gold: number }
  | { kind: 'sold'; itemId: string; gold: number };

/** Where a fight came from, which decides where victory and flight lead. */
export type CombatOrigin =
  | { kind: 'scene' }
  | { kind: 'encounter'; chapterId: string; entryIndex: number };

/** A fight in progress. Every field is settled at a round boundary, so the state is always whole. */
export interface CombatState {
  monsterId: string;
  foeHp: number;
  /** The round about to be played, counting from 1. */
  round: number;
  /** What the foe will do this round. Drawn before the hero chooses, so quitting and returning cannot change it. */
  intent: Stance3;
  /** The foe's stance, if the hero's wits caught it this round. Always true when present. */
  tell: Stance3 | null;
  /** Rounds still to wait before each skill (hero's and foe's; ids are unique per story) can be used again. */
  cooldowns: Record<string, number>;
  origin: CombatOrigin;
  log: AccountEvent[];
}

/** Exact counts of what has happened in a run, kept for the closing account and the ledger's history. */
export interface RunTally {
  /** Choices taken in the narrative. */
  choices: number;
  /** Rounds of combat played (flight is not a round). */
  rounds: number;
  /** Foes brought down. */
  felled: number;
  /** Times the hero broke off a fight. */
  fled: number;
}

export interface RunState {
  storyId: string;
  contentVersion: number;
  heroName: string;
  archetypeId: string;
  pronouns: PronounSetId;
  /** Base stats. `stats.hp` is the base maximum; equipment can add to it. */
  stats: StatBlock;
  hp: number;
  gold: number;
  /** Experience points earned from felled foes, and the level they add up to (see growth.ts). */
  xp: number;
  level: number;
  inventory: Record<string, number>;
  equipment: Record<EquipmentSlot, string | null>;
  flags: Record<string, boolean>;
  sceneId: string;
  /** Scenes to resume after a random encounter finishes (innermost last). */
  returnStack: string[];
  /** Lines produced by the last choice's effects, shown at the top of the next scene. */
  pendingNotes: string[];
  loreUnlocked: string[];
  seed: string;
  /** Internal state of each named random stream, created the first time a stream is drawn from. */
  rng: Record<string, number[]>;
  /** The fight in progress, or null. */
  combat: CombatState | null;
  /** What the fight that has just ended did, told at the top of the next scene. Cleared by the next choice. */
  aftermath: AccountEvent[];
  tally: RunTally;
  status: 'playing' | 'ended';
  ending: { id: string; kind: 'victory' | 'death'; title: string } | null;
}

export interface ViewChoice {
  /** Position in the scene's choices array; pass this back to `choose`. */
  index: number;
  text: string;
  hint?: string;
}

export interface SceneView {
  sceneId: string;
  paragraphs: string[];
  notes: string[];
  choices: ViewChoice[];
  ending: { kind: 'victory' | 'death'; title: string } | null;
  /** Fight panel data when a fight is on, else null. */
  combat: CombatView | null;
  /** Shop panel data when the scene is a shop, else null. */
  shop: ShopView | null;
  aftermath: AccountEvent[];
}

export interface ShopView {
  /** What the stall sells, in the order the story lists it. `short` is the gold missing, 0 when affordable. */
  wares: Array<{ itemId: string; price: number; short: number }>;
  /** What the hero carries that the stall would buy, and for how much. Worn gear is never bought. */
  buys: Array<{ itemId: string; count: number; offer: number }>;
  gold: number;
}

export interface CombatView {
  /** `scene` fights have authored prose; `encounter` fights are opened by the app's own ambush line. */
  intro: 'scene' | 'encounter';
  monsterName: string;
  foeHp: number;
  foeMaxHp: number;
  round: number;
  tell: Stance3 | null;
  skills: Array<{ id: string; name: string; description: string; stance: Stance3 | 'any'; cooldown: number }>;
  items: Array<{ id: string; name: string; count: number; amount: number }>;
  log: AccountEvent[];
}
