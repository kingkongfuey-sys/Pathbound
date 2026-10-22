// Evaluating a choice's conditions against a run. All conditions on a choice must hold (AND).
import type { Comparator, Condition, LoadedStory, StatBlock } from '../content/types.ts';
import type { RunState } from './types.ts';

function compare(left: number, op: Comparator, right: number): boolean {
  switch (op) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '<': return left < right;
    case '==': return left === right;
    case '!=': return left !== right;
  }
}

/** Base stats plus whatever the hero has equipped. */
export function effectiveStats(loaded: LoadedStory, run: RunState): StatBlock {
  const total: StatBlock = { ...run.stats };
  for (const itemId of Object.values(run.equipment)) {
    if (itemId === null) continue;
    const modifiers = loaded.items.get(itemId)?.modifiers;
    if (!modifiers) continue;
    for (const key of Object.keys(modifiers) as Array<keyof StatBlock>) total[key] += modifiers[key] ?? 0;
  }
  return total;
}

export function countOf(run: RunState, itemId: string): number {
  const carried = run.inventory[itemId] ?? 0;
  const worn = Object.values(run.equipment).filter((id) => id === itemId).length;
  return carried + worn;
}

export function meets(loaded: LoadedStory, run: RunState, conditions: Condition[] | undefined): boolean {
  if (!conditions) return true;
  return conditions.every((condition) => {
    switch (condition.type) {
      case 'stat': {
        const value = condition.stat === 'hp' ? run.hp : effectiveStats(loaded, run)[condition.stat];
        return compare(value, condition.op, condition.value);
      }
      case 'gold':
        return compare(run.gold, condition.op, condition.value);
      case 'item':
        return (countOf(run, condition.itemId) > 0) === (condition.has ?? true);
      case 'flag':
        return (run.flags[condition.flag] ?? false) === (condition.is ?? true);
    }
  });
}
