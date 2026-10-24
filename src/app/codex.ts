// What the codex shows, worked out from a story and the unlocks the record book holds. Pure (no DOM, no storage) so
// it can be tested: which foes, items and lore of a story have been met, in the order the story defines them, and
// how many there are in all. Anything unlocked under an id the story no longer defines is quietly left out; the
// unlock stays in the book for if the id comes back.
import type { Item, LoadedStory, Monster, Story } from '../content/types.ts';
import type { Unlock } from '../save/types.ts';

export interface CodexStory {
  story: Story;
  /** The tale itself is met from the first page of the first entry. */
  taleMet: boolean;
  foes: Monster[];
  foesTotal: number;
  items: Item[];
  itemsTotal: number;
  lore: Story['loreEntries'];
  loreTotal: number;
}

export function codexOf(loaded: LoadedStory, unlocks: Unlock[]): CodexStory {
  const id = loaded.story.id;
  const met = (kind: Unlock['kind']): Set<string> => new Set(unlocks.filter((u) => u.storyId === id && u.kind === kind).map((u) => u.entryId));
  const foes = met('monster');
  const items = met('item');
  const lore = met('lore');
  return {
    story: loaded.story,
    taleMet: met('story').has(id),
    foes: [...loaded.monsters.values()].filter((m) => foes.has(m.id)),
    foesTotal: loaded.monsters.size,
    items: [...loaded.items.values()].filter((i) => items.has(i.id)),
    itemsTotal: loaded.items.size,
    lore: loaded.story.loreEntries.filter((l) => lore.has(l.id)),
    loreTotal: loaded.story.loreEntries.length,
  };
}
