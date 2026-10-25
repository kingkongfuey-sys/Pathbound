// The duel. Pure functions over RunState, no DOM and no story text: a round goes in as an action and comes out as a
// new run plus plain-data events that the screens turn into lines of copy. All the rules live in this one file so
// they can be read in a sitting.
//
// The shape of a round: before the hero chooses, the foe's stance for the round is already drawn and stored in the
// run (`intent`), and the hero's wits may let them read it (`tell`, always truthful). So the fight is the same
// whether the app is closed and reopened or not, and a saved run is always a whole round, never half of one.
// Strike beats feint, feint beats guard, guard beats strike; the winner of the exchange lands a blow, a tie costs
// both sides half. Spending the round on an item leaves the hero open: the foe lands a blow unless it was guarding.
// Randomness comes from three named streams (see rng.ts), always drawn in the same order, so identical seed and
// identical actions always give an identical fight.
import type { Item, LoadedStory, Monster, Skill } from '../content/types.ts';
import { effectiveStats } from './conditions.ts';
import { awardXp } from './growth.ts';
import { drawInt, drawWeighted } from './rng.ts';
import type { AccountEvent, CombatOrigin, CombatState, CombatView, RoundResult, RunState, Stance3 } from './types.ts';

export const STANCES: readonly Stance3[] = ['strike', 'guard', 'feint'];

/** What each stance beats. */
export const BEATS: Record<Stance3, Stance3> = { strike: 'feint', feint: 'guard', guard: 'strike' };

/** The hero's blow is attack + HERO_BASE + a roll from 0 to HERO_SPREAD - 1. */
export const HERO_BASE = 1;
export const HERO_SPREAD = 3;
/** Wits that let the hero read the foe: each point is this many percent, up to the cap. */
export const TELL_PERCENT_PER_WIT = 10;
export const TELL_CAP_PERCENT = 80;

export type FightAction = { kind: 'stance'; stance: Stance3; skillId?: string } | { kind: 'item'; itemId: string };

export type RoundOutcome =
  | { ok: true; run: RunState; end: 'victory' | 'defeat' | null }
  | { ok: false; reason: 'full-health' | 'cooling' };

export function compareStances(hero: Stance3, foe: Stance3): 'win' | 'lose' | 'clash' {
  if (hero === foe) return 'clash';
  return BEATS[hero] === foe ? 'win' : 'lose';
}

export function monsterOf(loaded: LoadedStory, combat: CombatState): Monster {
  const monster = loaded.monsters.get(combat.monsterId);
  if (!monster) throw new Error(`The fight names the monster "${combat.monsterId}", which this story doesn't define.`);
  return monster;
}

function combatOf(run: RunState): CombatState {
  if (!run.combat) throw new Error('There is no fight in progress.');
  return run.combat;
}

function heroSkills(loaded: LoadedStory, run: RunState): Skill[] {
  return loaded.story.archetypes.find((a) => a.id === run.archetypeId)?.startingSkills ?? [];
}

/** Draw the foe's stance for the round, and whether the hero reads it. Always two draws, in this order. */
function prepareRound(loaded: LoadedStory, run: RunState, base: Omit<CombatState, 'intent' | 'tell'>): RunState {
  const monster = loaded.monsters.get(base.monsterId);
  if (!monster) throw new Error(`The fight names the monster "${base.monsterId}", which this story doesn't define.`);
  const weights = STANCES.map((stance) => monster.styleTendencies[stance]);
  let next = run;
  let index: number;
  [index, next] = drawWeighted(next, 'combat', weights);
  const intent = STANCES[index] as Stance3;
  let roll: number;
  [roll, next] = drawInt(next, 'read', 100);
  const chance = Math.min(TELL_CAP_PERCENT, effectiveStats(loaded, next).wits * TELL_PERCENT_PER_WIT);
  return { ...next, combat: { ...base, intent, tell: roll < chance ? intent : null } };
}

/** Begin a fight: the foe at full health, round one prepared. */
export function openCombat(loaded: LoadedStory, run: RunState, monsterId: string, origin: CombatOrigin): RunState {
  const monster = loaded.monsters.get(monsterId);
  if (!monster) throw new Error(`The fight names the monster "${monsterId}", which this story doesn't define.`);
  if (run.combat) throw new Error('A fight is already in progress.');
  return prepareRound(loaded, run, { monsterId, foeHp: monster.hp, round: 1, cooldowns: {}, origin, log: [] });
}

/** Everything the fight panel shows, worked out in one place. */
export function combatView(loaded: LoadedStory, run: RunState): CombatView {
  const combat = combatOf(run);
  const monster = monsterOf(loaded, combat);
  const items = Object.entries(run.inventory).flatMap(([id, count]) => {
    const item = loaded.items.get(id);
    return item && item.type === 'consumable' && item.use ? [{ id, name: item.name, count, amount: item.use.amount }] : [];
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return {
    intro: combat.origin.kind === 'scene' ? 'scene' : 'encounter',
    monsterName: monster.name,
    foeHp: combat.foeHp,
    foeMaxHp: monster.hp,
    round: combat.round,
    tell: combat.tell,
    skills: heroSkills(loaded, run).map((s) => ({ id: s.id, name: s.name, description: s.description, stance: s.stance, cooldown: combat.cooldowns[s.id] ?? 0 })),
    items,
    log: combat.log,
  };
}

/** Damage after the hero's defense. A blow always does at least 1 before a skill turns some of it aside. */
function afterDefense(raw: number, defense: number, turnedAside: number): number {
  return Math.max(0, Math.max(1, raw - defense) - turnedAside);
}

/** The foe's skill for this round, if it has one that fits: first in its list that is ready, matches its stance and has a use. */
function foeSkillFor(monster: Monster, combat: CombatState): Skill | null {
  for (const skill of monster.skills) {
    if ((combat.cooldowns[skill.id] ?? 0) > 0) continue;
    if (skill.stance !== 'any' && skill.stance !== combat.intent) continue;
    if (skill.effect.kind === 'heal' && combat.foeHp >= monster.hp) continue;
    return skill;
  }
  return null;
}

function withCount(inventory: Record<string, number>, itemId: string, delta: number): Record<string, number> {
  const next = { ...inventory };
  const count = (next[itemId] ?? 0) + delta;
  if (count > 0) next[itemId] = count;
  else delete next[itemId];
  return next;
}

/** Roll the spoils of a victory. Gold is always drawn first, then the item, so the stream never branches. */
function lootFor(monster: Monster, start: RunState): { run: RunState; event: AccountEvent } {
  let run = start;
  const { gold, items, noneWeight } = monster.lootTable;
  let goldRoll: number;
  [goldRoll, run] = drawInt(run, 'loot', gold.max - gold.min + 1);
  const found = gold.min + goldRoll;
  const itemIds: string[] = [];
  const weights = [...items.map((entry) => entry.weight), noneWeight ?? 0];
  if (weights.reduce((sum, w) => sum + w, 0) > 0) {
    let index: number;
    [index, run] = drawWeighted(run, 'loot', weights);
    const entry = items[index];
    if (entry) itemIds.push(entry.itemId);
  }
  let inventory = run.inventory;
  for (const id of itemIds) inventory = withCount(inventory, id, 1);
  return { run: { ...run, gold: run.gold + found, inventory }, event: { kind: 'loot', gold: found, itemIds } };
}

/**
 * Play one round. A stance action picks a stance (and optionally a skill that fits it); an item action spends the
 * round on a consumable. Refusals that the screen can explain come back as `ok: false` and change nothing; misuse
 * (an unknown skill, a skill that doesn't fit the stance, an item not carried) throws. `god` is for dev mode alone.
 */
export function playRound(loaded: LoadedStory, start: RunState, action: FightAction, god = false): RoundOutcome {
  if (start.status === 'ended') throw new Error('This entry is closed; there is no fight to play.');
  const combat = combatOf(start);
  const monster = monsterOf(loaded, combat);
  const stats = effectiveStats(loaded, start);

  let heroSkill: Skill | null = null;
  let item: Item | null = null;
  let heroStance: Stance3 | null = null;
  if (action.kind === 'stance') {
    heroStance = action.stance;
    if (action.skillId !== undefined) {
      heroSkill = heroSkills(loaded, start).find((s) => s.id === action.skillId) ?? null;
      if (!heroSkill) throw new Error(`The hero has no skill "${action.skillId}".`);
      if (heroSkill.stance !== 'any' && heroSkill.stance !== action.stance) {
        throw new Error(`"${heroSkill.name}" is a ${heroSkill.stance} skill and can't be used with a ${action.stance}.`);
      }
      if ((combat.cooldowns[heroSkill.id] ?? 0) > 0) return { ok: false, reason: 'cooling' };
      if (heroSkill.effect.kind === 'heal' && start.hp >= stats.hp) return { ok: false, reason: 'full-health' };
    }
  } else {
    item = loaded.items.get(action.itemId) ?? null;
    if (!item || item.type !== 'consumable' || !item.use) throw new Error(`"${action.itemId}" can't be used in a fight.`);
    if ((start.inventory[item.id] ?? 0) < 1) throw new Error(`"${item.name}" isn't in the backpack.`);
    if (start.hp >= stats.hp) return { ok: false, reason: 'full-health' };
  }

  // Both damage rolls are drawn every round, used or not, so the stream never depends on how a round turned out.
  let run = start;
  let heroRoll: number;
  let foeRoll: number;
  [heroRoll, run] = drawInt(run, 'combat', HERO_SPREAD);
  [foeRoll, run] = drawInt(run, 'combat', monster.damage.max - monster.damage.min + 1);
  const heroRaw = stats.attack + HERO_BASE + heroRoll;
  const foeRaw = monster.damage.min + foeRoll;

  const foeSkill = foeSkillFor(monster, combat);
  const kindOf = (skill: Skill | null, kind: Skill['effect']['kind']): number => (skill && skill.effect.kind === kind ? skill.effect.amount : 0);

  let result: RoundResult;
  if (heroStance === null) result = combat.intent === 'guard' ? 'idle' : 'open';
  else result = compareStances(heroStance, combat.intent);

  let dealt = 0;
  let taken = 0;
  const heroBlow = heroRaw + kindOf(heroSkill, 'bonusDamage');
  const foeBlow = foeRaw + kindOf(foeSkill, 'bonusDamage');
  if (result === 'win') dealt = heroBlow;
  else if (result === 'lose' || result === 'open') taken = afterDefense(foeBlow, stats.defense, kindOf(heroSkill, 'reduceDamage'));
  else if (result === 'clash') {
    dealt = Math.ceil(heroBlow / 2);
    taken = afterDefense(Math.ceil(foeBlow / 2), stats.defense, kindOf(heroSkill, 'reduceDamage'));
  }
  dealt = Math.max(0, dealt - kindOf(foeSkill, 'reduceDamage'));
  if (god) taken = 0; // dev mode only: the hero is not hurt, and every draw above still happened, so the stream is unchanged

  // Healing lands before damage, on both sides.
  const heroHealed = Math.min(Math.max(0, stats.hp - run.hp), kindOf(heroSkill, 'heal') + (item?.use?.amount ?? 0));
  const foeHealed = Math.min(Math.max(0, monster.hp - combat.foeHp), kindOf(foeSkill, 'heal'));
  const heroHp = run.hp + heroHealed - taken;
  const foeHp = combat.foeHp + foeHealed - dealt;

  const cooldowns: Record<string, number> = {};
  for (const [id, left] of Object.entries(combat.cooldowns)) if (left > 1) cooldowns[id] = left - 1;
  if (heroSkill) cooldowns[heroSkill.id] = heroSkill.cooldown;
  if (foeSkill) cooldowns[foeSkill.id] = foeSkill.cooldown;

  const event: AccountEvent = {
    kind: 'round',
    monsterId: monster.id,
    round: combat.round,
    heroStance,
    foeStance: combat.intent,
    result,
    heroSkillId: heroSkill?.id ?? null,
    foeSkillId: foeSkill?.id ?? null,
    itemId: item?.id ?? null,
    dealt,
    taken,
    heroHealed,
    foeHealed,
    heroHp: Math.max(0, heroHp),
    foeHp: Math.max(0, foeHp),
  };

  let inventory = run.inventory;
  if (item) inventory = withCount(inventory, item.id, -1);
  const settled: RunState = { ...run, hp: Math.max(0, heroHp), inventory };

  // If both fall in the same exchange, the hero's entry is the one that closes: death is final.
  if (heroHp <= 0) {
    return { ok: true, end: 'defeat', run: { ...settled, combat: null, aftermath: [event, { kind: 'defeat' }] } };
  }
  if (foeHp <= 0) {
    const spoils = lootFor(monster, settled);
    const grown = awardXp(loaded, spoils.run, monster);
    return { ok: true, end: 'victory', run: { ...grown.run, combat: null, aftermath: [event, { kind: 'victory', monsterId: monster.id }, spoils.event, ...grown.events] } };
  }
  const base = { monsterId: combat.monsterId, foeHp, round: combat.round + 1, cooldowns, origin: combat.origin, log: [...combat.log, event] };
  return { ok: true, end: null, run: prepareRound(loaded, settled, base) };
}

/** Break off. The foe lands one parting blow (at its weakest, softened by defense, never enough to kill); the story's own flee consequences are applied by the caller. */
export function flee(loaded: LoadedStory, start: RunState): RunState {
  if (start.status === 'ended') throw new Error('This entry is closed; there is no fight to flee.');
  const combat = combatOf(start);
  const monster = monsterOf(loaded, combat);
  const blow = Math.max(1, monster.damage.min - effectiveStats(loaded, start).defense);
  const hp = Math.max(1, start.hp - blow);
  return { ...start, hp, combat: null, aftermath: [{ kind: 'flee', blow: start.hp - hp, heroHp: hp }] };
}

/**
 * Whether a run's fight is whole: the monster exists, HP and round are in range, the stances are real, the origin
 * points at something that exists. Stage 5 runs this on every loaded save, so a damaged mid-fight state is refused
 * (with a way out) instead of played.
 */
export function combatProblem(loaded: LoadedStory, run: RunState): string | null {
  const combat = run.combat;
  if (!combat) return null;
  const monster = loaded.monsters.get(combat.monsterId);
  if (!monster) return `the fight names the monster "${combat.monsterId}", which the story doesn't define`;
  if (!Number.isInteger(combat.foeHp) || combat.foeHp < 1 || combat.foeHp > monster.hp) return `the foe's HP (${combat.foeHp}) is outside 1 to ${monster.hp}`;
  if (!Number.isInteger(combat.round) || combat.round < 1) return `the round number (${combat.round}) is not a whole number from 1`;
  if (!STANCES.includes(combat.intent)) return 'the foe has no valid stance';
  if (combat.tell !== null && combat.tell !== combat.intent) return 'the tell disagrees with the foe\'s stance';
  if (!Number.isInteger(run.hp) || run.hp < 1) return `the hero's HP (${run.hp}) can't be in a live fight`;
  for (const [id, left] of Object.entries(combat.cooldowns)) {
    if (!Number.isInteger(left) || left < 1) return `the cooldown for "${id}" is not a positive whole number`;
  }
  if (combat.origin.kind === 'scene') {
    const scene = loaded.scenes.get(run.sceneId);
    if (!scene || scene.type !== 'fight' || scene.fight.monsterId !== combat.monsterId) return 'the fight scene and the monster disagree';
  } else {
    const entry = loaded.pools.get(combat.origin.chapterId)?.[combat.origin.entryIndex];
    if (!entry || entry.type !== 'fight' || entry.monsterId !== combat.monsterId) return 'the encounter entry and the monster disagree';
    if (run.returnStack.length === 0) return 'an encounter fight has nowhere to return to';
  }
  return null;
}
