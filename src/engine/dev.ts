// Dev-mode tools that act on a run, as pure functions: jump to any scene, restart the random streams from a new seed,
// and list what there is to jump to or force. The switches the loop itself honours (god-mode, a forced encounter) live
// in play.ts as `DevOptions`. Nothing here is reachable until the hidden dev setting is on, and all of it produces runs
// that pass the same integrity check as any other, so a dev-mode jump can be saved and resumed like a normal page.
import type { LoadedStory } from '../content/types.ts';
import { enterScene } from './play.ts';
import type { RunState } from './types.ts';

/** Put a living run at `sceneId`, dropping any fight, shop talk, pending encounter return or notes. Entering does what entering does. */
export function devJump(loaded: LoadedStory, run: RunState, sceneId: string): RunState {
  if (run.status === 'ended') throw new Error('This entry is closed; there is nowhere to jump to.');
  if (!loaded.scenes.has(sceneId)) throw new Error(`The story has no scene "${sceneId}".`);
  // A scene that ends by returning from an encounter needs somewhere to return to, so give it one: where the run was, or the start.
  const target = loaded.scenes.get(sceneId);
  const returns = target?.type === 'narrative' && target.choices.some((c) => c.target === '$return');
  const here = loaded.scenes.get(run.sceneId);
  const hereReturns = here?.type === 'narrative' && here.choices.some((c) => c.target === '$return');
  const back = returns ? [hereReturns ? loaded.story.start : run.sceneId] : [];
  return enterScene(loaded, { ...run, combat: null, aftermath: [], pendingNotes: [], returnStack: back }, sceneId);
}

/** Start every random stream again from `seed`, as if the run had begun with it. */
export function devReseed(run: RunState, seed: string): RunState {
  const trimmed = seed.trim();
  if (trimmed === '') throw new Error('A seed can\'t be empty.');
  return { ...run, seed: trimmed, rng: {} };
}

export interface SceneListing {
  id: string;
  type: string;
  chapterTitle: string;
}

/** Every scene, grouped in chapter order, for the jump list. */
export function devScenes(loaded: LoadedStory): SceneListing[] {
  const order = new Map(loaded.story.chapters.map((c, i) => [c.id, i] as const));
  const title = new Map(loaded.story.chapters.map((c) => [c.id, c.title] as const));
  return [...loaded.scenes.values()]
    .map((s) => ({ id: s.id, type: s.type, chapterId: s.chapterId, chapterTitle: title.get(s.chapterId) ?? s.chapterId }))
    .sort((a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0) || (a.id < b.id ? -1 : 1))
    .map(({ id, type, chapterTitle }) => ({ id, type, chapterTitle }));
}

export interface PoolListing {
  index: number;
  label: string;
}

/** The chapter's encounter pool, as something to pick from. `index` is what `DevOptions.force` takes. */
export function devPool(loaded: LoadedStory, chapterId: string): PoolListing[] {
  return (loaded.pools.get(chapterId) ?? []).map((entry, index) => ({
    index,
    label: entry.type === 'fight' ? `fight: ${loaded.monsters.get(entry.monsterId)?.name ?? entry.monsterId}` : `scene: ${entry.sceneId}`,
  }));
}
