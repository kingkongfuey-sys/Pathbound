// The numbers the stats strip and the satchel show, worked out in one place so the screens only format them.
// Everything is exact (HP 12/20); equipment is already folded into `stats` and `maxHp`.
import type { LoadedStory, StatBlock } from '../content/types.ts';
import { effectiveStats } from './conditions.ts';
import { xpToNext } from './growth.ts';
import type { RunState } from './types.ts';

export interface Status {
  hp: number;
  maxHp: number;
  gold: number;
  currencySymbol: string;
  /** Position of the current scene's chapter in the story's ordered chapters. `index` counts from zero. */
  chapter: { index: number; count: number; title: string };
  /** Base stats plus equipment. */
  stats: StatBlock;
  level: number;
  xp: number;
  /** Experience still needed for the next level, or null at the top. */
  xpToNext: number | null;
}

export function statusOf(loaded: LoadedStory, run: RunState): Status {
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene) throw new Error(`Run state points at the scene "${run.sceneId}", which doesn't exist.`);
  const chapters = loaded.story.chapters;
  const index = chapters.findIndex((chapter) => chapter.id === scene.chapterId);
  const chapter = chapters[index];
  if (!chapter) throw new Error(`The scene "${scene.id}" belongs to the chapter "${scene.chapterId}", which story.json doesn't list.`);
  const stats = effectiveStats(loaded, run);
  return {
    hp: run.hp,
    maxHp: stats.hp,
    gold: run.gold,
    currencySymbol: loaded.story.currency.symbol,
    chapter: { index, count: chapters.length, title: chapter.title },
    stats,
    level: run.level,
    xp: run.xp,
    xpToNext: xpToNext(run),
  };
}
