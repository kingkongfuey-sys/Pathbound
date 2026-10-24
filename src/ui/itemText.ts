// How an item reads wherever it is listed (the satchel, a shop): "Attack +2, Wits +1." or "Restores 6 HP.", then the
// item's own flavour line. One place, so a stat can't be worded two ways on two pages. `itemEntry` is the ledger line
// both pages hang an item on: its name, a dotted leader, and the one thing that can be done with it.
import { voice } from '../copy/voice.ts';
import type { Item, StatName } from '../content/types.ts';
import { el } from './dom.ts';

const STAT_ORDER: StatName[] = ['hp', 'attack', 'defense', 'wits', 'nerve'];

export function describeItem(item: Item): string {
  const parts: string[] = [];
  const modifiers = item.modifiers ?? {};
  for (const stat of STAT_ORDER) {
    const delta = modifiers[stat];
    if (delta) parts.push(voice.satchel.change(voice.statNames[stat], delta));
  }
  const effect = parts.length > 0 ? `${parts.join(', ')}.` : item.use ? voice.satchel.heals(item.use.amount) : '';
  return effect === '' ? item.flavor : `${effect} ${item.flavor}`;
}

export function itemEntry(name: string, item: Item | null, action: HTMLElement | null): HTMLElement {
  return el(
    'li',
    'entry',
    el('div', 'entry-head', el('span', item ? 'entry-name' : 'entry-name entry-empty', name), action ? el('span', 'leader') : null, action),
    item ? el('p', 'entry-detail', describeItem(item)) : null,
  );
}
