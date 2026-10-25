// The narrative loop: start a run, show a scene, take a choice. Pure functions over RunState; no DOM.
// Rules the loop enforces: effects apply before the move; HP at zero ends the run in the story's default
// death ending (or a fight's own); a choice with encounterChance may divert through the chapter's encounter pool
// (a flavor scene or a fight) and then resume at the choice's real target ("$return"); a fight scene opens a duel
// whose victory, flight and defeat lead where the scene says; a shop scene hands over to shop.ts for buying and
// selling and leaves for the scene the story names; reaching an ending scene closes the run for good.
import { render } from '../content/tokens.ts';
import type { EquipmentSlot, LoadedStory, Outcome } from '../content/types.ts';
import { effectiveStats, meets } from './conditions.ts';
import { combatView, flee, openCombat, playRound } from './combat.ts';
import type { FightAction } from './combat.ts';
import { applyEffects, tokenContext } from './effects.ts';
import { drawInt, drawWeighted } from './rng.ts';
import { shopView } from './shop.ts';
import type { RunState, SceneView } from './types.ts';
import type { PronounSetId } from '../content/types.ts';

const SLOTS: EquipmentSlot[] = ['weapon', 'head', 'body', 'trinket'];

/** Dev-mode switches the loop honours. `god`: the hero loses no HP. `force`: the next encounter roll is skipped and this entry of the chapter's pool (by index) happens. */
export interface DevOptions {
  god?: boolean;
  force?: number;
}

/** Put the run in `sceneId`, running what entering it does (open a fight, close an ending, unlock lore). */
export function enterScene(loaded: LoadedStory, run: RunState, sceneId: string): RunState {
  const scene = loaded.scenes.get(sceneId);
  if (!scene) throw new Error(`Run state points at the scene "${sceneId}", which doesn't exist.`);

  const lore = [...run.loreUnlocked];
  for (const id of scene.unlocksLore ?? []) if (!lore.includes(id)) lore.push(id);
  const next: RunState = { ...run, sceneId, loreUnlocked: lore };

  if (scene.type === 'fight') return openCombat(loaded, next, scene.fight.monsterId, { kind: 'scene' });
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

function die(loaded: LoadedStory, run: RunState, endingId: string = loaded.story.endings.defaultDeath): RunState {
  const entry = loaded.story.endings.death.find((e) => e.id === endingId);
  if (!entry) throw new Error(`The death ending "${endingId}" is missing from story.json.`);
  return enterScene(loaded, { ...run, hp: 0, combat: null }, entry.sceneId);
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
    xp: 0,
    level: 1,
    inventory,
    equipment,
    flags: {},
    sceneId: loaded.story.start,
    returnStack: [],
    pendingNotes: [],
    loreUnlocked: [],
    seed: options.seed,
    rng: {},
    combat: null,
    aftermath: [],
    tally: { choices: 0, rounds: 0, felled: 0, fled: 0 },
    status: 'playing',
    ending: null,
  };
  const withGear = { ...base, hp: effectiveStats(loaded, base).hp };
  return enterScene(loaded, withGear, loaded.story.start);
}

export function viewOf(loaded: LoadedStory, run: RunState): SceneView {
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene) throw new Error(`Run state points at the scene "${run.sceneId}", which doesn't exist.`);
  const ctx = tokenContext(loaded, run);
  const choices =
    scene.type === 'narrative' && !run.combat
      ? scene.choices.flatMap((choice, index) =>
          meets(loaded, run, choice.conditions)
            ? [{ index, text: render(choice.text, ctx), ...(choice.hint !== undefined ? { hint: choice.hint } : {}) }]
            : [],
        )
      : [];
  return {
    sceneId: scene.id,
    paragraphs: run.combat?.origin.kind === 'encounter' ? [] : scene.prose.map((p) => render(p, ctx)),
    notes: run.pendingNotes,
    choices,
    ending: run.ending ? { kind: run.ending.kind, title: run.ending.title } : null,
    combat: run.combat ? combatView(loaded, run) : null,
    shop: scene.type === 'shop' && run.status === 'playing' ? shopView(loaded, run) : null,
    aftermath: run.aftermath,
  };
}

/** Take the choice at `index` (its position in the scene's choices array). */
export function choose(loaded: LoadedStory, run: RunState, index: number, dev: DevOptions = {}): RunState {
  if (run.status === 'ended') throw new Error('This entry is closed; there is nothing left to choose.');
  if (run.combat) throw new Error('A fight is in progress; it has to be played out or fled first.');
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene || scene.type !== 'narrative') throw new Error(`The scene "${run.sceneId}" has no choices to take.`);
  const choice = scene.choices[index];
  if (!choice) throw new Error(`The scene "${scene.id}" has no choice number ${index}.`);
  if (!meets(loaded, run, choice.conditions)) throw new Error(`The choice "${choice.text}" isn't available right now.`);

  const counted: RunState = { ...run, tally: { ...run.tally, choices: run.tally.choices + 1 } };
  const applied = applyEffects(loaded, { ...counted, pendingNotes: [], aftermath: [] }, choice.effects);
  let next = { ...applied.run, pendingNotes: applied.notes };
  if (dev.god) next = { ...next, hp: Math.max(next.hp, counted.hp) };
  if (next.hp <= 0) return die(loaded, next);

  let destination = choice.target;
  if (destination === '$return') {
    const stack = [...next.returnStack];
    const back = stack.pop();
    if (back === undefined) throw new Error(`The scene "${scene.id}" returned from an encounter, but none was in progress.`);
    next = { ...next, returnStack: stack };
    destination = back;
  } else if (choice.encounterChance !== undefined) {
    const pool = (loaded.pools.get(scene.chapterId) ?? []).flatMap((entry, entryIndex) =>
      meets(loaded, next, entry.conditions) ? [{ entry, entryIndex }] : [],
    );
    let chosen: (typeof pool)[number] | undefined;
    const forced = dev.force === undefined ? undefined : loaded.pools.get(scene.chapterId)?.[dev.force];
    if (forced && dev.force !== undefined) {
      // Dev mode: skip the roll, so no draw is made, and take the entry asked for whether or not its conditions hold.
      chosen = { entry: forced, entryIndex: dev.force };
    } else {
      let roll: number;
      [roll, next] = drawInt(next, 'encounter', 100);
      if (roll < choice.encounterChance && pool.length > 0) {
        let index: number;
        [index, next] = drawWeighted(next, 'encounter', pool.map((p) => p.entry.weight));
        chosen = pool[index];
      }
    }
    if (chosen) {
      next = { ...next, returnStack: [...next.returnStack, destination] };
      if (chosen.entry.type === 'fight') {
        return openCombat(loaded, next, chosen.entry.monsterId, { kind: 'encounter', chapterId: scene.chapterId, entryIndex: chosen.entryIndex });
      }
      destination = chosen.entry.sceneId;
    }
  }
  return enterScene(loaded, next, destination);
}

/** Move on after a fight: apply the story's effects for how it ended, then go where it leads. */
function afterFight(loaded: LoadedStory, fought: RunState, outcome: Partial<Outcome>, ended: RunState, god = false): RunState {
  const applied = applyEffects(loaded, { ...ended, pendingNotes: [] }, outcome.effects);
  let next: RunState = { ...applied.run, pendingNotes: applied.notes };
  if (god) next = { ...next, hp: Math.max(next.hp, ended.hp) };
  if (next.hp <= 0) return die(loaded, next);
  let destination = outcome.sceneId;
  if (destination === undefined) {
    const stack = [...next.returnStack];
    const back = stack.pop();
    if (back === undefined) throw new Error(`The fight at "${fought.sceneId}" was an encounter, but nothing was waiting to resume.`);
    next = { ...next, returnStack: stack };
    destination = back;
  }
  return enterScene(loaded, next, destination);
}

/** What the story says happens when this fight ends: scene fights name their own scenes, encounter fights resume. */
function outcomeOf(loaded: LoadedStory, run: RunState, how: 'victory' | 'flee'): Partial<Outcome> {
  const combat = run.combat;
  if (!combat) throw new Error('There is no fight in progress.');
  if (combat.origin.kind === 'scene') {
    const scene = loaded.scenes.get(run.sceneId);
    if (!scene || scene.type !== 'fight') throw new Error(`The run is mid-fight at "${run.sceneId}", which isn't a fight scene.`);
    return how === 'victory' ? scene.fight.onVictory : scene.fight.onFlee;
  }
  const entry = loaded.pools.get(combat.origin.chapterId)?.[combat.origin.entryIndex];
  if (!entry || entry.type !== 'fight') throw new Error('The run is mid-fight, but its encounter entry is gone.');
  return how === 'flee' && entry.fleeEffects ? { effects: entry.fleeEffects } : {};
}

/** Where a lost fight leads: the scene's own death ending if it names one, else the story's default. */
function defeatEnding(loaded: LoadedStory, run: RunState): string | undefined {
  const scene = loaded.scenes.get(run.sceneId);
  return run.combat?.origin.kind === 'scene' && scene?.type === 'fight' ? scene.fight.onDefeat : undefined;
}

export type FightResult = { ok: true; run: RunState } | { ok: false; reason: 'full-health' | 'cooling' };

/** Play one round of the fight in progress. When it ends, the run moves on to wherever the story sends it. */
export function fightAction(loaded: LoadedStory, run: RunState, action: FightAction, dev: DevOptions = {}): FightResult {
  const before = run;
  const outcome = outcomeOf(loaded, before, 'victory');
  const defeat = defeatEnding(loaded, before);
  const round = playRound(loaded, { ...before, aftermath: [], pendingNotes: [] }, action, dev.god === true);
  if (!round.ok) return round;
  const played: RunState = {
    ...round.run,
    tally: { ...round.run.tally, rounds: round.run.tally.rounds + 1, felled: round.run.tally.felled + (round.end === 'victory' ? 1 : 0) },
  };
  if (round.end === null) return { ok: true, run: { ...played, pendingNotes: before.pendingNotes } };
  if (round.end === 'defeat') return { ok: true, run: die(loaded, played, defeat) };
  return { ok: true, run: afterFight(loaded, before, outcome, played, dev.god === true) };
}

/** Break off the fight in progress and go where the story sends a fugitive. Always available. */
export function fleeFight(loaded: LoadedStory, run: RunState, dev: DevOptions = {}): RunState {
  const outcome = outcomeOf(loaded, run, 'flee');
  const broken = flee(loaded, { ...run, aftermath: [] });
  const kept = dev.god ? { ...broken, hp: Math.max(broken.hp, run.hp) } : broken;
  return afterFight(loaded, run, outcome, { ...kept, tally: { ...kept.tally, fled: kept.tally.fled + 1 } }, dev.god === true);
}

/** Leave the shop for the scene the story names. What was bought and sold is told at the top of the next page. */
export function leaveShop(loaded: LoadedStory, run: RunState): RunState {
  const scene = loaded.scenes.get(run.sceneId);
  if (!scene || scene.type !== 'shop') throw new Error(`The run is at "${run.sceneId}", which isn't a shop.`);
  if (run.status === 'ended') throw new Error('This entry is closed; there is no shop to leave.');
  const deals = run.aftermath.filter((e) => e.kind === 'bought' || e.kind === 'sold');
  return enterScene(loaded, { ...run, aftermath: deals, pendingNotes: [] }, scene.shop.leaveSceneId);
}
