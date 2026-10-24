// Turning a run into something that can be written down, and judging whether something read back can be trusted.
// A save is an envelope: a format number (the layout of the save itself), the app version that wrote it, and the
// run. Reading one back goes through four gates, in order, and stops at the first that fails: is it from the
// future (a newer format or newer story content), is it text that parses, is it the right shape, does it still make
// sense against the story (every id exists, HP and gear add up, a fight in progress is whole). Nothing here throws on
// bad input; a bad save comes back as a verdict the screens can explain. `runProblem` also guards every write, so a
// broken mid-fight state is refused before it can overwrite the last good save.
import type { LoadedStory } from '../content/types.ts';
import { effectiveStats } from '../engine/conditions.ts';
import { combatProblem } from '../engine/combat.ts';
import { levelFor } from '../engine/growth.ts';
import type { RunState } from '../engine/types.ts';
import type { ActiveRow } from './types.ts';

/** The layout of a save. Raise it when RunState changes in a way old saves cannot satisfy, and write a migration. */
export const SAVE_FORMAT = 2;

export interface Envelope {
  format: number;
  appVersion: string;
  runId: string;
  startedAt: string;
  run: RunState;
}

export function packSave(appVersion: string, runId: string, startedAt: string, run: RunState): string {
  const envelope: Envelope = { format: SAVE_FORMAT, appVersion, runId, startedAt, run };
  return JSON.stringify(envelope);
}

export type OpenedSave =
  | { kind: 'ok'; run: RunState; runId: string; startedAt: string; appVersion: string }
  /** Written by a newer build or against newer story content: not damaged, but this build cannot honour it. */
  | { kind: 'newer'; reason: string }
  | { kind: 'damaged'; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isWhole = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isText = (v: unknown): v is string => typeof v === 'string';
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);

/**
 * How a run saved in an older format becomes a run this build can read: each entry takes the run from format n to
 * n + 1. Never edit one that has shipped; add another. Format 1 (Stage 5) had no experience or levels: such a run
 * carries on from level 1 with nothing earned, the one honest answer, since the foes it felled paid nothing then.
 */
const MIGRATIONS: Array<(run: Record<string, unknown>) => Record<string, unknown>> = [
  (run) => ({ ...run, xp: 0, level: 1 }),
];

export function migrateRun(fromFormat: number, run: Record<string, unknown>): Record<string, unknown> {
  let current = run;
  for (let format = fromFormat; format < SAVE_FORMAT; format += 1) {
    const step = MIGRATIONS[format - 1];
    if (!step) throw new Error(`There is no way to bring a format ${format} save forward.`);
    current = step(current);
  }
  return current;
}

const STATS = ['hp', 'attack', 'defense', 'wits', 'nerve'] as const;
const SLOTS = ['weapon', 'head', 'body', 'trinket'] as const;
const STANCES = ['strike', 'guard', 'feint'];
const RESULTS = ['win', 'lose', 'clash', 'open', 'idle'];

function eventShapeProblem(event: unknown): string | null {
  if (!isObject(event)) return 'a combat event is not an object';
  switch (event['kind']) {
    case 'round': {
      const stances = (event['heroStance'] === null || STANCES.includes(event['heroStance'] as string)) && STANCES.includes(event['foeStance'] as string);
      const ids = isText(event['monsterId']) && (event['heroSkillId'] === null || isText(event['heroSkillId'])) && (event['foeSkillId'] === null || isText(event['foeSkillId'])) && (event['itemId'] === null || isText(event['itemId']));
      const numbers = ['round', 'dealt', 'taken', 'heroHealed', 'foeHealed', 'heroHp', 'foeHp'].every((k) => isWhole(event[k]));
      return stances && ids && numbers && RESULTS.includes(event['result'] as string) ? null : 'a round in the account is malformed';
    }
    case 'victory':
      return isText(event['monsterId']) ? null : 'a victory in the account is malformed';
    case 'defeat':
      return null;
    case 'flee':
      return isWhole(event['blow']) && isWhole(event['heroHp']) ? null : 'a flight in the account is malformed';
    case 'loot':
      return isWhole(event['gold']) && isTexts(event['itemIds']) ? null : 'the spoils in the account are malformed';
    case 'xp':
      return isWhole(event['gained']) && isWhole(event['total']) && isWhole(event['level'], 1) ? null : 'the experience in the account is malformed';
    case 'level':
      return ['level', 'hp', 'attack', 'defense'].every((k) => isWhole(event[k])) ? null : 'a level in the account is malformed';
    case 'bought':
    case 'sold':
      return isText(event['itemId']) && isWhole(event['gold']) ? null : 'a purchase in the account is malformed';
    default:
      return 'the account holds an event of a kind this build does not know';
  }
}

/** Is `value` shaped like a RunState? Types and ranges only; whether it fits the story is `runProblem`'s job. */
export function shapeProblem(value: unknown): string | null {
  if (!isObject(value)) return 'the run is not an object';
  const run = value;
  for (const key of ['storyId', 'heroName', 'archetypeId', 'sceneId', 'seed']) {
    if (!isText(run[key]) || run[key] === '') return `"${key}" is missing or empty`;
  }
  if (!isWhole(run['contentVersion'], 1)) return '"contentVersion" is not a whole number from 1';
  if (!['they', 'she', 'he'].includes(run['pronouns'] as string)) return '"pronouns" is not one of they, she, he';
  if (!isObject(run['stats']) || !STATS.every((k) => isWhole((run['stats'] as Record<string, unknown>)[k]))) return '"stats" is not a full set of whole numbers';
  if (!isWhole(run['hp'])) return '"hp" is not a whole number';
  if (!isWhole(run['gold'])) return '"gold" is not a whole number';
  if (!isWhole(run['xp']) || !isWhole(run['level'], 1)) return '"xp" or "level" is not a whole number';
  if (!isObject(run['inventory']) || !Object.values(run['inventory']).every((n) => isWhole(n, 1))) return '"inventory" holds something that is not a positive count';
  const equipment = run['equipment'];
  if (!isObject(equipment) || !SLOTS.every((s) => equipment[s] === null || isText(equipment[s]))) return '"equipment" does not name the four slots';
  if (!isObject(run['flags']) || !Object.values(run['flags']).every((b) => typeof b === 'boolean')) return '"flags" holds something that is not true or false';
  if (!isTexts(run['returnStack']) || !isTexts(run['pendingNotes']) || !isTexts(run['loreUnlocked'])) return 'a list of text is not a list of text';
  const rng = run['rng'];
  if (!isObject(rng) || !Object.values(rng).every((s) => Array.isArray(s) && s.length === 4 && s.every((n) => typeof n === 'number' && Number.isFinite(n)))) return '"rng" is not made of four-number streams';
  const tally = run['tally'];
  if (!isObject(tally) || !['choices', 'rounds', 'felled', 'fled'].every((k) => isWhole(tally[k]))) return '"tally" is not a set of whole numbers';
  if (run['status'] !== 'playing' && run['status'] !== 'ended') return '"status" is neither playing nor ended';
  const ending = run['ending'];
  if (ending !== null && (!isObject(ending) || !isText(ending['id']) || !isText(ending['title']) || (ending['kind'] !== 'victory' && ending['kind'] !== 'death'))) return '"ending" is malformed';
  if (!Array.isArray(run['aftermath'])) return '"aftermath" is not a list';
  for (const event of run['aftermath']) {
    const problem = eventShapeProblem(event);
    if (problem) return problem;
  }
  const combat = run['combat'];
  if (combat !== null) {
    if (!isObject(combat)) return '"combat" is not an object';
    if (!isText(combat['monsterId']) || !isWhole(combat['foeHp']) || !isWhole(combat['round']) || !isText(combat['intent'])) return 'the fight in progress is missing its basics';
    if (combat['tell'] !== null && !isText(combat['tell'])) return 'the fight\'s tell is malformed';
    if (!isObject(combat['cooldowns']) || !Object.values(combat['cooldowns']).every((n) => isWhole(n))) return 'the fight\'s cooldowns are malformed';
    const origin = combat['origin'];
    if (!isObject(origin) || (origin['kind'] !== 'scene' && !(origin['kind'] === 'encounter' && isText(origin['chapterId']) && isWhole(origin['entryIndex'])))) return 'the fight\'s origin is malformed';
    if (!Array.isArray(combat['log'])) return 'the fight\'s log is not a list';
    for (const event of combat['log']) {
      const problem = eventShapeProblem(event);
      if (problem) return problem;
    }
  }
  return null;
}

/**
 * Whether a run is sound against its story. Returns the first thing wrong, or null. Used on every save before it is
 * written (so nothing broken reaches the book) and on every save read back (so nothing broken is played).
 */
export function runProblem(loaded: LoadedStory, run: RunState): string | null {
  const story = loaded.story;
  if (run.storyId !== story.id) return `the run belongs to "${run.storyId}", not "${story.id}"`;
  if (!story.archetypes.some((a) => a.id === run.archetypeId)) return `the story has no archetype "${run.archetypeId}"`;

  const scene = loaded.scenes.get(run.sceneId);
  if (!scene) return `the run stands at the scene "${run.sceneId}", which the story doesn't have`;
  if (!story.chapters.some((c) => c.id === scene.chapterId)) return `the scene "${scene.id}" is in a chapter the story doesn't list`;
  for (const id of run.returnStack) if (!loaded.scenes.has(id)) return `the run means to return to "${id}", which the story doesn't have`;

  for (const id of Object.keys(run.inventory)) if (!loaded.items.has(id)) return `the satchel holds "${id}", which the story doesn't define`;
  for (const slot of SLOTS) {
    const id = run.equipment[slot];
    if (id === null) continue;
    const item = loaded.items.get(id);
    if (!item) return `the ${slot} slot holds "${id}", which the story doesn't define`;
    if (item.type !== slot) return `"${id}" can't be worn in the ${slot} slot`;
  }
  const lore = new Set(story.loreEntries.map((l) => l.id));
  for (const id of run.loreUnlocked) if (!lore.has(id)) return `the run has unlocked "${id}", which the story doesn't have`;

  if (run.level !== levelFor(run.xp)) return `level ${run.level} doesn't match ${run.xp} experience`;
  const maxHp = effectiveStats(loaded, run).hp;
  if (run.hp > maxHp) return `HP ${run.hp} is above the maximum of ${maxHp}`;
  const ending = run.ending;
  if (run.status === 'playing') {
    if (ending !== null) return 'the entry is still being played, but it already has an ending';
    if (scene.type === 'ending') return 'the entry is still being played, but stands at an ending scene';
    if (run.hp < 1) return 'the entry is still being played, but the hero has no HP';
  } else {
    if (ending === null) return 'the entry is closed, but names no ending';
    if (run.combat !== null) return 'the entry is closed, but a fight is still on';
    const listed = (ending.kind === 'victory' ? story.endings.victory : story.endings.death).find((e) => e.id === ending.id);
    if (!listed) return `the entry's ending "${ending.id}" isn't one the story lists`;
    if (listed.sceneId !== scene.id) return `the entry's ending "${ending.id}" doesn't belong to the scene it stands at`;
    if (ending.kind === 'victory' && run.hp < 1) return 'the entry ended in victory with no HP left';
  }
  return combatProblem(loaded, run);
}

/** Read an open entry back from the book. `loaded` is the story the row says it belongs to. */
export function openSave(row: ActiveRow, loaded: LoadedStory): OpenedSave {
  if (row.format > SAVE_FORMAT) return { kind: 'newer', reason: `it was written in save format ${row.format}, and this build reads up to ${SAVE_FORMAT}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.body);
  } catch {
    return { kind: 'damaged', reason: 'its text does not parse' };
  }
  if (!isObject(parsed)) return { kind: 'damaged', reason: 'its text is not an entry' };
  if (parsed['format'] !== row.format) return { kind: 'damaged', reason: 'its format number disagrees with the book\'s note of it' };
  if (!isText(parsed['appVersion']) || !isText(parsed['runId']) || !isText(parsed['startedAt'])) return { kind: 'damaged', reason: 'its header is incomplete' };
  if (parsed['runId'] !== row.runId) return { kind: 'damaged', reason: 'its id disagrees with the book\'s note of it' };

  if (!isObject(parsed['run'])) return { kind: 'damaged', reason: 'the run is not an object' };
  let brought: Record<string, unknown>;
  try {
    brought = row.format < SAVE_FORMAT ? migrateRun(row.format, parsed['run']) : parsed['run'];
  } catch (reason) {
    return { kind: 'damaged', reason: reason instanceof Error ? reason.message : 'it could not be brought up to date' };
  }
  const shape = shapeProblem(brought);
  if (shape) return { kind: 'damaged', reason: shape };
  const run = brought as unknown as RunState;

  if (run.contentVersion > loaded.story.version) {
    return { kind: 'newer', reason: `it was kept against version ${run.contentVersion} of the tale, and this build has version ${loaded.story.version}` };
  }
  const problem = runProblem(loaded, run);
  if (problem) return { kind: 'damaged', reason: problem };

  // Older content that still fits is carried forward under the current version number; the next save records it.
  const carried: RunState = run.contentVersion < loaded.story.version ? { ...run, contentVersion: loaded.story.version } : run;
  return { kind: 'ok', run: carried, runId: parsed['runId'], startedAt: parsed['startedAt'], appVersion: parsed['appVersion'] };
}
