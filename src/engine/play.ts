// The narrative loop: start a run, show a scene, take a choice. Pure functions over RunState; no DOM.
// Rules the loop enforces: effects apply before the move; HP at zero ends the run in the story's default
// death ending; a choice with encounterChance may divert through the chapter's encounter pool and then
// resume at the choice's real target ("$return"); reaching an ending scene closes the run for good.
import { render } from '../content/tokens.ts';
import type { EquipmentSlot, LoadedStory } from '../content/types.ts';
import { effectiveStats, meets } from './conditions.ts';
import { applyEffects, tokenContext } from './effects.ts';
import { drawInt } from './rng.ts';
import type { RunState, SceneView } from './types.ts';
import type { PronounSetId } from '../content/types.ts';

/** Thrown when a run reaches a scene type this build cannot play yet (fights and shops). */
export class UnsupportedSceneError extends Error {
  readonly sceneId: string;
  readonly sceneType: string;
  constructor(sceneId: string, sceneType: string) {
    super(`The scene "${sceneId}" is a ${sceneType} scene, and this build can't play those yet.`);
    this.sceneId = sceneId;
    this.sceneType = sceneType;
  }
}

const SLOTS: EquipmentSlot[] = ['weapon', 'head', 'body', 'trinket'];

function enter(loaded: LoadedStory, run: RunState, sceneId: string): RunState {
  const scene = loaded.scenes.get(sceneId);
  if (!scene) throw new Error(`Run state points at the scene "${sceneId}", which doesn't exist.`);
  if (scene.type === 'fight' || scene.type === 'shop') throw new UnsupportedSceneError(sceneId, scene.type);

  const lore = [...run.loreUnlocked];
  for (const id of scene.unlocksLore ?? []) if (!lore.includes(id)) lore.push(id);
  const next: RunState = { ...run, sceneId, loreUnlocked: lore };

  if (scene.type === 'ending') {
    const entries = [
      ...loaded.story.endings.victory.map((e) => ({ ...e, kind: 'victory' as const })),
      ...loaded.story.endings.death.map((e) => ({ ...e, kind: 'death' as const })),
    ];
    const entry = entries.find((e) => e.sceneId === sceneId);
    if (!entry) throw new Error(`The ending scene "${sceneId}" isn't listed in story.json.`);
    return { ...next, status: 'ended', ending: { id: entry.id, kind: entry.kind, title: entry.title }, returnStack: [] };
  }
  return next;
}

function die(loaded: LoadedStory, run: RunState): RunState {
  const entry = loaded.story.endings.death.find((e) => e.id === loaded.story.endings.defaultDeath);
  if (!entry) throw new Error('The default death ending is missing from story.json.');
  return enter(loaded, { ...run, hp: 0 }, entry.sceneId);
}

export function startRun(
  loaded: LoadedStory,
  options: { archetypeId: string; name: string; pronouns: PronounSetId; seed: string },
): RunState {
  const archetype = loaded.story.archetypes.find((a) => a.id === options.archetypeId);
  if (!archetype) throw new Error(`The story has no archetype "${options.archetypeId}".`);

  const equipment: RunState['equipment'] = { weapon: null, head: null, body: null, trinket: null };
  const inventory: Record<string, number> = {};
  for (const itemId of archetype.startingEquipment) {
    const item = loaded.items.get(itemId);
    if (!item) continue;
    if (SLOTS.includes(item.type as EquipmentSlot) && equipment[item.type as EquipmentSlot] === null) {
      equipment[item.type as EquipmentSlot] = itemId;
    } else {
      inventory[itemId] = (inventory[itemId] ?? 0) + 1;
    }
  }

  const base: RunState = {
    storyId: loaded.story.id,
    contentVersion: loaded.story.version,
    heroName: options.name,
    archetypeId: archetype.id,
    pronouns: options.pronouns,
    stats: { ...archetype.stats },
    hp: archetype.stats.hp,
    gold: 0,
    inventory,
    equipment,
    flags: {},
    sceneId: loaded.story.start,
    returnStack: [],
    pendingNotes: [],
    loreUnlocked: [],
    seed: options.seed,
    rng: {},
    status: 'playing',
    ending: null,
  };
  const withGear = { ...base, hp: effectiveStats(loaded, base).hp };
  return enter(loaded, withGear, loaded.story.start);
}

export function viewOf(loaded: LoadedStory, run: RunState): SceneView {
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene) throw new Error(`Run state points at the scene "${run.sceneId}", which doesn't exist.`);
  const ctx = tokenContext(loaded, run);
  const choices =
    scene.type === 'narrative'
      ? scene.choices.flatMap((choice, index) =>
          meets(loaded, run, choice.conditions)
            ? [{ index, text: render(choice.text, ctx), ...(choice.hint !== undefined ? { hint: choice.hint } : {}) }]
            : [],
        )
      : [];
  return {
    sceneId: scene.id,
    paragraphs: scene.prose.map((p) => render(p, ctx)),
    notes: run.pendingNotes,
    choices,
    ending: run.ending ? { kind: run.ending.kind, title: run.ending.title } : null,
  };
}

/** Take the choice at `index` (its position in the scene's choices array). */
export function choose(loaded: LoadedStory, run: RunState, index: number): RunState {
  if (run.status === 'ended') throw new Error('This entry is closed; there is nothing left to choose.');
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene || scene.type !== 'narrative') throw new Error(`The scene "${run.sceneId}" has no choices to take.`);
  const choice = scene.choices[index];
  if (!choice) throw new Error(`The scene "${scene.id}" has no choice number ${index}.`);
  if (!meets(loaded, run, choice.conditions)) throw new Error(`The choice "${choice.text}" isn't available right now.`);

  const applied = applyEffects(loaded, { ...run, pendingNotes: [] }, choice.effects);
  let next = { ...applied.run, pendingNotes: applied.notes };
  if (next.hp <= 0) return die(loaded, next);

  let destination = choice.target;
  if (destination === '$return') {
    const stack = [...next.returnStack];
    const back = stack.pop();
    if (back === undefined) throw new Error(`The scene "${scene.id}" returned from an encounter, but none was in progress.`);
    next = { ...next, returnStack: stack };
    destination = back;
  } else if (choice.encounterChance !== undefined) {
    let roll: number;
    [roll, next] = drawInt(next, 'encounter', 100);
    const pool = (loaded.pools.get(scene.chapterId) ?? []).filter((entry) => meets(loaded, next, entry.conditions));
    if (roll < choice.encounterChance && pool.length > 0) {
      const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
      let pick: number;
      [pick, next] = drawInt(next, 'encounter', total);
      let chosen = pool[0];
      for (const entry of pool) {
        if (pick < entry.weight) {
          chosen = entry;
          break;
        }
        pick -= entry.weight;
      }
      if (chosen && chosen.type === 'fight') throw new UnsupportedSceneError(`${scene.chapterId} encounter`, 'fight');
      if (chosen) {
        next = { ...next, returnStack: [...next.returnStack, destination] };
        destination = chosen.sceneId;
      }
    }
  }
  return enter(loaded, next, destination);
}
