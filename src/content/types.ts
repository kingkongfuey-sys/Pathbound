// Shared types for every content file. These mirror content/schema/*.json by hand; the schemas are the
// authority (they validate at load and at build) and these give the engine and screens typed access.

export type StatName = 'hp' | 'attack' | 'defense' | 'wits' | 'nerve';
export type Comparator = '>=' | '<=' | '>' | '<' | '==' | '!=';
export type PronounSetId = 'they' | 'she' | 'he';
export type EquipmentSlot = 'weapon' | 'head' | 'body' | 'trinket';
export type ItemType = EquipmentSlot | 'consumable';
export type Stance = 'strike' | 'guard' | 'feint' | 'any';

export type StatBlock = Record<StatName, number>;
export type StatModifiers = Partial<Record<StatName, number>>;

export type Condition =
  | { type: 'stat'; stat: StatName; op: Comparator; value: number }
  | { type: 'gold'; op: Comparator; value: number }
  | { type: 'item'; itemId: string; has?: boolean }
  | { type: 'flag'; flag: string; is?: boolean };

export type Effect =
  | { type: 'stat'; stat: StatName; delta: number; note: string }
  | { type: 'hp'; delta: number; note: string }
  | { type: 'gold'; delta: number; note: string }
  | { type: 'item'; itemId: string; change: 'give' | 'take'; quantity?: number; note: string }
  | { type: 'flag'; flag: string; value: boolean };

export interface Skill {
  id: string;
  name: string;
  description: string;
  stance: Stance;
  effect: { kind: 'bonusDamage' | 'reduceDamage' | 'heal'; amount: number };
  cooldown: number;
}

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  stats: StatBlock;
  startingSkills: Skill[];
  startingEquipment: string[];
  suggestedNames: string[];
  pronouns: { default: PronounSetId; selectable: boolean };
}

export interface EndingEntry {
  id: string;
  sceneId: string;
  title: string;
}

export interface Story {
  id: string;
  title: string;
  blurb: string;
  rating: 'all-ages' | 'teen' | 'mature';
  toneLine: string;
  version: number;
  start: string;
  theme: {
    colors: { prose: string; choices: string; statsBar: string; combatLog: string; background: string; accent: string };
    typefaceFeel: 'old-print' | 'inscribed';
  };
  currency: { name: string; symbol: string };
  archetypes: Archetype[];
  chapters: Array<{ id: string; title: string; summary: string }>;
  loreEntries: Array<{ id: string; title: string; text: string }>;
  endings: { victory: EndingEntry[]; death: EndingEntry[]; defaultDeath: string };
  codexSummary: string;
}

export interface Choice {
  text: string;
  hint?: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
  encounterChance?: number;
}

export interface Outcome {
  sceneId: string;
  effects?: Effect[];
}

interface SceneBase {
  id: string;
  chapterId: string;
  prose: string[];
  unlocksLore?: string[];
}

export interface NarrativeScene extends SceneBase {
  type: 'narrative';
  choices: Choice[];
}
export interface FightScene extends SceneBase {
  type: 'fight';
  fight: { monsterId: string; onVictory: Outcome; onFlee: Outcome; onDefeat?: string };
}
export interface ShopScene extends SceneBase {
  type: 'shop';
  shop: { stock: Array<{ itemId: string; price: number }>; leaveSceneId: string };
}
export interface EndingScene extends SceneBase {
  type: 'ending';
}
export type Scene = NarrativeScene | FightScene | ShopScene | EndingScene;

export interface Monster {
  id: string;
  name: string;
  codexEntry: string;
  hp: number;
  damage: { min: number; max: number };
  styleTendencies: { strike: number; guard: number; feint: number };
  skills: Skill[];
  lootTable: {
    items: Array<{ itemId: string; weight: number }>;
    noneWeight?: number;
    gold: { min: number; max: number };
  };
  boss: boolean;
}

export interface Item {
  id: string;
  name: string;
  flavor: string;
  codexEntry: string;
  type: ItemType;
  modifiers?: StatModifiers;
  use?: { kind: 'heal'; amount: number };
  value: number;
  purchasable: boolean;
}

export type EncounterEntry =
  | { type: 'fight'; monsterId: string; weight: number; conditions?: Condition[]; fleeEffects?: Effect[] }
  | { type: 'discovery' | 'flavor'; sceneId: string; weight: number; conditions?: Condition[] };

export interface EncounterPool {
  chapterId: string;
  entries: EncounterEntry[];
}

/** A story that has passed schema and integrity checks. Lookups are by id. */
export interface LoadedStory {
  story: Story;
  scenes: Map<string, Scene>;
  monsters: Map<string, Monster>;
  items: Map<string, Item>;
  pools: Map<string, EncounterEntry[]>;
}

/** A colour with a strength, for the washes that make a surface: `color` is #rrggbb, `alpha` runs 0 to 1. */
export interface Wash {
  color: string;
  alpha: number;
}

/**
 * A binding: the whole look of the app's own chrome, from content/themes/<id>.json. Mirrors theme.schema.json by hand.
 * It never touches a story's words or rules, only how the book is dressed.
 */
export interface Theme {
  id: string;
  name: string;
  note: string;
  order: number;
  default?: true;
  scheme: 'light' | 'dark';
  colors: {
    paper: string;
    ink: string;
    inkFaded: string;
    rule: string;
    accent: string;
    accentWet: string;
    choices?: string;
    statsBar?: string;
    combatLog?: string;
    inkRule?: string;
    marginRule?: string;
  };
  fonts: { display: string; text: string; load: string[] };
  type: { emphasis: 'italic' | 'normal'; scale: number; displayScale: number; figures?: 'lining' | 'oldstyle' };
  surface: { kind: 'paper' | 'screen' | 'glade'; lit: Wash; edge: Wash; trace?: Wash };
  marks: { rule: 'hand' | 'laser' | 'vine'; leader: 'dotted' | 'dashed'; glow: number; underline: number };
}

/** One thing wrong with one content file: which file, where inside it, and what. */
export interface ContentProblem {
  file: string;
  where: string;
  message: string;
}
