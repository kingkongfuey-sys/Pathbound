// Works out what a save writes besides the run itself: the history row (exact figures for the ledger) and the
// codex unlocks (what the hero has met). Both are derived from the run at the moment of saving, and saves happen
// after every change, so nothing met can slip through between two saves: a foe is on the run the moment its fight
// opens, an item the moment it is carried. Unlocks are only ever added, never removed, which is what lets a death
// keep everything earned on the way to it.
import type { LoadedStory } from '../content/types.ts';
import { statusOf } from '../engine/status.ts';
import type { RunState } from '../engine/types.ts';
import { packSave, runProblem, SAVE_FORMAT } from './snapshot.ts';
import type { EntryRecord, SaveWrite, Unlock } from './types.ts';

export function entryOf(loaded: LoadedStory, run: RunState, runId: string, startedAt: string, now: string): EntryRecord {
  const archetype = loaded.story.archetypes.find((a) => a.id === run.archetypeId);
  const status = statusOf(loaded, run);
  const closed = run.status === 'ended' && run.ending !== null;
  return {
    id: runId,
    storyId: run.storyId,
    storyTitle: loaded.story.title,
    heroName: run.heroName,
    archetypeName: archetype ? archetype.name : run.archetypeId,
    seed: run.seed,
    startedAt,
    endedAt: closed ? now : null,
    outcome: run.ending && closed ? run.ending.kind : 'open',
    endingTitle: run.ending ? run.ending.title : null,
    chapterIndex: status.chapter.index,
    chapterCount: status.chapter.count,
    choices: run.tally.choices,
    rounds: run.tally.rounds,
    felled: run.tally.felled,
    fled: run.tally.fled,
    gold: run.gold,
    level: run.level,
  };
}

export function unlocksOf(loaded: LoadedStory, run: RunState): Unlock[] {
  const storyId = loaded.story.id;
  const found: Unlock[] = [{ storyId, kind: 'story', entryId: storyId }];
  const add = (kind: Unlock['kind'], entryId: string): void => {
    if (!found.some((u) => u.kind === kind && u.entryId === entryId)) found.push({ storyId, kind, entryId });
  };
  for (const id of run.loreUnlocked) add('lore', id);
  for (const id of Object.keys(run.inventory)) add('item', id);
  for (const id of Object.values(run.equipment)) if (id !== null) add('item', id);
  if (run.combat) add('monster', run.combat.monsterId);
  for (const event of run.aftermath) {
    if (event.kind === 'round' || event.kind === 'victory') add('monster', event.monsterId);
    if (event.kind === 'loot') for (const id of event.itemIds) add('item', id);
  }
  return found;
}

/** Everything one save writes, or the reason it must not be written. A run that fails `runProblem` is never saved. */
export function buildSaveWrite(
  loaded: LoadedStory,
  run: RunState,
  who: { runId: string; startedAt: string; appVersion: string },
  closes: SaveWrite['closes'],
  now: string,
): { write: SaveWrite } | { problem: string } {
  const problem = runProblem(loaded, run);
  if (problem !== null) return { problem };
  return {
    write: {
      active: {
        runId: who.runId,
        storyId: loaded.story.id,
        format: SAVE_FORMAT,
        appVersion: who.appVersion,
        contentVersion: run.contentVersion,
        savedAt: now,
        body: packSave(who.appVersion, who.runId, who.startedAt, run),
      },
      entry: entryOf(loaded, run, who.runId, who.startedAt, now),
      unlocks: unlocksOf(loaded, run),
      closes,
    },
  };
}
