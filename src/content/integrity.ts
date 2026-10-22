// Cross-file checks that a JSON schema can't express: every id points at something that exists, every defined
// thing is used, no scene is orphaned, trapped or a dead end. Runs after the schemas pass (so shapes are known
// good) and is shared by the app loader and `npm run validate`.
import { tokenProblems } from './tokens.ts';
import type {
  Condition, ContentProblem, EncounterPool, Effect, Item, Monster, Scene, Story,
} from './types.ts';

export interface SceneSource {
  scene: Scene;
  file: string;
  index: number;
}

export interface Candidate {
  story: Story;
  scenes: SceneSource[];
  monsters: Monster[];
  items: Item[];
  pools: EncounterPool[];
  paths: { story: string; monsters: string; items: string; encounters: string };
}

const SLOTS = ['weapon', 'head', 'body', 'trinket'];

export function checkIntegrity(c: Candidate): ContentProblem[] {
  const out: ContentProblem[] = [];
  const add = (file: string, where: string, message: string): void => {
    out.push({ file, where, message });
  };
  const { story, paths } = c;

  // ---- unique ids ----
  const unique = <T extends { id: string }>(list: T[], kind: string, file: string, wherePrefix: string): Map<string, T> => {
    const map = new Map<string, T>();
    list.forEach((entry, i) => {
      if (map.has(entry.id)) add(file, `${wherePrefix}[${i}]`, `the ${kind} id "${entry.id}" is used twice`);
      else map.set(entry.id, entry);
    });
    return map;
  };
  const items = unique(c.items, 'item', paths.items, 'items');
  const monsters = unique(c.monsters, 'monster', paths.monsters, 'monsters');
  const chapters = unique(story.chapters, 'chapter', paths.story, 'chapters');
  unique(story.archetypes, 'archetype', paths.story, 'archetypes');
  const lore = unique(story.loreEntries, 'lore entry', paths.story, 'loreEntries');
  const endingEntries = [...story.endings.victory, ...story.endings.death];
  unique(endingEntries, 'ending', paths.story, 'endings');

  const scenes = new Map<string, SceneSource>();
  for (const source of c.scenes) {
    if (scenes.has(source.scene.id)) {
      add(source.file, `scenes[${source.index}]`, `the scene id "${source.scene.id}" is used twice`);
    } else {
      scenes.set(source.scene.id, source);
    }
  }
  const at = (s: SceneSource): string => `scenes[${s.index}] "${s.scene.id}"`;

  const skillIds = new Map<string, string>();
  const noteSkill = (id: string, where: string, file: string): void => {
    if (skillIds.has(id)) add(file, where, `the skill id "${id}" is already used by ${skillIds.get(id)}`);
    else skillIds.set(id, where);
  };
  story.archetypes.forEach((a, i) => a.startingSkills.forEach((s, j) => noteSkill(s.id, `archetypes[${i}].startingSkills[${j}]`, paths.story)));
  c.monsters.forEach((m, i) => m.skills.forEach((s, j) => noteSkill(s.id, `monsters[${i}].skills[${j}]`, paths.monsters)));

  // ---- text tokens ----
  const checkText = (file: string, where: string, text: string): void => {
    for (const problem of tokenProblems(text)) add(file, where, problem);
  };
  const checkEffectNotes = (file: string, where: string, effects: Effect[] | undefined): void => {
    effects?.forEach((e, i) => {
      if (e.type !== 'flag') checkText(file, `${where}.effects[${i}].note`, e.note);
    });
  };

  // ---- references from conditions and effects ----
  const flagsRead = new Map<string, { file: string; where: string }>();
  const flagsSet = new Set<string>();
  const obtainable = new Set<string>();

  const checkConditions = (file: string, where: string, conditions: Condition[] | undefined): void => {
    conditions?.forEach((cond, i) => {
      if (cond.type === 'item' && !items.has(cond.itemId)) {
        add(file, `${where}.conditions[${i}]`, `the item "${cond.itemId}" doesn't exist in items.json`);
      }
      if (cond.type === 'flag' && !flagsRead.has(cond.flag)) flagsRead.set(cond.flag, { file, where: `${where}.conditions[${i}]` });
    });
  };
  const checkEffects = (file: string, where: string, effects: Effect[] | undefined): void => {
    effects?.forEach((e, i) => {
      if (e.type === 'item') {
        if (!items.has(e.itemId)) add(file, `${where}.effects[${i}]`, `the item "${e.itemId}" doesn't exist in items.json`);
        else if (e.change === 'give') obtainable.add(e.itemId);
      }
      if (e.type === 'flag') flagsSet.add(e.flag);
    });
  };

  // ---- story.json ----
  const start = scenes.get(story.start);
  if (!start) add(paths.story, 'start', `the start scene "${story.start}" doesn't exist`);
  else if (start.scene.type === 'ending') add(paths.story, 'start', `the start scene "${story.start}" is an ending`);

  story.archetypes.forEach((a, i) => {
    const slotsUsed = new Map<string, string>();
    a.startingEquipment.forEach((itemId, j) => {
      const item = items.get(itemId);
      if (!item) {
        add(paths.story, `archetypes[${i}].startingEquipment[${j}]`, `the item "${itemId}" doesn't exist in items.json`);
        return;
      }
      obtainable.add(itemId);
      if (SLOTS.includes(item.type)) {
        const prior = slotsUsed.get(item.type);
        if (prior) add(paths.story, `archetypes[${i}].startingEquipment[${j}]`, `"${itemId}" and "${prior}" both fill the ${item.type} slot`);
        else slotsUsed.set(item.type, itemId);
      }
    });
  });

  // ---- endings ----
  const endingSceneUse = new Map<string, number>();
  const checkEnding = (kind: 'victory' | 'death'): void => {
    story.endings[kind].forEach((entry, i) => {
      const where = `endings.${kind}[${i}]`;
      const target = scenes.get(entry.sceneId);
      if (!target) add(paths.story, where, `the scene "${entry.sceneId}" doesn't exist`);
      else if (target.scene.type !== 'ending') add(paths.story, where, `the scene "${entry.sceneId}" isn't an ending scene`);
      endingSceneUse.set(entry.sceneId, (endingSceneUse.get(entry.sceneId) ?? 0) + 1);
    });
  };
  checkEnding('victory');
  checkEnding('death');
  if (!story.endings.death.some((e) => e.id === story.endings.defaultDeath)) {
    add(paths.story, 'endings.defaultDeath', `"${story.endings.defaultDeath}" isn't one of the death endings`);
  }
  const deathSceneIds = new Set(story.endings.death.map((e) => e.sceneId));

  // ---- monsters ----
  c.monsters.forEach((m, i) => {
    const where = `monsters[${i}] "${m.id}"`;
    if (m.damage.min > m.damage.max) add(paths.monsters, where, 'damage.min is higher than damage.max');
    if (m.lootTable.gold.min > m.lootTable.gold.max) add(paths.monsters, where, 'lootTable.gold.min is higher than lootTable.gold.max');
    const t = m.styleTendencies;
    if (t.strike + t.guard + t.feint === 0) add(paths.monsters, where, 'styleTendencies are all zero, so it would never choose a stance');
    m.lootTable.items.forEach((entry, j) => {
      if (!items.has(entry.itemId)) add(paths.monsters, `${where}.lootTable.items[${j}]`, `the item "${entry.itemId}" doesn't exist in items.json`);
      else obtainable.add(entry.itemId);
    });
  });

  // ---- encounter pools ----
  const poolByChapter = new Map<string, EncounterPool>();
  const encounterScenes = new Map<string, string>();
  const usedMonsters = new Set<string>();
  c.pools.forEach((pool, i) => {
    const where = `pools[${i}] "${pool.chapterId}"`;
    if (!chapters.has(pool.chapterId)) add(paths.encounters, where, `the chapter "${pool.chapterId}" doesn't exist in story.json`);
    if (poolByChapter.has(pool.chapterId)) add(paths.encounters, where, 'this chapter already has a pool');
    poolByChapter.set(pool.chapterId, pool);
    pool.entries.forEach((entry, j) => {
      const entryWhere = `${where}.entries[${j}]`;
      checkConditions(paths.encounters, entryWhere, entry.conditions);
      if (entry.type === 'fight') {
        if (!monsters.has(entry.monsterId)) add(paths.encounters, entryWhere, `the monster "${entry.monsterId}" doesn't exist in monsters.json`);
        usedMonsters.add(entry.monsterId);
        entry.fleeEffects?.forEach((e, k) => {
          if (e.type !== 'flag') checkText(paths.encounters, `${entryWhere}.fleeEffects[${k}].note`, e.note);
        });
        checkEffects(paths.encounters, `${entryWhere}.fleeEffects`, entry.fleeEffects);
      } else {
        const target = scenes.get(entry.sceneId);
        if (!target) {
          add(paths.encounters, entryWhere, `the scene "${entry.sceneId}" doesn't exist`);
        } else {
          encounterScenes.set(entry.sceneId, pool.chapterId);
          if (target.scene.type !== 'narrative') add(paths.encounters, entryWhere, `the scene "${entry.sceneId}" must be a narrative scene to be rolled as an encounter`);
          if (target.scene.chapterId !== pool.chapterId) add(paths.encounters, entryWhere, `the scene "${entry.sceneId}" belongs to chapter "${target.scene.chapterId}", not "${pool.chapterId}"`);
        }
      }
    });
  });
  for (const chapter of story.chapters) {
    if (!poolByChapter.has(chapter.id)) add(paths.encounters, '(file)', `the chapter "${chapter.id}" has no encounter pool`);
    if (![...scenes.values()].some((s) => s.scene.chapterId === chapter.id)) {
      add(paths.story, `chapters "${chapter.id}"`, 'no scene belongs to this chapter');
    }
  }

  // ---- scenes: references, text, shape ----
  const edges = new Map<string, Array<{ to: string; always: boolean }>>();
  const linked = new Set<string>();
  const addEdge = (from: string, to: string, always: boolean): void => {
    const list = edges.get(from) ?? [];
    list.push({ to, always });
    edges.set(from, list);
  };
  const needScene = (file: string, where: string, id: string): boolean => {
    if (scenes.has(id)) return true;
    add(file, where, `the scene "${id}" doesn't exist`);
    return false;
  };

  for (const source of scenes.values()) {
    const { scene, file } = source;
    const where = at(source);
    if (!chapters.has(scene.chapterId)) add(file, where, `the chapter "${scene.chapterId}" doesn't exist in story.json`);
    scene.prose.forEach((p, i) => checkText(file, `${where}.prose[${i}]`, p));
    scene.unlocksLore?.forEach((id) => {
      if (!lore.has(id)) add(file, where, `unlocksLore names "${id}", which isn't in story.json loreEntries`);
    });
    const isEncounter = encounterScenes.has(scene.id);

    if (scene.type === 'narrative') {
      if (!scene.choices.some((ch) => !ch.conditions)) {
        add(file, where, 'every choice has conditions, so a player could be left with nothing to pick; add one that is always available');
      }
      scene.choices.forEach((choice, i) => {
        const cw = `${where}.choices[${i}]`;
        checkText(file, `${cw}.text`, choice.text);
        checkConditions(file, cw, choice.conditions);
        checkEffects(file, cw, choice.effects);
        checkEffectNotes(file, cw, choice.effects);
        if (choice.target === '$return') {
          if (!isEncounter) add(file, cw, '"$return" can only be used in scenes rolled from an encounter pool');
        } else {
          if (isEncounter) add(file, cw, 'a scene rolled from an encounter pool must send every choice to "$return"');
          if (needScene(file, cw, choice.target)) {
            linked.add(choice.target);
            addEdge(scene.id, choice.target, !choice.conditions);
          }
        }
        if (choice.encounterChance !== undefined && !poolByChapter.has(scene.chapterId)) {
          add(file, cw, `encounterChance is set but chapter "${scene.chapterId}" has no encounter pool`);
        }
      });
    } else if (scene.type === 'fight') {
      const f = scene.fight;
      if (!monsters.has(f.monsterId)) add(file, `${where}.fight`, `the monster "${f.monsterId}" doesn't exist in monsters.json`);
      usedMonsters.add(f.monsterId);
      for (const [label, outcome] of [['onVictory', f.onVictory], ['onFlee', f.onFlee]] as const) {
        const ow = `${where}.fight.${label}`;
        if (needScene(file, ow, outcome.sceneId)) {
          linked.add(outcome.sceneId);
          addEdge(scene.id, outcome.sceneId, true);
        }
        checkEffects(file, ow, outcome.effects);
        checkEffectNotes(file, ow, outcome.effects);
      }
      if (f.onDefeat !== undefined && !story.endings.death.some((e) => e.id === f.onDefeat)) {
        add(file, `${where}.fight.onDefeat`, `"${f.onDefeat}" isn't one of the death endings in story.json`);
      }
      if (isEncounter) add(file, where, 'a fight scene can\'t be rolled as a flavor or discovery encounter');
    } else if (scene.type === 'shop') {
      scene.shop.stock.forEach((entry, i) => {
        const sw = `${where}.shop.stock[${i}]`;
        const item = items.get(entry.itemId);
        if (!item) add(file, sw, `the item "${entry.itemId}" doesn't exist in items.json`);
        else {
          obtainable.add(entry.itemId);
          if (!item.purchasable) add(file, sw, `the item "${entry.itemId}" is marked purchasable: false`);
        }
      });
      if (needScene(file, `${where}.shop.leaveSceneId`, scene.shop.leaveSceneId)) {
        linked.add(scene.shop.leaveSceneId);
        addEdge(scene.id, scene.shop.leaveSceneId, true);
      }
      if (isEncounter) add(file, where, 'a shop scene can\'t be rolled as an encounter');
    }
  }

  // ---- ending scenes are each claimed by exactly one ending entry ----
  for (const source of scenes.values()) {
    if (source.scene.type !== 'ending') continue;
    const uses = endingSceneUse.get(source.scene.id) ?? 0;
    if (uses === 0) add(source.file, at(source), 'this ending scene isn\'t listed under endings in story.json');
    if (uses > 1) add(source.file, at(source), 'this ending scene is listed more than once in story.json');
  }
  // Fight scenes can end a run too; wire their defeat endings into the graph as plain reachability.
  for (const source of scenes.values()) {
    if (source.scene.type === 'fight' && source.scene.fight.onDefeat !== undefined) {
      const entry = story.endings.death.find((e) => e.id === (source.scene as { fight: { onDefeat?: string } }).fight.onDefeat);
      if (entry) addEdge(source.scene.id, entry.sceneId, false);
    }
  }

  // ---- encounter scenes can't also be linked to directly ----
  for (const id of encounterScenes.keys()) {
    if (linked.has(id)) {
      const source = scenes.get(id);
      if (source) add(source.file, at(source), 'this scene is rolled from an encounter pool, so no other scene may link to it');
    }
  }

  // ---- flags, items, monsters, lore: read-but-never-set and defined-but-never-used ----
  for (const [flag, place] of flagsRead) {
    if (!flagsSet.has(flag)) add(place.file, place.where, `the flag "${flag}" is checked but nothing ever sets it`);
  }
  c.items.forEach((item, i) => {
    if (!obtainable.has(item.id)) {
      add(paths.items, `items[${i}] "${item.id}"`, 'defined but never obtainable: nothing starts with it, gives it, drops it or sells it');
    }
  });
  c.monsters.forEach((m, i) => {
    if (!usedMonsters.has(m.id)) add(paths.monsters, `monsters[${i}] "${m.id}"`, 'defined but never used by a fight scene or encounter pool');
  });
  const unlocked = new Set<string>();
  for (const { scene } of scenes.values()) scene.unlocksLore?.forEach((id) => unlocked.add(id));
  story.loreEntries.forEach((entry, i) => {
    if (!unlocked.has(entry.id)) add(paths.story, `loreEntries[${i}] "${entry.id}"`, 'no scene unlocks this lore entry');
  });

  // ---- reachability from the start scene ----
  if (start && start.scene.type !== 'ending') {
    const seen = new Set<string>([story.start]);
    const queue = [story.start];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const edge of edges.get(id) ?? []) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    const chaptersRolling = new Set<string>();
    for (const id of seen) {
      const s = scenes.get(id)?.scene;
      if (s?.type === 'narrative' && s.choices.some((ch) => ch.encounterChance !== undefined)) chaptersRolling.add(s.chapterId);
    }
    for (const source of scenes.values()) {
      const id = source.scene.id;
      if (seen.has(id) || deathSceneIds.has(id)) continue;
      const chapterOfEncounter = encounterScenes.get(id);
      if (chapterOfEncounter !== undefined) {
        if (!chaptersRolling.has(chapterOfEncounter)) {
          add(source.file, at(source), `this encounter scene is never rolled: no reachable choice in chapter "${chapterOfEncounter}" has encounterChance`);
        }
        continue;
      }
      add(source.file, at(source), 'unreachable: nothing leads here from the start scene');
    }

    // ---- no traps: every reachable scene can get to an ending without needing any condition ----
    const back = new Map<string, string[]>();
    for (const [from, list] of edges) {
      for (const edge of list) {
        if (!edge.always) continue;
        back.set(edge.to, [...(back.get(edge.to) ?? []), from]);
      }
    }
    const canExit = new Set<string>();
    const stack: string[] = [];
    for (const { scene } of scenes.values()) {
      if (scene.type === 'ending') {
        canExit.add(scene.id);
        stack.push(scene.id);
      }
    }
    while (stack.length > 0) {
      const id = stack.pop() as string;
      for (const from of back.get(id) ?? []) {
        if (!canExit.has(from)) {
          canExit.add(from);
          stack.push(from);
        }
      }
    }
    for (const id of seen) {
      const source = scenes.get(id);
      if (source && !canExit.has(id) && !encounterScenes.has(id)) {
        add(source.file, at(source), 'a trap: from here, no always-available path leads to an ending');
      }
    }
  }

  return out;
}
