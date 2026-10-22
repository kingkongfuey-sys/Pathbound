// Applying a list of effects to a run. Returns a new run and the narrative lines to show; nothing is mutated.
// Item and stat gains are told as lines of story (the effect's `note`), never as pop-ups.
import { render } from '../content/tokens.ts';
import type { TokenContext } from '../content/tokens.ts';
import type { Effect, LoadedStory } from '../content/types.ts';
import { effectiveStats } from './conditions.ts';
import type { RunState } from './types.ts';

export function tokenContext(loaded: LoadedStory, run: RunState): TokenContext {
  return { name: run.heroName, pronouns: run.pronouns, currencyName: loaded.story.currency.name };
}

export function applyEffects(
  loaded: LoadedStory,
  start: RunState,
  effects: Effect[] | undefined,
): { run: RunState; notes: string[] } {
  if (!effects) return { run: start, notes: [] };
  let run: RunState = {
    ...start,
    stats: { ...start.stats },
    inventory: { ...start.inventory },
    equipment: { ...start.equipment },
    flags: { ...start.flags },
  };
  const notes: string[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'stat': {
        const next = Math.max(effect.stat === 'hp' ? 1 : 0, run.stats[effect.stat] + effect.delta);
        run.stats[effect.stat] = next;
        if (effect.stat === 'hp') {
          const max = effectiveStats(loaded, run).hp;
          run.hp = effect.delta > 0 ? run.hp + effect.delta : Math.min(run.hp, max);
        }
        break;
      }
      case 'hp': {
        const max = effectiveStats(loaded, run).hp;
        run.hp = Math.min(max, run.hp + effect.delta);
        break;
      }
      case 'gold':
        run.gold = Math.max(0, run.gold + effect.delta);
        break;
      case 'item': {
        const quantity = effect.quantity ?? 1;
        if (effect.change === 'give') {
          run.inventory[effect.itemId] = (run.inventory[effect.itemId] ?? 0) + quantity;
        } else {
          const carried = run.inventory[effect.itemId] ?? 0;
          if (carried > 0) {
            const left = carried - quantity;
            if (left > 0) run.inventory[effect.itemId] = left;
            else delete run.inventory[effect.itemId];
          } else {
            for (const slot of Object.keys(run.equipment) as Array<keyof RunState['equipment']>) {
              if (run.equipment[slot] === effect.itemId) run.equipment[slot] = null;
            }
          }
        }
        break;
      }
      case 'flag':
        run.flags[effect.flag] = effect.value;
        break;
    }
    if (effect.type !== 'flag') notes.push(render(effect.note, tokenContext(loaded, run)));
  }
  run = { ...run };
  return { run, notes };
}
