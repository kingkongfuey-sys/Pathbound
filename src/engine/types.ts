// The state of one run. Plain data only (no classes, no functions), so it can be copied, compared in tests
// and, from Stage 5, written to the database as-is.
import type { EquipmentSlot, PronounSetId, StatBlock } from '../content/types.ts';

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
}
